import { json, error } from '@sveltejs/kit';
import { assertAiAccess } from '$lib/server/tier';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { rateLimitUser } from '$lib/server/rateLimit';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS: Anthropic.Tool[] = [
	{
		name: 'search_contacts',
		description: 'Search contacts by name, company, or status. Use to answer questions about specific people or filter groups.',
		input_schema: {
			type: 'object' as const,
			properties: {
				query: { type: 'string', description: 'Name or company to search for' },
				status: { type: 'string', enum: ['active', 'do_not_call', 'inactive'], description: 'Filter by status' },
				contact_type: { type: 'string', description: 'lead, prospect, customer, partner, vendor, creator' },
				limit: { type: 'number', description: 'Max results (default 10)' },
			},
		},
	},
	{
		name: 'get_tasks',
		description: 'Get tasks — overdue, pending, completed, or for a specific contact.',
		input_schema: {
			type: 'object' as const,
			properties: {
				status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
				overdue_only: { type: 'boolean', description: 'Only return overdue tasks' },
				limit: { type: 'number', description: 'Max results (default 10)' },
			},
		},
	},
	{
		name: 'get_calls',
		description: 'Get recent call history with outcomes, summaries, and contact info.',
		input_schema: {
			type: 'object' as const,
			properties: {
				outcome: { type: 'string', description: 'Filter by outcome: answered, voicemail, callback, not_interested, no_answer' },
				days_back: { type: 'number', description: 'How many days back to look (default 7)' },
				limit: { type: 'number', description: 'Max results (default 10)' },
			},
		},
	},
	{
		name: 'get_campaigns',
		description: 'Get active campaigns with their call lists and contact counts.',
		input_schema: {
			type: 'object' as const,
			properties: {
				status: { type: 'string', description: 'active, paused, completed' },
			},
		},
	},
	{
		name: 'get_stats',
		description: 'Get summary stats: call counts, outcomes breakdown, active deals, task completion rate.',
		input_schema: {
			type: 'object' as const,
			properties: {
				period: { type: 'string', enum: ['today', 'week', 'month'], description: 'Time period for stats' },
			},
		},
	},
	{
		name: 'get_pipeline',
		description: 'Get deals in the pipeline by stage.',
		input_schema: {
			type: 'object' as const,
			properties: {
				stage: { type: 'string', description: 'prospect, qualified, demo, proposal, negotiation, won, lost' },
			},
		},
	},
	{
		name: 'create_task',
		description: 'Create a new task or follow-up in RogueOS. Use when the user says "add a task", "remind me to", "create a follow-up", "schedule a callback", etc.',
		input_schema: {
			type: 'object' as const,
			properties: {
				title: { type: 'string', description: 'Task title' },
				task_type: { type: 'string', enum: ['call', 'follow_up', 'email', 'task', 'callback', 'demo'], description: 'Type of task' },
				priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'], description: 'Priority level' },
				due_date: { type: 'string', description: 'Due date in ISO format or natural language like "tomorrow", "next Monday"' },
				notes: { type: 'string', description: 'Optional notes for the task' },
				contact_name: { type: 'string', description: 'Contact name to associate with the task (will be looked up)' },
			},
			required: ['title'],
		},
	},
	{
		name: 'search_records',
		description: 'Search for contacts, deals, campaigns, or calls by name/keyword. Use when user asks "find X", "look up X", "who is X", "show me X".',
		input_schema: {
			type: 'object' as const,
			properties: {
				query: { type: 'string', description: 'Search term' },
				entity: { type: 'string', enum: ['contacts', 'deals', 'campaigns', 'calls', 'clients'], description: 'What to search' },
			},
			required: ['query'],
		},
	},
	{
		name: 'navigate_to',
		description: 'Navigate the user to a specific page in RogueOS. Use when user says "go to", "open", "take me to", "show me the X page".',
		input_schema: {
			type: 'object' as const,
			properties: {
				page: { type: 'string', enum: ['dashboard', 'contacts', 'phone', 'dialer', 'campaigns', 'projects', 'clients', 'pipeline', 'analytics', 'financials', 'tasks', 'settings', 'sequences', 'numbers', 'docs', 'reports', 'trash', 'import', 'leads'], description: 'Page to navigate to' },
				contact_id: { type: 'string', description: 'Optional contact ID to open directly' },
			},
			required: ['page'],
		},
	},
	{
		name: 'log_activity',
		description: 'Log a call note, meeting note, or activity on a contact. Use when user says "log a call with X", "note that X said", "record a meeting with".',
		input_schema: {
			type: 'object' as const,
			properties: {
				contact_name: { type: 'string', description: 'Name of the contact' },
				activity_type: { type: 'string', enum: ['call', 'note', 'email', 'meeting', 'demo', 'follow_up', 'linkedin', 'other'], description: 'Type of activity' },
				description: { type: 'string', description: 'What happened, what was discussed, outcome' },
				outcome: { type: 'string', description: 'Call/meeting outcome (e.g. interested, callback, voicemail)' },
			},
			required: ['contact_name', 'description'],
		},
	},
	{
		name: 'get_tutorial',
		description: 'Get a tutorial or explanation of a RogueOS feature. Use when user asks "how do I", "what is", "explain", "help me with", "how does X work".',
		input_schema: {
			type: 'object' as const,
			properties: {
				topic: { type: 'string', description: 'The feature or concept to explain', enum: ['campaigns', 'power_dialer', 'sequences', 'contacts', 'pipeline', 'automations', 'import', 'phone_numbers', 'call_scripts', 'analytics', 'invoicing', 'time_tracking', 'client_portal', 'widgets', 'snippets', 'voicemail_drop', 'bulk_actions'] },
			},
			required: ['topic'],
		},
	},
	{
		name: 'update_contact',
		description: 'Update a contact\'s status, notes, or tags. Use when the user says things like "mark Bryan as callback", "add tag \'warm\' to Sarah", "update John\'s notes".',
		input_schema: {
			type: 'object' as const,
			properties: {
				contact_id: { type: 'string', description: 'Contact ID' },
				contact_name: { type: 'string', description: 'Contact name to search if ID unknown' },
				updates: {
					type: 'object',
					properties: {
						status: { type: 'string', enum: ['active', 'callback', 'do_not_call', 'inactive'] },
						notes: { type: 'string' },
						tags: { type: 'array', items: { type: 'string' }, description: 'Tags to ADD (not replace)' },
					}
				}
			},
			required: ['updates']
		}
	},
	{
		name: 'get_contact_detail',
		description: 'Get full details for a specific contact including recent calls, emails, tasks, and deals. Use when user asks "tell me about Bryan" or "what\'s the history with Sarah at Acme".',
		input_schema: {
			type: 'object' as const,
			properties: {
				contact_name: { type: 'string', description: 'Name to search' },
				contact_id: { type: 'string', description: 'Contact ID if known' },
			}
		}
	},
];

