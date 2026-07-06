import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getUserRole, getEffectiveUserId } from '$lib/server/supabase';
import { incrementQuota } from '$lib/server/quotas';
import { deliverWebhooks } from '$lib/server/webhooks';
import { processCadence } from '$lib/server/cadence';
import { env } from '$env/dynamic/private';
import { BRAND } from '$lib/brand';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);

	const { data, error: dbErr } = await supabaseAdmin
		.from('calls')
		.select('*')
		.eq('id', params.id)
		.eq('user_id', user.id)
		.single();

	if (dbErr || !data) throw error(404, 'Call not found');
	return json(data);
};

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const body = await request.json();

	const { notes, outcome, contact_id } = body;

	const { error: callErr } = await supabaseAdmin
		.from('calls')
		.update({ notes, outcome })
		.eq('id', params.id)
		.eq('user_id', user.id);

	if (callErr) throw error(500, callErr.message);

	// Mark contact as 'called' in call_list_contacts AND campaign_contacts
	const { data: callRecord } = await supabaseAdmin
		.from('calls').select('contact_id, call_list_id, campaign_id').eq('id', params.id).eq('user_id', user.id).single();
	if (callRecord?.contact_id && callRecord?.call_list_id) {
		await supabaseAdmin
			.from('call_list_contacts')
			.update({ status: 'called', last_called_at: new Date().toISOString() })
			.eq('call_list_id', callRecord.call_list_id)
			.eq('contact_id', callRecord.contact_id);
	}
	// Also update campaign_contacts for contacts added directly (no call list)
	if (callRecord?.contact_id) {
		await supabaseAdmin.from('campaign_contacts')
			.update({ last_called_at: new Date().toISOString() } as any)
			.eq('contact_id', callRecord.contact_id);
	}

	// Update contact status if outcome is do_not_call
	if (contact_id && outcome === 'do_not_call') {
		await supabaseAdmin
			.from('contacts')
			.update({ status: 'do_not_call' })
			.eq('id', contact_id)
			.eq('user_id', user.id);
	}

	// Count all dials toward quota (not just answered)
	incrementQuota(user.id, 'calls', 1).catch(console.error);

	if (callRecord?.contact_id) {
		import('$lib/server/automations').then(({ runAutomations }) =>
			runAutomations(user.id, 'call_completed', { contactId: callRecord.contact_id, callOutcome: outcome })
		).catch(console.error);
	}

	if (body.outcome) {
		deliverWebhooks(user.id, 'call_completed', {
			callId: params.id, outcome: body.outcome, notes: body.notes,
			contactId: callRecord?.contact_id,
		}).catch(console.error);
	}


	// ── Client win notification — instant email when appointment set ──────────
	const WIN_NOTIFY = new Set(['appointment_set','demo_scheduled','meeting_confirmed','signed_up']);
	if (body.outcome && WIN_NOTIFY.has(body.outcome) && callRecord?.campaign_id) {
		(async () => {
			try {
				const ownerId = await getEffectiveUserId(user.id);
				// Find client email via campaign → project → client
				const { data: camp } = await supabaseAdmin
					.from('campaigns')
					.select('project:projects(client:clients(primary_contact_email, name, primary_contact_name))')
					.eq('id', callRecord.campaign_id)
					.maybeSingle();
				const clientEmail = (camp?.project as any)?.client?.primary_contact_email;
				const clientName  = (camp?.project as any)?.client?.primary_contact_name ?? 'there';
				const clientBizName = (camp?.project as any)?.client?.name ?? 'Your campaign';

				if (clientEmail) {
					const { data: contactRow } = await supabaseAdmin
						.from('contacts').select('name, company').eq('id', callRecord.contact_id ?? '').maybeSingle();

					const LABELS: Record<string, string> = {
						appointment_set: 'Appointment Set', demo_scheduled: 'Demo Scheduled',
						meeting_confirmed: 'Meeting Confirmed', signed_up: 'Signed Up',
					};
					const { sendEmail } = await import('$lib/server/email');
					await sendEmail({
						userId: ownerId,
						to: clientEmail,
						subject: `📅 ${LABELS[body.outcome] ?? 'Win'} — ${contactRow?.name ?? 'New contact'}`,
						html: `<p>Hi ${clientName},</p>
<p>Your campaign just got a <strong>${LABELS[body.outcome] ?? 'win'}</strong>.</p>
<p><strong>${contactRow?.name ?? 'A contact'}${contactRow?.company ? ` at ${contactRow.company}` : ''}</strong> is now in your pipeline.</p>
<p>View all appointments and activity in your <a href="${env.PUBLIC_SITE_URL ?? 'https://lead-os-livid.vercel.app'}/client-portal">client portal →</a></p>
<p style="color:#888;font-size:12px">— ${clientBizName} via ${BRAND}</p>`,
					});
				}
			} catch (err) {
				console.error('[calls] client win notification failed (non-fatal):', err);
			}
		})();
	}

	// ── Discord wins webhook ──────────────────────────────────────────────────
	const WIN_DISCORD = new Set(['appointment_set','demo_scheduled','meeting_confirmed','signed_up']);
	if (body.outcome && WIN_DISCORD.has(body.outcome) && env.DISCORD_WEBHOOK_URL) {
		(async () => {
			const { data: c } = await supabaseAdmin
				.from('contacts').select('name, company').eq('id', callRecord?.contact_id ?? '').maybeSingle();
			const repEmail = user.email ?? 'A rep';
			const outcomeLabel: Record<string,string> = {
				appointment_set: '📅 Appointment Set', demo_scheduled: '🖥 Demo Scheduled',
				meeting_confirmed: '✅ Meeting Confirmed', signed_up: '🎉 Signed Up',
			};
			fetch(env.DISCORD_WEBHOOK_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					embeds: [{ color: 0x22c55e, title: outcomeLabel[body.outcome] ?? '🏆 Win',
						description: c?.name ? `**${c.name}**${c.company ? ` · ${c.company}` : ''}` : 'Contact',
						footer: { text: `${repEmail.split('@')[0]} · ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` },
					}],
				}),
			}).catch(() => {});
		})();
	}

	// ── Multi-condition win tracking ──────────────────────────────────────────
	if (body.outcome) {
		const WIN_OUTCOMES = new Set(['appointment_set','demo_scheduled','meeting_confirmed','signed_up','callback','follow_up_agreed','referral','proposal_requested']);
		if (WIN_OUTCOMES.has(body.outcome) && callRecord?.campaign_id) {
			try { await supabaseAdmin.rpc('increment_campaign_win_count', { campaign_id: callRecord.campaign_id }); } catch { /* non-fatal */ }
		}
	}

	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const { role } = await getUserRole(user.id);
	if (role !== 'owner') throw error(403, 'Only account owners can delete call records');
	const ownerId = await getEffectiveUserId(user.id);

	const { error: e } = await supabaseAdmin
		.from('calls').delete().eq('id', params.id).eq('user_id', ownerId);

	if (e) throw error(400, e.message);
	return json({ success: true });
};