// ── Due date helpers ──────────────────────────────────────────────────────────
function offsetToDay(from: Date, targetDay: number): string {
	const current = from.getDay();
	let diff = targetDay - current;
	if (diff <= 0) diff += 7;
	return new Date(from.getTime() + diff * 86400000).toISOString();
}

function parseDueDate(input: string | undefined): string | null {
	if (!input) return null;
	const lower = input.toLowerCase().trim();
	const now = new Date();

	if (lower === 'today') return now.toISOString();
	if (lower === 'tomorrow') return new Date(now.getTime() + 86400000).toISOString();
	if (lower === 'next week' || lower === 'next monday') {
		const days = (1 + 7 - now.getDay()) % 7 || 7;
		return new Date(now.getTime() + days * 86400000).toISOString();
	}
	if (lower.includes('monday')) return offsetToDay(now, 1);
	if (lower.includes('tuesday')) return offsetToDay(now, 2);
	if (lower.includes('wednesday')) return offsetToDay(now, 3);
	if (lower.includes('thursday')) return offsetToDay(now, 4);
	if (lower.includes('friday')) return offsetToDay(now, 5);
	if (lower.includes('saturday')) return offsetToDay(now, 6);
	if (lower.includes('sunday')) return offsetToDay(now, 0);

	const inNDays = lower.match(/in (\d+) day/);
	if (inNDays) return new Date(now.getTime() + parseInt(inNDays[1]) * 86400000).toISOString();

	// Try native Date parse as fallback
	const parsed = new Date(input);
	if (!isNaN(parsed.getTime())) return parsed.toISOString();

	return null;
}

// ── Tool executors ─────────────────────────────────────────────────────────────
async function executeTool(name: string, input: Record<string, unknown>, ownerId: string): Promise<string> {
	try {
		if (name === 'search_contacts') {
			let q = supabaseAdmin.from('contacts')
				.select('id, name, company, phone, email, status, contact_type, call_count, last_called_at')
				.eq('user_id', ownerId)
				.limit(Number(input.limit ?? 10));
			if (input.query) q = q.or(`name.ilike.%${input.query}%,company.ilike.%${input.query}%`);
			if (input.status) q = q.eq('status', input.status as string);
			if (input.contact_type) q = q.eq('contact_type', input.contact_type as string);
			const { data } = await q;
			return JSON.stringify(data ?? []);
		}

		if (name === 'get_tasks') {
			let q = supabaseAdmin.from('tasks')
				.select('id, title, description, priority, status, due_date, task_type, contact:contacts(name, company)')
				.eq('user_id', ownerId)
				.order('due_date', { ascending: true, nullsFirst: false })
				.limit(Number(input.limit ?? 10));
			if (input.status) q = q.eq('status', input.status as string);
			else q = q.neq('status', 'cancelled');
			if (input.overdue_only) q = q.lt('due_date', new Date().toISOString()).eq('status', 'pending');
			const { data } = await q;
			return JSON.stringify(data ?? []);
		}

		if (name === 'get_calls') {
			const daysBack = Number(input.days_back ?? 7);
			const since = new Date(Date.now() - daysBack * 86400000).toISOString();
			let q = supabaseAdmin.from('calls')
				.select('id, outcome, summary, call_duration_seconds, created_at, contact:contacts(name, company, phone)')
				.eq('user_id', ownerId)
				.gte('created_at', since)
				.order('created_at', { ascending: false })
				.limit(Number(input.limit ?? 10));
			if (input.outcome) q = q.eq('outcome', input.outcome as string);
			const { data } = await q;
			return JSON.stringify(data ?? []);
		}

		if (name === 'get_campaigns') {
			let q = supabaseAdmin.from('campaigns')
				.select('id, name, status, call_lists(id, name, call_list_contacts(count))')
				.eq('user_id', ownerId)
				.order('name');
			if (input.status) q = q.eq('status', input.status as string);
			const { data } = await q;
			return JSON.stringify(data ?? []);
		}

		if (name === 'get_stats') {
			const period = (input.period as string) ?? 'week';
			let since: string;
			if (period === 'today') since = new Date().toISOString().slice(0, 10);
			else if (period === 'month') since = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
			else since = new Date(Date.now() - 7 * 86400000).toISOString();

			const [callsRes, tasksRes, dealsRes] = await Promise.all([
				supabaseAdmin.from('calls').select('outcome').eq('user_id', ownerId).gte('created_at', since),
				supabaseAdmin.from('tasks').select('status').eq('user_id', ownerId),
				supabaseAdmin.from('deals').select('stage, value').eq('user_id', ownerId).not('stage', 'in', '("won","lost")'),
			]);

			const calls = callsRes.data ?? [];
			const outcomes: Record<string, number> = {};
			for (const c of calls) outcomes[c.outcome ?? 'unlogged'] = (outcomes[c.outcome ?? 'unlogged'] ?? 0) + 1;

			const tasks = tasksRes.data ?? [];
			const taskStats = { pending: 0, completed: 0, overdue: 0 };
			const now = Date.now();
			for (const t of tasks) {
				if (t.status === 'completed') taskStats.completed++;
				else if (t.status === 'pending') {
					taskStats.pending++;
				}
			}

			const deals = dealsRes.data ?? [];
			const pipelineValue = deals.reduce((s, d) => s + (d.value ?? 0), 0);

			return JSON.stringify({ period, totalCalls: calls.length, outcomes, taskStats, pipelineDeals: deals.length, pipelineValue });
		}

		if (name === 'get_pipeline') {
			let q = supabaseAdmin.from('deals')
				.select('id, title, stage, value, probability, expected_close, contact:contacts(name, company)')
				.eq('user_id', ownerId)
				.order('value', { ascending: false });
			if (input.stage) q = q.eq('stage', input.stage as string);
			const { data } = await q.limit(20);
			return JSON.stringify(data ?? []);
		}

		if (name === 'create_task') {
			const { title, task_type, priority, due_date, notes, contact_name } = input as Record<string, string>;

			// Resolve due date
			const resolvedDate = parseDueDate(due_date);

			// Find contact if specified
			let contactId: string | null = null;
			if (contact_name) {
				const { data: contacts } = await supabaseAdmin.from('contacts').select('id, name').eq('user_id', ownerId).ilike('name', `%${contact_name}%`).limit(1);
				contactId = contacts?.[0]?.id ?? null;
			}

			const { data: task, error: taskErr } = await supabaseAdmin.from('tasks').insert({
				user_id: ownerId,
				title,
				task_type: task_type ?? 'task',
				priority: priority ?? 'medium',
				status: 'pending',
				due_date: resolvedDate,
				description: notes,
				contact_id: contactId,
			}).select().single();

			if (taskErr) return JSON.stringify({ error: `Failed to create task: ${taskErr.message}` });
			return JSON.stringify({ created: true, task: { id: task.id, title: task.title, due_date: task.due_date, priority: task.priority }, contact: contactId ? contact_name : null });
		}

		if (name === 'search_records') {
			const { query, entity = 'contacts' } = input as { query: string; entity?: string };
			const like = `%${query}%`;

			let results: any[] = [];
			if (entity === 'contacts') {
				const { data } = await supabaseAdmin.from('contacts').select('id, name, company, phone, email, status').eq('user_id', ownerId).is('deleted_at', null).or(`name.ilike.${like},company.ilike.${like},phone.ilike.${like}`).limit(8);
				results = data ?? [];
			} else if (entity === 'deals') {
				const { data } = await supabaseAdmin.from('deals').select('id, name, value, stage, contact:contacts(name)').eq('user_id', ownerId).is('deleted_at', null).ilike('name', like).limit(8);
				results = data ?? [];
			} else if (entity === 'campaigns') {
				const { data } = await supabaseAdmin.from('campaigns').select('id, name, status').eq('user_id', ownerId).is('deleted_at', null).ilike('name', like).limit(8);
				results = data ?? [];
			} else if (entity === 'calls') {
				const { data } = await supabaseAdmin
					.from('calls')
					.select('id, created_at, outcome, phone_number, call_duration_seconds, contact:contacts(name, company)')
					.eq('user_id', ownerId)
					.or(`phone_number.ilike.${like},outcome.ilike.${like}`)
					.order('created_at', { ascending: false })
					.limit(8);
				results = data ?? [];
			} else if (entity === 'clients') {
				const { data } = await supabaseAdmin.from('clients').select('id, name').eq('user_id', ownerId).is('deleted_at', null).ilike('name', like).limit(8);
				results = data ?? [];
			}

			return JSON.stringify({ entity, query, count: results.length, results });
		}

		if (name === 'navigate_to') {
			const { page, contact_id } = input as { page: string; contact_id?: string };
			const paths: Record<string, string> = {
				dashboard: '/dashboard', contacts: '/contacts', phone: '/phone', dialer: '/dialer',
				campaigns: '/campaigns', projects: '/projects', clients: '/clients', pipeline: '/pipeline',
				analytics: '/analytics', financials: '/financials', tasks: '/tasks', settings: '/settings',
				sequences: '/sequences', numbers: '/numbers', docs: '/docs', reports: '/reports',
				trash: '/trash', import: '/import', leads: '/leads',
			};
			const path = contact_id ? `/contacts/${contact_id}` : (paths[page] ?? `/${page}`);
			return JSON.stringify({ navigate: true, path, page });
		}

		if (name === 'log_activity') {
			const { contact_name, activity_type, description, outcome } = input as Record<string, string>;

			const { data: contacts } = await supabaseAdmin.from('contacts').select('id, name').eq('user_id', ownerId).is('deleted_at', null).ilike('name', `%${contact_name}%`).limit(1);
			const contact = contacts?.[0];

			if (!contact) return JSON.stringify({ error: `Contact "${contact_name}" not found` });

			await supabaseAdmin.from('contact_activities').insert({
				user_id: ownerId,
				contact_id: contact.id,
				activity_type: activity_type ?? 'note',
				description,
				outcome: outcome ?? null,
				scheduled_at: new Date().toISOString(),
			});
			return JSON.stringify({ logged: true, contact: contact.name, type: activity_type, description });
		}

		if (name === 'get_tutorial') {
			const { topic } = input as { topic: string };
			const tutorials: Record<string, string> = {
				campaigns: 'RogueOS campaigns work in a hierarchy: Clients → Projects → Campaigns → Call Lists → Contacts. Create a Client first, then a Project under it, then a Campaign, then a Call List, then import contacts into that list. The Campaign Dialer (/dialer) auto-dials through your call lists.',
				power_dialer: 'The Power Dialer auto-advances to the next contact after each call ends. Enable it with the ⚡ button in the Campaign Dialer header. After saving a call outcome, it counts down 3 seconds then dials automatically. You can skip or cancel the countdown.',
				sequences: 'Sequences are automated email drip campaigns. Create them at /sequences — give them a name, trigger (manual/lead arrived/call completed), and define steps (subject + body + delay in days). Enroll contacts manually or via automations. The system advances steps daily via cron.',
				contacts: 'Contacts live at /contacts. Import via CSV (Import Center), scrape from websites (Lead Gen), or add manually. Each contact has a timeline showing all calls, SMS, emails, and activities. Use bulk select to run actions on multiple contacts at once.',
				pipeline: 'The deal pipeline is at /pipeline — a Kanban board with stages (Prospect → Qualified → Demo → Proposal → Negotiation → Won/Lost). Drag deals between stages. Deals can be linked to contacts and clients. Won deals update your revenue quota.',
				automations: 'Automations at /automations trigger on events (new lead, call completed, etc.) and run actions (create task, add tag, send SMS, change status). Enable/disable each rule with the toggle. Run counts track how many times each automation has fired.',
				import: 'Import contacts at /import — paste or upload a CSV, map columns (Name, Phone, Email, Company, Title), then import. Duplicates are detected by phone number. You can assign imported contacts to a call list during import.',
				phone_numbers: 'Manage phone numbers at /numbers — buy new numbers directly (search by area code or toll-free), configure forwarding, voicemail greetings, and SMS. The A2P section shows your 10DLC registration status for SMS compliance.',
				call_scripts: 'Call scripts live at /scripts. Build structured scripts with sections (opener, pitch, objections, close). During a call in the Campaign Dialer, the script panel appears on the right — click sections to expand them and follow along.',
				analytics: 'Analytics at /analytics shows call outcomes, talk time, cost per call, connect rate, and best times to call. Switch to Revenue view for deal pipeline value by month. Filter by campaign, project, or client.',
				invoicing: 'Create invoices at /financials → Invoices tab. Link to a client, set contract type (invoice/retainer/project/hourly), add expected hours, and scope of work. Retainer invoices can link to projects for time tracking.',
				time_tracking: 'Track time at /time or via the Project Timer widget on the dashboard. Select a project, start the timer, stop when done — it logs time entries. View totals by project and week. Time entries link to invoices.',
				client_portal: 'Client portal lets clients log in and see only their data. Invite them via Team → check "Client Portal Access" → select their client. They get a read-only dashboard with their contacts, campaigns, call stats, and deals.',
				widgets: 'The dashboard is fully customizable — click "+ Add Widget" to add widgets, drag to reorder, click ⚙ to resize (1×/2×/3× wide, S/M/L/XL tall). The top band (Chrono Nexus, etc.) is also configurable — click "⚙ Configure" on it.',
				snippets: 'Text snippets at /snippets expand when you type the trigger and press Tab. E.g. create a snippet with trigger "/intro" and it expands to your full introduction. Works in SMS, email, and notes fields.',
				voicemail_drop: 'Voicemail drops let you leave a pre-recorded message with one click when a call goes to voicemail. Set them up at /settings → Voicemail Drops. During a call, click "Drop VM" to leave the recording and end the call.',
				bulk_actions: 'Select contacts with checkboxes, then use the bulk action bar to: create tasks for all, send SMS, add tags, change status, log activity, or move to a call list. The log activity bulk action is great after a calling session.',
			};
			return JSON.stringify({ topic, tutorial: tutorials[topic] ?? 'Tutorial not found for that topic' });
		}

		if (name === 'update_contact') {
			const { contact_id, contact_name, updates } = input as any;

			let contactId = contact_id;
			if (!contactId && contact_name) {
				const { data: found } = await supabaseAdmin
					.from('contacts')
					.select('id, name')
					.eq('user_id', ownerId)
					.ilike('name', `%${contact_name}%`)
					.is('deleted_at', null)
					.limit(1)
					.single();
				contactId = found?.id;
				if (!contactId) return JSON.stringify({ error: `Contact "${contact_name}" not found` });
			}

			const updatePayload: Record<string, unknown> = {};
			if (updates.status) updatePayload.status = updates.status;
			if (updates.notes) updatePayload.notes = updates.notes;

			if (updates.tags?.length) {
				// Merge tags, don't replace
				const { data: existing } = await supabaseAdmin
					.from('contacts').select('tags').eq('id', contactId).single();
				const currentTags: string[] = existing?.tags ?? [];
				const newTags = Array.from(new Set([...currentTags, ...updates.tags]));
				updatePayload.tags = newTags;
			}

			if (Object.keys(updatePayload).length === 0) return JSON.stringify({ error: 'No updates specified' });

			const { error: updateErr } = await supabaseAdmin
				.from('contacts').update(updatePayload).eq('id', contactId);

			if (updateErr) return JSON.stringify({ error: updateErr.message });
			return JSON.stringify({ success: true, updated: Object.keys(updatePayload) });
		}

		if (name === 'get_contact_detail') {
			const { contact_id, contact_name } = input as any;

			let query = supabaseAdmin
				.from('contacts')
				.select('id, name, company, phone, email, status, contact_type, contact_score, tags, notes, last_called_at')
				.eq('user_id', ownerId)
				.is('deleted_at', null);

			if (contact_id) query = query.eq('id', contact_id);
			else if (contact_name) query = query.ilike('name', `%${contact_name}%`);

			const { data: contact } = await query.limit(1).single();
			if (!contact) return JSON.stringify({ error: 'Contact not found' });

			// Get recent calls
			const { data: calls } = await supabaseAdmin
				.from('calls')
				.select('outcome, duration_seconds, summary, created_at')
				.eq('contact_id', contact.id)
				.order('created_at', { ascending: false })
				.limit(5);

			// Get open tasks
			const { data: tasks } = await supabaseAdmin
				.from('tasks')
				.select('title, status, due_date, priority')
				.eq('contact_id', contact.id)
				.neq('status', 'completed')
				.limit(5);

			// Get open deals
			const { data: deals } = await supabaseAdmin
				.from('deals')
				.select('name, value, stage')
				.eq('contact_id', contact.id)
				.not('stage', 'in', '(won,lost)')
				.limit(3);

			return JSON.stringify({ contact, recentCalls: calls ?? [], openTasks: tasks ?? [], openDeals: deals ?? [] });
		}

		return JSON.stringify({ error: `Unknown tool: ${name}` });
	} catch (err) {
		console.error('[ai/chat] executeTool error:', err);
		return JSON.stringify({ error: err instanceof Error ? err.message : 'Tool execution failed' });
	}
}

// ── Main handler ──────────────────────────────────────────────────────────────
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	await assertAiAccess(user.id);
	if (await rateLimitUser(user.id, { max: 30, windowMs: 60_000 })) throw error(429, 'Rate limit exceeded — max 30 AI requests/minute');
	const ownerId = await getEffectiveUserId(user.id);

	const { messages, systemPrompt: customSystem } = await request.json();

	const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
	const systemPrompt = customSystem ?? `You are RogueOS AI — a sales intelligence assistant embedded in a CRM. You help manage contacts, calls, tasks, campaigns, and pipeline.

Use tools to look up live data. Be concise and actionable. Today is ${today}.`;

	let loopMessages: Anthropic.MessageParam[] = messages;
	let finalResponse = '';

	for (let round = 0; round < 5; round++) {
		const response = await anthropic.messages.create({
			model: 'claude-sonnet-4-6',
			max_tokens: 2000,
			system: systemPrompt,
			tools: TOOLS,
			messages: loopMessages,
		});

		if (response.stop_reason === 'end_turn') {
			const textBlock = response.content.find(b => b.type === 'text');
			finalResponse = textBlock?.type === 'text' ? textBlock.text : '';
			break;
		}

		if (response.stop_reason === 'tool_use') {
			const assistantMsg: Anthropic.MessageParam = { role: 'assistant', content: response.content };
			const toolResults: Anthropic.ToolResultBlockParam[] = [];
			for (const block of response.content) {
				if (block.type === 'tool_use') {
					const result = await executeTool(block.name, block.input as Record<string, unknown>, ownerId);
					toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
				}
			}
			loopMessages = [...loopMessages, assistantMsg, { role: 'user', content: toolResults }];
			continue;
		}
		break;
	}

	return json({ message: finalResponse, messages: loopMessages });
};
