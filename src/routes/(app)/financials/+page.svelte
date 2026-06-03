<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';
	import DatePicker from '$lib/components/DatePicker.svelte';
	// ── tab state ──────────────────────────────────────────────
	let activeTab = $state<'overview' | 'invoices' | 'balance' | 'budget' | 'growth' | 'stack'>('overview');
	let period = $state<'month' | 'quarter' | 'year'>('month');

	// ── agency name ───────────────────────────────────────────
	let agencyName = $state('My Agency');

	// ── data ──────────────────────────────────────────────────
	let summary = $state<Record<string, any> | null>(null);
	let invoices = $state<any[]>([]);
	let balanceEntries = $state<any[]>([]);
	let techStack = $state<any[]>([]);
	let budgetEntries = $state<any[]>([]);
	let loading = $state(true);
	let error = $state('');

	// ── forms ─────────────────────────────────────────────────
	// Balance
	let balForm = $state({ date: today(), income: '', expenses: '', notes: '' });
	let balSaving = $state(false);

	// Tech Stack
	let showTechForm = $state(false);
	let techForm = $state({ name: '', category: 'other', monthlyCost: '', billingCycle: 'monthly', url: '', notes: '' });
	let techSaving = $state(false);
	let editingTech = $state<string | null>(null);

	// Budget
	let showBudgetForm = $state(false);
	let budgetForm = $state({ entryType: 'expense', category: '', label: '', amount: '', frequency: 'monthly', notes: '' });
	let budgetSaving = $state(false);

	// Invoice mark-paid
	let markingPaid = $state<string | null>(null);

	// Invoice email
	let sendingInvoiceId = $state<string | null>(null);
	let invoiceSentMsg = $state('');

	async function emailInvoice(invoice: any) {
		if (!invoice.client?.name) {
			alert('This invoice has no client linked. Edit the invoice to link a client first.');
			return;
		}

		// Get client's primary contact email
		const clientRes = await apiFetch(`/api/clients/${invoice.client_id}`);
		if (!clientRes.ok) { alert('Could not load client details'); return; }
		const client = await clientRes.json();

		const toEmail = client.primary_contact_email;
		if (!toEmail) {
			alert(`No email on file for ${client.name}. Add one in Clients → Edit Profile.`);
			return;
		}

		if (!confirm(`Send invoice to ${toEmail}?`)) return;

		sendingInvoiceId = invoice.id;

		// Build invoice email HTML
		const invoiceHtml = `
			<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
				<h2 style="color: #111;">Invoice #${invoice.invoice_number ?? invoice.id.slice(0,8)}</h2>
				<p style="color: #666;">Dear ${client.primary_contact_name ?? client.name},</p>
				<p style="color: #666;">Please find your invoice attached below.</p>
				<table style="width:100%;border-collapse:collapse;margin:16px 0;">
					<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Description</td><td style="padding:8px;border-bottom:1px solid #eee;">${invoice.description ?? 'Services rendered'}</td></tr>
					<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Amount</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">$${Number(invoice.total_amount ?? invoice.amount ?? invoice.total ?? 0).toLocaleString()}</td></tr>
					${invoice.due_date ? `<tr><td style="padding:8px;color:#666;">Due Date</td><td style="padding:8px;">${new Date(invoice.due_date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</td></tr>` : ''}
				</table>
				${invoice.scope_of_work ? `<p style="color:#666;font-style:italic;">${invoice.scope_of_work}</p>` : ''}
				<p style="color:#666;margin-top:24px;">Thank you for your business.</p>
				<p style="color:#999;font-size:13px;">Sent via LeadOS · ${agencyName}</p>
			</div>
		`;

		const r = await apiFetch('/api/emails/send', {
			method: 'POST',
			body: JSON.stringify({
				to: toEmail,
				subject: `Invoice${invoice.invoice_number ? ' #' + invoice.invoice_number : ''} — ${client.name}`,
				html: invoiceHtml,
				clientId: invoice.client_id,
				emailType: 'invoice',
			}),
		});

		if (r.ok) {
			const d = await r.json();
			invoiceSentMsg = `✓ Sent to ${toEmail} via ${d.method === 'smtp' ? 'Gmail' : 'Resend'}`;
			// Update invoice status to 'sent' if it was 'draft'
			if (invoice.status === 'draft') {
				await apiFetch(`/api/invoices/${invoice.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'sent' }) });
			}
		} else {
			invoiceSentMsg = '✗ Send failed — check email accounts in Settings';
		}
		sendingInvoiceId = null;
		setTimeout(() => invoiceSentMsg = '', 4000);
	}

	// Invoice creation form
	let showInvoiceForm = $state(false);
	let invoiceSaving = $state(false);
	let invoiceClients = $state<{id:string;name:string}[]>([]);
	let projects = $state<{id:string;name:string;client_id:string}[]>([]);
	const defaultInvoiceForm = () => ({
		clientId: '', clientName: '', hoursWorked: '', hourlyRate: '',
		taxPercent: '0', invoiceDate: today(), dueDate: '', services: 'Sales development services',
		contractType: 'invoice', contractStart: '', contractEnd: '',
		scopeOfWork: '', hourlyRateContract: 0, weeklyHours: 0, monthlyHours: 0,
		projectIds: [] as string[],
	});
	let invoiceForm = $state(defaultInvoiceForm());

	async function loadInvoiceClients() {
		const res = await apiFetch('/api/clients');
		invoiceClients = res.ok ? await res.json() : [];
		const projRes = await apiFetch('/api/projects');
		projects = projRes.ok ? await projRes.json() : [];
	}

	async function createInvoice() {
		const hrs = parseFloat(invoiceForm.hoursWorked);
		const rate = parseFloat(invoiceForm.hourlyRate);
		if (!hrs || !rate) return;
		invoiceSaving = true;
		const clientObj = invoiceClients.find(c => c.id === invoiceForm.clientId);
		const res = await apiFetch('/api/invoices', {
			method: 'POST',
			body: JSON.stringify({
				clientId: invoiceForm.clientId || null,
				clientName: clientObj?.name || invoiceForm.clientName || 'Client',
				hoursWorked: hrs,
				hourlyRate: rate,
				taxPercent: parseFloat(invoiceForm.taxPercent) || 0,
				invoiceDate: invoiceForm.invoiceDate,
				dueDate: invoiceForm.dueDate || null,
				services: invoiceForm.services,
				contractType: invoiceForm.contractType,
				contractStart: invoiceForm.contractStart || null,
				contractEnd: invoiceForm.contractEnd || null,
				scopeOfWork: invoiceForm.scopeOfWork || null,
				expectedHoursWeekly: invoiceForm.weeklyHours || null,
				expectedHoursMonthly: invoiceForm.monthlyHours || null,
				projectIds: invoiceForm.projectIds?.length ? invoiceForm.projectIds : null,
			}),
		});
		if (res.ok) {
			const inv = await res.json();
			invoices = [inv, ...invoices];
			showInvoiceForm = false;
			invoiceForm = defaultInvoiceForm();
		}
		invoiceSaving = false;
	}

	// ── Stack Manager ─────────────────────────────────────────
	let stackAccounts = $state<any[]>([]);
	let showStackForm = $state(false);
	let editingStack = $state<string | null>(null);
	let stackSaving = $state(false);
	let twilioUsage = $state<any | null>(null);
	let twilioLoading = $state(false);
	let twilioRange = $state<'Today' | 'ThisMonth' | 'LastMonth'>('ThisMonth');
	let revealCreds = $state<Record<string, boolean>>({});
	let expandedAccount = $state<string | null>(null);

	const KNOWN_SERVICES: { name: string; category: string; url: string; icon: string }[] = [
		{ name: 'Twilio',        category: 'calling',      url: 'https://twilio.com',         icon: '📞' },
		{ name: 'Stripe',        category: 'payments',     url: 'https://stripe.com',         icon: '💳' },
		{ name: 'Plaid',         category: 'banking',      url: 'https://plaid.com',          icon: '🏦' },
		{ name: 'Mercury',       category: 'banking',      url: 'https://mercury.com',        icon: '🪙' },
		{ name: 'Wave',          category: 'other',        url: 'https://waveapps.com',       icon: '🌊' },
		{ name: 'DocuSign',      category: 'legal',        url: 'https://docusign.com',       icon: '✍️' },
		{ name: 'Anthropic',     category: 'ai',           url: 'https://anthropic.com',      icon: '🧠' },
		{ name: 'OpenAI',        category: 'ai',           url: 'https://openai.com',         icon: '🤖' },
		{ name: 'Notion',        category: 'productivity', url: 'https://notion.so',          icon: '📓' },
		{ name: 'Vercel',        category: 'hosting',      url: 'https://vercel.com',         icon: '▲' },
		{ name: 'Cloudflare',    category: 'hosting',      url: 'https://cloudflare.com',     icon: '🔶' },
		{ name: 'Groq',          category: 'ai',           url: 'https://groq.com',           icon: '⚡' },
		{ name: 'Supabase',      category: 'hosting',      url: 'https://supabase.com',       icon: '🔌' },
		{ name: 'Smart Martins', category: 'crm',          url: '',                           icon: '📊' },
	];

	const defaultStackForm = () => ({
		serviceName: '', serviceCategory: 'other', serviceUrl: '', serviceIcon: '',
		loginEmail: '', loginUsername: '',
		status: 'active', trialStart: '', trialEnd: '', autoRenew: true,
		cost: '', billingCycle: 'monthly', nextBillingDate: '', paymentMethodLabel: '', annualCost: '',
		notes: '', createPassword: false, rawPassword: '',
	});
	let stackForm = $state(defaultStackForm());

	const stackCategories = ['calling', 'ai', 'hosting', 'crm', 'banking', 'payments', 'legal', 'storage', 'analytics', 'productivity', 'other'];
	const stackCatColors: Record<string, string> = {
		calling: 'text-blue-400', ai: 'text-purple-400', hosting: 'text-gray-400',
		crm: 'text-cyan-400', banking: 'text-green-400', payments: 'text-emerald-400',
		legal: 'text-yellow-400', storage: 'text-orange-400', analytics: 'text-pink-400',
		productivity: 'text-indigo-400', other: 'text-[#666]',
	};

	const stackStatusColor = (s: string) =>
		s === 'active' ? 'text-green-400 bg-green-400/10' :
		s === 'trial'  ? 'text-yellow-400 bg-yellow-400/10' :
		s === 'paused' ? 'text-[#666] bg-[#222]' :
		                 'text-red-400/60 bg-red-400/5';

	const trialDaysLeft = (end: string) => {
		if (!end) return null;
		const d = Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000);
		return d;
	};

	const stackMonthly = $derived(
		stackAccounts
			.filter(a => a.status === 'active' || a.status === 'trial')
			.reduce((s, a) => {
				const c = parseFloat(a.cost ?? 0);
				if (a.billing_cycle === 'annual') return s + c / 12;
				if (a.billing_cycle === 'usage_based' || a.billing_cycle === 'free' || a.billing_cycle === 'one_time') return s;
				return s + c;
			}, 0)
	);

	const trialsExpiringSoon = $derived(
		stackAccounts.filter(a => {
			if (a.status !== 'trial' || !a.trial_end) return false;
			const d = trialDaysLeft(a.trial_end);
			return d !== null && d >= 0 && d <= 7;
		})
	);

	// ── derived ───────────────────────────────────────────────
	const techCategories = ['calling', 'ai', 'hosting', 'crm', 'marketing', 'productivity', 'other'];
	const budgetCategories = {
		income: ['salary', 'commission', 'freelance', 'consulting', 'investment', 'other'],
		expense: ['rent', 'utilities', 'software', 'hardware', 'marketing', 'travel', 'education', 'insurance', 'other'],
	};

	const monthlyEquivalent = (item: any) =>
		item.billing_cycle === 'annual' ? item.monthly_cost / 12 :
		item.billing_cycle === 'one_time' ? 0 :
		item.monthly_cost;

	const techByCategory = $derived(
		techCategories.reduce((acc, cat) => {
			acc[cat] = techStack.filter(t => t.category === cat && t.active);
			return acc;
		}, {} as Record<string, any[]>)
	);

	const techMonthlyTotal = $derived(techStack.filter(t => t.active).reduce((s, t) => s + monthlyEquivalent(t), 0));

	const budgetIncome = $derived(budgetEntries.filter(b => b.entry_type === 'income'));
	const budgetExpenses = $derived(budgetEntries.filter(b => b.entry_type === 'expense'));

	const toMonthly = (b: any) => {
		const a = parseFloat(b.amount);
		if (b.frequency === 'weekly') return a * 4.33;
		if (b.frequency === 'annual') return a / 12;
		if (b.frequency === 'one_time') return 0;
		return a;
	};

	const monthlyIncome = $derived(budgetIncome.reduce((s, b) => s + toMonthly(b), 0));
	const monthlyExpenses = $derived(budgetExpenses.reduce((s, b) => s + toMonthly(b), 0));
	const monthlyCashFlow = $derived(monthlyIncome - monthlyExpenses - techMonthlyTotal);

	// ── helpers ───────────────────────────────────────────────
	function today() {
		return new Date().toISOString().slice(0, 10);
	}
	function fmt(n: number) {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
	}
	function fmtD(n: number) {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
	}
	function fmtDate(d: string) {
		return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
	}
	function statusColor(s: string) {
		if (s === 'paid') return 'text-green-400';
		if (s === 'overdue') return 'text-red-400';
		return 'text-yellow-400';
	}

	// ── data loading ──────────────────────────────────────────
	async function loadAll() {
		loading = true;
		error = '';
		try {
			const [sumRes, invRes, balRes, techRes, budRes, stackRes] = await Promise.all([
				apiFetch(`/api/financials/summary?period=${period}`),
				apiFetch('/api/invoices'),
				apiFetch('/api/financials/balance?weeks=52'),
				apiFetch('/api/financials/tech-stack'),
				apiFetch('/api/financials/budget'),
				apiFetch('/api/stack-accounts'),
			]);
			summary = sumRes.ok ? await sumRes.json() : null;
			invoices = invRes.ok ? await invRes.json() : [];
			balanceEntries = balRes.ok ? await balRes.json() : [];
			techStack = techRes.ok ? await techRes.json() : [];
			budgetEntries = budRes.ok ? await budRes.json() : [];
			stackAccounts = stackRes.ok ? await stackRes.json() : [];
		} catch (e: any) {
			error = e.message;
		} finally {
			loading = false;
		}
	}

	async function loadTwilioUsage() {
		twilioLoading = true;
		const res = await apiFetch(`/api/financials/twilio-usage?range=${twilioRange}`);
		twilioUsage = res.ok ? await res.json() : null;
		twilioLoading = false;
	}

	async function saveStackAccount() {
		stackSaving = true;
		const method = editingStack ? 'PATCH' : 'POST';
		const url = editingStack ? `/api/stack-accounts/${editingStack}` : '/api/stack-accounts';
		const res = await apiFetch(url, {
			method,
			body: JSON.stringify({
				...stackForm,
				cost: parseFloat(stackForm.cost) || 0,
				annualCost: stackForm.annualCost ? parseFloat(stackForm.annualCost) : null,
				trialStart: stackForm.trialStart || null,
				trialEnd: stackForm.trialEnd || null,
				nextBillingDate: stackForm.nextBillingDate || null,
			}),
		});
		if (res.ok) {
			await loadAll();
			stackForm = defaultStackForm();
			showStackForm = false;
			editingStack = null;
		}
		stackSaving = false;
	}

	function editStack(account: any) {
		editingStack = account.id;
		stackForm = {
			serviceName: account.service_name,
			serviceCategory: account.service_category,
			serviceUrl: account.service_url ?? '',
			serviceIcon: account.service_icon ?? '',
			loginEmail: account.login_email ?? '',
			loginUsername: account.login_username ?? '',
			status: account.status,
			trialStart: account.trial_start ?? '',
			trialEnd: account.trial_end ?? '',
			autoRenew: account.auto_renew ?? true,
			cost: String(account.cost ?? ''),
			billingCycle: account.billing_cycle ?? 'monthly',
			nextBillingDate: account.next_billing_date ?? '',
			paymentMethodLabel: account.payment_method_label ?? '',
			annualCost: account.annual_cost ? String(account.annual_cost) : '',
			notes: account.notes ?? '',
			createPassword: false, rawPassword: '',
		};
		showStackForm = true;
		expandedAccount = null;
	}

	async function deleteStack(id: string) {
		if (!confirm('Delete this account entry?')) return;
		await apiFetch(`/api/stack-accounts/${id}`, { method: 'DELETE' });
		await loadAll();
	}

	function quickAdd(svc: typeof KNOWN_SERVICES[0]) {
		stackForm = { ...defaultStackForm(), serviceName: svc.name, serviceCategory: svc.category, serviceUrl: svc.url, serviceIcon: svc.icon };
		showStackForm = true;
		editingStack = null;
	}

	onMount(async () => {
		await loadAll();
		try {
			const sr = await apiFetch('/api/settings');
			if (sr.ok) { const s = await sr.json(); if (s.agency_name) agencyName = s.agency_name; }
		} catch {}
	});

	$effect(() => { period; loadAll(); });

	// ── actions ───────────────────────────────────────────────
	async function saveBalance() {
		balSaving = true;
		const res = await apiFetch('/api/financials/balance', {
			method: 'POST',
			body: JSON.stringify({ entryDate: balForm.date, income: parseFloat(balForm.income) || 0, expenses: parseFloat(balForm.expenses) || 0, notes: balForm.notes }),
		});
		if (res.ok) {
			await loadAll();
			balForm = { date: today(), income: '', expenses: '', notes: '' };
		}
		balSaving = false;
	}

	async function saveTech() {
		techSaving = true;
		const method = editingTech ? 'PATCH' : 'POST';
		const url = editingTech ? `/api/financials/tech-stack/${editingTech}` : '/api/financials/tech-stack';
		const res = await apiFetch(url, {
			method,
			body: JSON.stringify({ ...techForm, monthlyCost: parseFloat(techForm.monthlyCost) || 0 }),
		});
		if (res.ok) {
			await loadAll();
			techForm = { name: '', category: 'other', monthlyCost: '', billingCycle: 'monthly', url: '', notes: '' };
			showTechForm = false;
			editingTech = null;
		}
		techSaving = false;
	}

	async function deleteTech(id: string) {
		await apiFetch(`/api/financials/tech-stack/${id}`, { method: 'DELETE' });
		await loadAll();
	}

	async function toggleTechActive(item: any) {
		await apiFetch(`/api/financials/tech-stack/${item.id}`, {
			method: 'PATCH',
			body: JSON.stringify({ active: !item.active }),
		});
		await loadAll();
	}

	function editTech(item: any) {
		editingTech = item.id;
		techForm = { name: item.name, category: item.category, monthlyCost: String(item.monthly_cost), billingCycle: item.billing_cycle, url: item.url ?? '', notes: item.notes ?? '' };
		showTechForm = true;
	}

	async function saveBudget() {
		budgetSaving = true;
		const res = await apiFetch('/api/financials/budget', {
			method: 'POST',
			body: JSON.stringify({ ...budgetForm, amount: parseFloat(budgetForm.amount) || 0 }),
		});
		if (res.ok) {
			await loadAll();
			budgetForm = { entryType: 'expense', category: '', label: '', amount: '', frequency: 'monthly', notes: '' };
			showBudgetForm = false;
		}
		budgetSaving = false;
	}

	async function deleteBudget(id: string) {
		await apiFetch(`/api/financials/budget/${id}`, { method: 'DELETE' });
		await loadAll();
	}

	async function markInvoicePaid(inv: any) {
		markingPaid = inv.id;
		// PATCH invoice status — hits the existing invoices API
		await apiFetch(`/api/invoices/${inv.id}`, {
			method: 'PATCH',
			body: JSON.stringify({ status: 'paid', paidAt: new Date().toISOString() }),
		});
		await loadAll();
		markingPaid = null;
	}

	// ── SVG line chart ────────────────────────────────────────
	function buildChart(entries: any[], key: 'income' | 'expenses' | 'net') {
		if (!entries.length) return { path: '', points: [], minY: 0, maxY: 0 };
		const W = 700, H = 140, PAD = 8;
		const vals = entries.map(e =>
			key === 'net' ? (e.income ?? 0) - (e.expenses ?? 0) : (e[key] ?? 0)
		);
		const minY = Math.min(0, ...vals);
		const maxY = Math.max(1, ...vals);
		const px = (i: number) => PAD + (i / (entries.length - 1)) * (W - PAD * 2);
		const py = (v: number) => PAD + (1 - (v - minY) / (maxY - minY)) * (H - PAD * 2);
		const points = vals.map((v, i) => ({ x: px(i), y: py(v), v, date: entries[i].entry_date }));
		const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
		const zero = py(0);
		const area = `${path} L${points.at(-1)!.x.toFixed(1)},${zero.toFixed(1)} L${points[0].x.toFixed(1)},${zero.toFixed(1)} Z`;
		return { path, area, points, minY, maxY, zero };
	}

	const incomeChart = $derived(buildChart(balanceEntries, 'income'));
	const expenseChart = $derived(buildChart(balanceEntries, 'expenses'));
	const netChart = $derived(buildChart(balanceEntries, 'net'));

	let tooltip = $state<{ x: number; y: number; text: string } | null>(null);
</script>

<svelte:head><title>Financials — LeadOS</title></svelte:head>

<div class="flex flex-col h-full bg-[#0a0a0a] text-[#f5f5f5] overflow-auto">

	<!-- Header -->
	<div class="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a]">
		<div>
			<h1 class="text-xl font-semibold">Financials</h1>
			<p class="text-[#666] text-sm">Revenue, expenses, invoices, and business health</p>
		</div>
		<div class="flex gap-2">
			{#each (['month', 'quarter', 'year'] as const) as p}
				<button
					onclick={() => period = p}
					class="px-3 py-1 text-xs rounded border transition-colors {period === p ? 'bg-white text-black border-white' : 'border-[#333] text-[#999] hover:border-white hover:text-white'}"
				>
					{p === 'month' ? 'This Month' : p === 'quarter' ? 'This Quarter' : 'This Year'}
				</button>
			{/each}
		</div>
	</div>

	<!-- Tabs -->
	<div class="flex gap-1 px-6 pt-4 border-b border-[#2a2a2a]">
		{#each [
			{ id: 'overview', label: 'Overview' },
			{ id: 'invoices', label: 'Invoices' },
			{ id: 'balance', label: 'Balance Tracker' },
			{ id: 'budget', label: 'Budget' },
			{ id: 'growth', label: 'Growth' },
		{ id: 'stack', label: 'Stack Manager' },
		] as tab}
			<button
				onclick={() => activeTab = tab.id as any}
				class="px-4 py-2 text-sm border-b-2 transition-colors {activeTab === tab.id ? 'border-white text-white' : 'border-transparent text-[#666] hover:text-[#ccc]'}"
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<!-- Content -->
	<div class="flex-1 overflow-auto p-6">

		{#if loading}
	{:else if error}
			<div class="text-red-400 text-sm p-4 bg-red-400/10 rounded border border-red-400/30">{error}</div>

		<!-- ═══════════════ OVERVIEW ═══════════════ -->
		{:else if activeTab === 'overview'}
			{@const s = summary}
			{@const net = (s?.balance?.totalIncome ?? 0) - (s?.balance?.totalExpenses ?? 0)}
			<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
					<div class="text-[#666] text-xs mb-1">Invoiced</div>
					<div class="text-2xl font-semibold">{fmt(s?.invoices?.totalInvoiced ?? 0)}</div>
					<div class="text-[#666] text-xs mt-1">{s?.invoices?.total ?? 0} invoices</div>
				</div>
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
					<div class="text-[#666] text-xs mb-1">Collected</div>
					<div class="text-2xl font-semibold text-green-400">{fmt(s?.invoices?.totalPaid ?? 0)}</div>
					<div class="text-[#666] text-xs mt-1">Outstanding: {fmt(s?.invoices?.totalOutstanding ?? 0)}</div>
				</div>
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
					<div class="text-[#666] text-xs mb-1">Pipeline Value</div>
					<div class="text-2xl font-semibold text-blue-400">{fmt(s?.deals?.pipelineValue ?? 0)}</div>
					<div class="text-[#666] text-xs mt-1">Won: {fmt(s?.deals?.wonValue ?? 0)}</div>
				</div>
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
					<div class="text-[#666] text-xs mb-1">Tool Spend / mo</div>
					<div class="text-2xl font-semibold text-yellow-400">{fmt(techMonthlyTotal)}</div>
					<div class="text-[#666] text-xs mt-1">API: {fmtD(s?.apiCosts?.total ?? 0)}</div>
				</div>
			</div>

			<!-- Quota progress -->
			{#if summary?.quota}
				{@const q = summary.quota}
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4 mb-4">
					<div class="flex justify-between items-center mb-2">
						<span class="text-sm font-medium">Revenue Quota</span>
						<span class="text-sm text-[#999]">{fmt(q.actual)} / {fmt(q.target)}</span>
					</div>
					<div class="w-full h-2 bg-[#222] rounded-full overflow-hidden">
						<div
							class="h-full rounded-full transition-all {q.pct >= 100 ? 'bg-green-400' : q.pct >= 70 ? 'bg-yellow-400' : 'bg-red-400'}"
							style="width:{Math.min(q.pct, 100)}%"
						></div>
					</div>
					<div class="text-xs text-[#666] mt-1">{q.pct}% of quota</div>
				</div>
			{/if}

			<!-- Balance net + overdue alert -->
			<div class="grid grid-cols-2 gap-4">
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
					<div class="text-[#666] text-xs mb-1">Net Cash (period)</div>
					<div class="text-2xl font-semibold {net >= 0 ? 'text-green-400' : 'text-red-400'}">{fmt(net)}</div>
					<div class="text-[#666] text-xs mt-1">In: {fmt(summary?.balance?.totalIncome ?? 0)} · Out: {fmt(summary?.balance?.totalExpenses ?? 0)}</div>
				</div>
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
					<div class="text-[#666] text-xs mb-1">Budget Cash Flow / mo</div>
					<div class="text-2xl font-semibold {monthlyCashFlow >= 0 ? 'text-green-400' : 'text-red-400'}">{fmt(monthlyCashFlow)}</div>
					<div class="text-[#666] text-xs mt-1">Income: {fmt(monthlyIncome)} · Expenses: {fmt(monthlyExpenses + techMonthlyTotal)}</div>
				</div>
			</div>

			{#if (summary?.invoices?.overdueCount ?? 0) > 0}
				<div class="mt-4 p-3 bg-red-400/10 border border-red-400/30 rounded-lg text-sm text-red-300 flex items-center gap-2">
					⚠️ {summary?.invoices?.overdueCount} overdue invoice{summary?.invoices?.overdueCount > 1 ? 's' : ''} —
					<button onclick={() => activeTab = 'invoices'} class="underline">view invoices</button>
				</div>
			{/if}

			<!-- API cost breakdown -->
			{#if (summary?.apiCosts?.total ?? 0) > 0}
				<div class="mt-4 bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
					<div class="text-sm font-medium mb-3">API Costs ({period === 'month' ? 'This Month' : period === 'quarter' ? 'This Quarter' : 'This Year'})</div>
					<div class="grid grid-cols-3 gap-3 text-sm">
						<div class="text-center">
							<div class="text-[#666] text-xs mb-1">Twilio</div>
							<div class="font-medium">{fmtD(summary?.apiCosts?.twilio ?? 0)}</div>
						</div>
						<div class="text-center">
							<div class="text-[#666] text-xs mb-1">Groq</div>
							<div class="font-medium">{fmtD(summary?.apiCosts?.groq ?? 0)}</div>
						</div>
						<div class="text-center">
							<div class="text-[#666] text-xs mb-1">Claude</div>
							<div class="font-medium">{fmtD(summary?.apiCosts?.claude ?? 0)}</div>
						</div>
					</div>
				</div>
			{/if}

		<!-- ═══════════════ INVOICES ═══════════════ -->
		{:else if activeTab === 'invoices'}
			<div class="flex justify-between items-center mb-4">
				<div class="text-sm text-[#666]">{invoices.length} invoices total</div>
				<button onclick={() => { showInvoiceForm = !showInvoiceForm; if (showInvoiceForm) loadInvoiceClients(); }} class="text-xs text-[#999] hover:text-white border border-[#333] px-3 py-1 rounded hover:border-white transition-colors">
					{showInvoiceForm ? '✕ Cancel' : '+ New Invoice'}
				</button>
			</div>

			{#if showInvoiceForm}
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-5 mb-4 space-y-3">
					<p class="text-xs text-[#666] uppercase tracking-widest">New Invoice</p>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="text-xs text-[#555] block mb-1">Client</label>
							{#if invoiceClients.length}
								<select bind:value={invoiceForm.clientId} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
									<option value="">— No client —</option>
									{#each invoiceClients as c}<option value={c.id}>{c.name}</option>{/each}
								</select>
							{:else}
								<input bind:value={invoiceForm.clientName} placeholder="Client name" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
							{/if}
						</div>
						<div>
							<label class="text-xs text-[#555] block mb-1">Type</label>
							<select bind:value={invoiceForm.contractType} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
								<option value="invoice">Invoice</option>
								<option value="retainer">Monthly Retainer</option>
								<option value="project">Project-Based</option>
								<option value="hourly">Hourly</option>
							</select>
						</div>
						<div>
							<label class="text-xs text-[#555] block mb-1">Services</label>
							<input bind:value={invoiceForm.services} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
						</div>
						<div>
							<label class="text-xs text-[#555] block mb-1">Hours Worked</label>
							<input type="number" bind:value={invoiceForm.hoursWorked} placeholder="0" min="0" step="0.5" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
						</div>
						<div>
							<label class="text-xs text-[#555] block mb-1">Hourly Rate ($)</label>
							<input type="number" bind:value={invoiceForm.hourlyRate} placeholder="0" min="0" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
						</div>
						<div>
							<label class="text-xs text-[#555] block mb-1">Tax %</label>
							<input type="number" bind:value={invoiceForm.taxPercent} placeholder="0" min="0" max="100" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
						</div>
						<div>
							<label class="text-xs text-[#555] block mb-1">Invoice Date</label>
							<DatePicker bind:value={invoiceForm.invoiceDate} onchange={(v) => invoiceForm.invoiceDate = v} />
						</div>
						<div>
							<label class="text-xs text-[#555] block mb-1">Due Date</label>
							<DatePicker bind:value={invoiceForm.dueDate} onchange={(v) => invoiceForm.dueDate = v} />
						</div>
					</div>

					{#if ['retainer','project'].includes(invoiceForm.contractType ?? 'invoice')}
						<div class="grid grid-cols-2 gap-3">
							<div>
								<label class="text-xs text-[#555] block mb-1">Contract Start</label>
								<DatePicker bind:value={invoiceForm.contractStart} onchange={(v) => invoiceForm.contractStart = v} />
							</div>
							<div>
								<label class="text-xs text-[#555] block mb-1">Contract End</label>
								<DatePicker bind:value={invoiceForm.contractEnd} onchange={(v) => invoiceForm.contractEnd = v} />
							</div>
						</div>
					{/if}

					{#if ['retainer','hourly'].includes(invoiceForm.contractType ?? 'invoice')}
						<div class="grid grid-cols-3 gap-3">
							<div>
								<label class="text-xs text-[#555] block mb-1">Contract Rate ($/hr)</label>
								<input type="number" bind:value={invoiceForm.hourlyRateContract} placeholder="75" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
							</div>
							<div>
								<label class="text-xs text-[#555] block mb-1">Weekly Hours</label>
								<input type="number" bind:value={invoiceForm.weeklyHours} placeholder="20" step="0.5" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
							</div>
							<div>
								<label class="text-xs text-[#555] block mb-1">Monthly Hours</label>
								<input type="number" bind:value={invoiceForm.monthlyHours} placeholder="80" step="0.5" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
							</div>
						</div>
					{/if}

					{#if invoiceForm.contractType !== 'invoice'}
						<div>
							<label class="text-xs text-[#555] block mb-1">Scope of Work</label>
							<textarea bind:value={invoiceForm.scopeOfWork} rows="3" placeholder="Describe what's included..." class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
						</div>
					{/if}

					{#if projects.filter(p => p.client_id === invoiceForm.clientId).length > 0}
						<div>
							<label class="text-xs text-[#555] block mb-1">Linked Projects (for time tracking)</label>
							<div class="flex flex-wrap gap-2 mt-1">
								{#each projects.filter(p => p.client_id === invoiceForm.clientId) as proj}
									<label class="flex items-center gap-1.5 text-xs cursor-pointer border px-2.5 py-1 rounded-lg transition-colors {invoiceForm.projectIds?.includes(proj.id) ? 'border-white text-white' : 'border-[#2a2a2a] text-[#777] hover:border-[#555]'}">
										<input type="checkbox" checked={invoiceForm.projectIds?.includes(proj.id)}
											onchange={(e) => {
												if ((e.target as HTMLInputElement).checked) {
													invoiceForm.projectIds = [...(invoiceForm.projectIds ?? []), proj.id];
												} else {
													invoiceForm.projectIds = (invoiceForm.projectIds ?? []).filter(id => id !== proj.id);
												}
											}} class="sr-only" />
										{proj.name}
									</label>
								{/each}
							</div>
						</div>
					{/if}

					{#if invoiceForm.hoursWorked && invoiceForm.hourlyRate}
						<p class="text-xs text-[#888]">Total: {fmtD(parseFloat(invoiceForm.hoursWorked) * parseFloat(invoiceForm.hourlyRate) * (1 + parseFloat(invoiceForm.taxPercent || '0') / 100))}</p>
					{/if}
					<button onclick={createInvoice} disabled={invoiceSaving || !invoiceForm.hoursWorked || !invoiceForm.hourlyRate} class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40">
						{invoiceSaving ? 'Creating...' : 'Create Invoice'}
					</button>
				</div>
			{/if}

			<div class="bg-[#111] border border-[#2a2a2a] rounded-lg overflow-hidden">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-[#2a2a2a]">
							<th class="text-left px-4 py-3 text-[#666] font-normal">Invoice #</th>
							<th class="text-left px-4 py-3 text-[#666] font-normal">Client</th>
							<th class="text-left px-4 py-3 text-[#666] font-normal">Date</th>
							<th class="text-left px-4 py-3 text-[#666] font-normal">Due</th>
							<th class="text-right px-4 py-3 text-[#666] font-normal">Total</th>
							<th class="text-center px-4 py-3 text-[#666] font-normal">Status</th>
							<th class="px-4 py-3"></th>
						</tr>
					</thead>
					<tbody>
						{#each invoices as inv}
							<tr class="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors">
								<td class="px-4 py-3 font-mono text-xs">{inv.invoice_number ?? '—'}</td>
								<td class="px-4 py-3">
									<div>{inv.client?.name ?? 'No client'}</div>
									{#if inv.contract_type && inv.contract_type !== 'invoice'}
										<span class="text-xs text-[#555] capitalize">{inv.contract_type}</span>
									{/if}
								</td>
								<td class="px-4 py-3 text-[#999]">{fmtDate(inv.invoice_date)}</td>
								<td class="px-4 py-3 text-[#999]">{fmtDate(inv.due_date)}</td>
								<td class="px-4 py-3 text-right font-medium">{fmtD(inv.total ?? 0)}</td>
								<td class="px-4 py-3 text-center">
									<span class="text-xs px-2 py-0.5 rounded-full {statusColor(inv.status)} bg-current/10">
										{inv.status ?? 'draft'}
									</span>
								</td>
								<td class="px-4 py-3 text-right space-y-1">
									{#if inv.project_ids?.length}
										<div>
											<a href="/time" class="text-xs text-blue-400 hover:underline">&#x23F1; View Time</a>
										</div>
									{/if}
									<div class="flex items-center gap-2 justify-end">
										<button onclick={() => emailInvoice(inv)} disabled={sendingInvoiceId === inv.id}
											class="text-xs border border-[#2a2a2a] px-2.5 py-1.5 rounded-lg text-[#777] hover:border-blue-400 hover:text-blue-400 transition-colors disabled:opacity-40">
											{sendingInvoiceId === inv.id ? 'Sending...' : '✉ Email'}
										</button>
										{#if inv.status !== 'paid'}
											<button
												onclick={() => markInvoicePaid(inv)}
												disabled={markingPaid === inv.id}
												class="text-xs text-green-400 hover:text-green-300 disabled:opacity-50"
											>
												{markingPaid === inv.id ? '…' : 'Mark Paid'}
											</button>
										{:else}
											<span class="text-xs text-[#555]">{fmtDate(inv.paid_at)}</span>
										{/if}
									</div>
								</td>
							</tr>
						{:else}
							<tr><td colspan="7" class="px-4 py-8 text-center text-[#555]">No invoices yet — create one in Reports.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Summary row -->
			{#if invoices.length}
				<div class="flex gap-4 mt-4 text-sm">
					<div class="bg-[#111] border border-[#2a2a2a] rounded px-4 py-2 flex gap-3 items-center">
						<span class="text-[#666]">Total</span>
						<span class="font-medium">{fmtD(invoices.reduce((s, i) => s + (i.total ?? 0), 0))}</span>
					</div>
					<div class="bg-[#111] border border-[#2a2a2a] rounded px-4 py-2 flex gap-3 items-center">
						<span class="text-[#666]">Collected</span>
						<span class="font-medium text-green-400">{fmtD(invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total ?? 0), 0))}</span>
					</div>
					<div class="bg-[#111] border border-[#2a2a2a] rounded px-4 py-2 flex gap-3 items-center">
						<span class="text-[#666]">Outstanding</span>
						<span class="font-medium text-yellow-400">{fmtD(invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.total ?? 0), 0))}</span>
					</div>
				</div>
			{/if}

		<!-- ═══════════════ BALANCE TRACKER ═══════════════ -->
		{:else if activeTab === 'balance'}
			<!-- Input form -->
			<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4 mb-6">
				<div class="text-sm font-medium mb-3">Log Weekly Balance</div>
				<div class="grid grid-cols-4 gap-3">
					<div>
						<label class="block text-xs text-[#666] mb-1">Date</label>
						<DatePicker bind:value={balForm.date} onchange={(v) => balForm.date = v} />
					</div>
					<div>
						<label class="block text-xs text-[#666] mb-1">Income ($)</label>
						<input type="number" bind:value={balForm.income} placeholder="0.00" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
					</div>
					<div>
						<label class="block text-xs text-[#666] mb-1">Expenses ($)</label>
						<input type="number" bind:value={balForm.expenses} placeholder="0.00" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
					</div>
					<div>
						<label class="block text-xs text-[#666] mb-1">Notes</label>
						<input type="text" bind:value={balForm.notes} placeholder="Optional" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
					</div>
				</div>
				<button
					onclick={saveBalance}
					disabled={balSaving}
					class="mt-3 px-4 py-2 bg-white text-black rounded text-sm font-medium hover:bg-[#e5e5e5] disabled:opacity-50 transition-colors"
				>
					{balSaving ? 'Saving…' : 'Save Entry'}
				</button>
			</div>

			<!-- Chart: Income vs Expenses -->
			{#if balanceEntries.length > 1}
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4 mb-4">
					<div class="text-sm font-medium mb-3">Income vs Expenses (52 weeks)</div>
					<svg viewBox="0 0 700 140" class="w-full" style="height:140px">
						<!-- Zero line -->
						{#if incomeChart.zero}
							<line x1="8" x2="692" y1={incomeChart.zero} y2={incomeChart.zero} stroke="#2a2a2a" stroke-width="1" />
						{/if}
						<!-- Area fills -->
						{#if incomeChart.area}
							<path d={incomeChart.area} fill="rgba(74,222,128,0.08)" />
						{/if}
						{#if expenseChart.area}
							<path d={expenseChart.area} fill="rgba(248,113,113,0.08)" />
						{/if}
						<!-- Lines -->
						{#if incomeChart.path}
							<path d={incomeChart.path} fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
						{/if}
						{#if expenseChart.path}
							<path d={expenseChart.path} fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
						{/if}
						<!-- Dots -->
						{#each incomeChart.points as pt}
							<circle cx={pt.x} cy={pt.y} r="3" fill="#4ade80"
								onmouseenter={(e) => tooltip = { x: e.clientX, y: e.clientY, text: `${fmtDate(pt.date)}: ${fmt(pt.v)}` }}
								onmouseleave={() => tooltip = null}
								style="cursor:pointer"
							/>
						{/each}
					</svg>
					<div class="flex gap-4 mt-2 text-xs text-[#666]">
						<span class="flex items-center gap-1"><span class="w-3 h-0.5 bg-green-400 inline-block"></span> Income</span>
						<span class="flex items-center gap-1"><span class="w-3 h-0.5 bg-red-400 inline-block"></span> Expenses</span>
					</div>
				</div>

				<!-- Net chart -->
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4 mb-4">
					<div class="text-sm font-medium mb-3">Net Cash Flow</div>
					<svg viewBox="0 0 700 100" class="w-full" style="height:100px">
						{#if netChart.area}
							<path d={netChart.area} fill="rgba(255,255,255,0.04)" />
						{/if}
						{#if netChart.path}
							<path d={netChart.path} fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
						{/if}
					</svg>
				</div>
			{/if}

			<!-- Table -->
			<div class="bg-[#111] border border-[#2a2a2a] rounded-lg overflow-hidden">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-[#2a2a2a]">
							<th class="text-left px-4 py-3 text-[#666] font-normal">Date</th>
							<th class="text-right px-4 py-3 text-[#666] font-normal">Income</th>
							<th class="text-right px-4 py-3 text-[#666] font-normal">Expenses</th>
							<th class="text-right px-4 py-3 text-[#666] font-normal">Net</th>
							<th class="text-left px-4 py-3 text-[#666] font-normal">Notes</th>
						</tr>
					</thead>
					<tbody>
						{#each [...balanceEntries].reverse() as entry}
							{@const net = (entry.income ?? 0) - (entry.expenses ?? 0)}
							<tr class="border-b border-[#1a1a1a] hover:bg-[#1a1a1a]">
								<td class="px-4 py-3 text-[#999]">{fmtDate(entry.entry_date)}</td>
								<td class="px-4 py-3 text-right text-green-400">{fmtD(entry.income ?? 0)}</td>
								<td class="px-4 py-3 text-right text-red-400">{fmtD(entry.expenses ?? 0)}</td>
								<td class="px-4 py-3 text-right font-medium {net >= 0 ? 'text-white' : 'text-red-400'}">{fmtD(net)}</td>
								<td class="px-4 py-3 text-[#666] text-xs">{entry.notes ?? ''}</td>
							</tr>
						{:else}
							<tr><td colspan="5" class="px-4 py-8 text-center text-[#555]">No entries yet — log your first week above.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>

		<!-- ═══════════════ BUDGET ═══════════════ -->
		{:else if activeTab === 'budget'}
			<!-- Cash flow summary -->
			<div class="grid grid-cols-3 gap-4 mb-6">
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
					<div class="text-[#666] text-xs mb-1">Monthly Income</div>
					<div class="text-xl font-semibold text-green-400">{fmt(monthlyIncome)}</div>
				</div>
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
					<div class="text-[#666] text-xs mb-1">Monthly Expenses</div>
					<div class="text-xl font-semibold text-red-400">{fmt(monthlyExpenses + techMonthlyTotal)}</div>
					<div class="text-xs text-[#555] mt-0.5">incl. {fmt(techMonthlyTotal)} tech stack</div>
				</div>
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
					<div class="text-[#666] text-xs mb-1">Net Cash Flow</div>
					<div class="text-xl font-semibold {monthlyCashFlow >= 0 ? 'text-green-400' : 'text-red-400'}">{fmt(monthlyCashFlow)}</div>
				</div>
			</div>

			<div class="flex justify-between items-center mb-4">
				<div class="text-sm text-[#666]">Budget line items</div>
				<button
					onclick={() => showBudgetForm = !showBudgetForm}
					class="px-3 py-1 text-xs border border-[#333] rounded hover:border-white hover:text-white text-[#999] transition-colors"
				>
					+ Add Entry
				</button>
			</div>

			{#if showBudgetForm}
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4 mb-4">
					<div class="grid grid-cols-3 gap-3 mb-3">
						<div>
							<label class="block text-xs text-[#666] mb-1">Type</label>
							<select bind:value={budgetForm.entryType} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
								<option value="income">Income</option>
								<option value="expense">Expense</option>
							</select>
						</div>
						<div>
							<label class="block text-xs text-[#666] mb-1">Category</label>
							<select bind:value={budgetForm.category} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
								{#each (budgetCategories[budgetForm.entryType as 'income' | 'expense'] ?? []) as cat}
									<option value={cat}>{cat}</option>
								{/each}
							</select>
						</div>
						<div>
							<label class="block text-xs text-[#666] mb-1">Label *</label>
							<input bind:value={budgetForm.label} placeholder="e.g. Salary, Netflix…" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
						</div>
						<div>
							<label class="block text-xs text-[#666] mb-1">Amount ($) *</label>
							<input type="number" bind:value={budgetForm.amount} placeholder="0.00" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
						</div>
						<div>
							<label class="block text-xs text-[#666] mb-1">Frequency</label>
							<select bind:value={budgetForm.frequency} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
								<option value="weekly">Weekly</option>
								<option value="monthly">Monthly</option>
								<option value="annual">Annual</option>
								<option value="one_time">One-time</option>
							</select>
						</div>
						<div>
							<label class="block text-xs text-[#666] mb-1">Notes</label>
							<input bind:value={budgetForm.notes} placeholder="Optional" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
						</div>
					</div>
					<div class="flex gap-2">
						<button onclick={saveBudget} disabled={budgetSaving || !budgetForm.label || !budgetForm.amount} class="px-4 py-2 bg-white text-black rounded text-sm font-medium hover:bg-[#e5e5e5] disabled:opacity-50 transition-colors">
							{budgetSaving ? 'Saving…' : 'Add'}
						</button>
						<button onclick={() => showBudgetForm = false} class="px-4 py-2 border border-[#333] rounded text-sm text-[#999] hover:border-white hover:text-white transition-colors">Cancel</button>
					</div>
				</div>
			{/if}

			<div class="grid grid-cols-2 gap-6">
				<!-- Income -->
				<div>
					<div class="text-xs uppercase tracking-wide text-green-400/70 mb-2">Income Sources</div>
					<div class="bg-[#111] border border-[#2a2a2a] rounded-lg overflow-hidden">
						{#each budgetIncome as entry, i}
							<div class="flex items-center gap-3 px-8 py-4 {i < budgetIncome.length - 1 ? 'border-b border-[#1a1a1a]' : ''}">
								<div class="flex-1">
									<div class="text-sm">{entry.label}</div>
									<div class="text-xs text-[#666]">{entry.category} · {entry.frequency}</div>
								</div>
								<div class="text-sm text-green-400">{fmtD(toMonthly(entry))}/mo</div>
								<button onclick={() => deleteBudget(entry.id)} class="text-[#555] hover:text-red-400 text-xs transition-colors">✕</button>
							</div>
						{:else}
							<div class="px-4 py-6 text-center text-[#555] text-sm">No income entries</div>
						{/each}
					</div>
				</div>

				<!-- Expenses -->
				<div>
					<div class="text-xs uppercase tracking-wide text-red-400/70 mb-2">Expenses</div>
					<div class="bg-[#111] border border-[#2a2a2a] rounded-lg overflow-hidden">
						{#each budgetExpenses as entry, i}
							<div class="flex items-center gap-3 px-8 py-4 {i < budgetExpenses.length - 1 ? 'border-b border-[#1a1a1a]' : ''}">
								<div class="flex-1">
									<div class="text-sm">{entry.label}</div>
									<div class="text-xs text-[#666]">{entry.category} · {entry.frequency}</div>
								</div>
								<div class="text-sm text-red-400">{fmtD(toMonthly(entry))}/mo</div>
								<button onclick={() => deleteBudget(entry.id)} class="text-[#555] hover:text-red-400 text-xs transition-colors">✕</button>
							</div>
						{:else}
							<div class="px-4 py-6 text-center text-[#555] text-sm">No expense entries</div>
						{/each}
					</div>
				</div>
			</div>

		<!-- ═══════════════ GROWTH ═══════════════ -->
		{:else if activeTab === 'growth'}
			<div class="mb-6">
				<div class="text-sm text-[#666] mb-4">Revenue trends over the past year based on logged balance entries and collected invoices.</div>

				<!-- Net cash flow chart -->
				{#if balanceEntries.length > 1}
					<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4 mb-4">
						<div class="text-sm font-medium mb-1">Net Cash Flow Trend</div>
						<div class="text-xs text-[#666] mb-3">Weekly balance entries — income minus expenses</div>
						<svg viewBox="0 0 700 160" class="w-full" style="height:160px">
							<defs>
								<linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stop-color="white" stop-opacity="0.1" />
									<stop offset="100%" stop-color="white" stop-opacity="0" />
								</linearGradient>
							</defs>
							{#if netChart.area}
								<path d={netChart.area} fill="url(#netGrad)" />
							{/if}
							{#if netChart.path}
								<path d={netChart.path} fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
							{/if}
							{#each netChart.points as pt, i}
								{#if i % 4 === 0}
									<text x={pt.x} y="155" text-anchor="middle" fill="#444" font-size="9">{pt.date?.slice(5)}</text>
								{/if}
							{/each}
						</svg>
					</div>

					<!-- Income trend -->
					<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4 mb-4">
						<div class="text-sm font-medium mb-1">Income Trend</div>
						<svg viewBox="0 0 700 120" class="w-full" style="height:120px">
							<defs>
								<linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stop-color="#4ade80" stop-opacity="0.15" />
									<stop offset="100%" stop-color="#4ade80" stop-opacity="0" />
								</linearGradient>
							</defs>
							{#if incomeChart.area}
								<path d={incomeChart.area} fill="url(#incGrad)" />
							{/if}
							{#if incomeChart.path}
								<path d={incomeChart.path} fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
							{/if}
						</svg>
					</div>
				{:else}
					<div class="text-center py-12 text-[#555] text-sm bg-[#111] border border-[#2a2a2a] rounded-lg mb-4">
						Log at least 2 balance entries in the Balance Tracker tab to see growth charts.
					</div>
				{/if}

				<!-- Revenue by client from invoices -->
				{#if invoices.length}
					{@const byClient = invoices
						.filter(i => i.status === 'paid')
						.reduce((acc: Record<string, number>, i) => {
							const name = i.client?.name ?? 'No Client';
							acc[name] = (acc[name] ?? 0) + (i.total ?? 0);
							return acc;
						}, {})}
					{@const maxVal = Math.max(...Object.values(byClient) as number[])}
					<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4 mb-4">
						<div class="text-sm font-medium mb-3">Revenue by Client</div>
						{#each Object.entries(byClient).sort((a, b) => (b[1] as number) - (a[1] as number)) as [name, val]}
							<div class="mb-2">
								<div class="flex justify-between text-sm mb-1">
									<span>{name}</span>
									<span class="text-green-400">{fmt(val as number)}</span>
								</div>
								<div class="w-full h-1.5 bg-[#222] rounded-full">
									<div class="h-full bg-green-400 rounded-full" style="width:{((val as number) / maxVal) * 100}%"></div>
								</div>
							</div>
						{:else}
							<div class="text-[#555] text-sm text-center py-4">No paid invoices yet.</div>
						{/each}
					</div>

					<!-- Cost of sales -->
					{#if (summary?.apiCosts?.total ?? 0) > 0}
						{@const totalRev = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total ?? 0), 0)}
						{@const costPct = totalRev > 0 ? ((summary?.apiCosts?.total ?? 0) / totalRev) * 100 : 0}
						<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4">
							<div class="text-sm font-medium mb-3">Cost of Sales (API)</div>
							<div class="grid grid-cols-3 gap-4 text-sm">
								<div class="text-center">
									<div class="text-[#666] text-xs mb-1">Revenue</div>
									<div class="font-medium text-green-400">{fmt(totalRev)}</div>
								</div>
								<div class="text-center">
									<div class="text-[#666] text-xs mb-1">API Cost</div>
									<div class="font-medium text-yellow-400">{fmtD(summary?.apiCosts?.total ?? 0)}</div>
								</div>
								<div class="text-center">
									<div class="text-[#666] text-xs mb-1">Cost %</div>
									<div class="font-medium {costPct < 5 ? 'text-green-400' : costPct < 15 ? 'text-yellow-400' : 'text-red-400'}">{costPct.toFixed(1)}%</div>
								</div>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		<!-- ═══════════════ STACK MANAGER ═══════════════ -->
		{:else if activeTab === 'stack'}

			<!-- Summary bar -->
			<div class="flex flex-wrap gap-3 mb-5">
				<div class="bg-[#111] border border-[#2a2a2a] rounded px-4 py-2 text-sm flex gap-3">
					<span class="text-[#666]">Monthly Stack</span>
					<span class="font-medium text-yellow-400">{fmt(stackMonthly)}</span>
				</div>
				<div class="bg-[#111] border border-[#2a2a2a] rounded px-4 py-2 text-sm flex gap-3">
					<span class="text-[#666]">Annual</span>
					<span class="font-medium text-yellow-400">{fmt(stackMonthly * 12)}</span>
				</div>
				<div class="bg-[#111] border border-[#2a2a2a] rounded px-4 py-2 text-sm flex gap-3">
					<span class="text-[#666]">Accounts</span>
					<span class="font-medium">{stackAccounts.filter(a => a.status === 'active').length} active</span>
					{#if stackAccounts.filter(a => a.status === 'trial').length}
						<span class="text-yellow-400">{stackAccounts.filter(a => a.status === 'trial').length} trial</span>
					{/if}
				</div>
				<button
					onclick={() => { showStackForm = !showStackForm; editingStack = null; stackForm = defaultStackForm(); }}
					class="ml-auto px-3 py-1 text-xs border border-[#333] rounded hover:border-white hover:text-white text-[#999] transition-colors"
				>
					+ Add Account
				</button>
			</div>

			<!-- Trials expiring alert -->
			{#if trialsExpiringSoon.length}
				<div class="mb-4 p-3 bg-yellow-400/10 border border-yellow-400/30 rounded text-sm text-yellow-300 flex flex-wrap gap-2">
					⚠️ Trials expiring soon:
					{#each trialsExpiringSoon as a}
						<span class="font-medium">{a.service_name} ({trialDaysLeft(a.trial_end)}d)</span>
					{/each}
				</div>
			{/if}

			<!-- Quick Add known services -->
			{#if !stackAccounts.length || stackAccounts.length < 3}
				<div class="mb-5">
					<div class="text-xs text-[#555] mb-2">Quick add known services:</div>
					<div class="flex flex-wrap gap-2">
						{#each KNOWN_SERVICES.filter(s => !stackAccounts.find(a => a.service_name === s.name)) as svc}
							<button
								onclick={() => quickAdd(svc)}
								class="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#2a2a2a] rounded-full hover:border-[#555] hover:text-white text-[#666] transition-colors"
							>
								<span>{svc.icon}</span>{svc.name}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Add/Edit Form -->
			{#if showStackForm}
				<div class="bg-[#111] border border-[#2a2a2a] rounded-lg p-4 mb-5">
					<div class="text-sm font-medium mb-3">{editingStack ? 'Edit Account' : 'Add Account'}</div>
					<div class="grid grid-cols-3 gap-3 mb-3">
						<!-- Row 1: identity -->
						<div>
							<label class="block text-xs text-[#666] mb-1">Service Name *</label>
							<input bind:value={stackForm.serviceName} placeholder="Twilio, Stripe…" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
						</div>
						<div>
							<label class="block text-xs text-[#666] mb-1">Category</label>
							<select bind:value={stackForm.serviceCategory} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
								{#each stackCategories as c}<option value={c}>{c}</option>{/each}
							</select>
						</div>
						<div>
							<label class="block text-xs text-[#666] mb-1">Status</label>
							<select bind:value={stackForm.status} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
								<option value="active">Active</option>
								<option value="trial">Trial</option>
								<option value="paused">Paused</option>
								<option value="cancelled">Cancelled</option>
							</select>
						</div>
						<!-- Row 2: login -->
						<div>
							<label class="block text-xs text-[#666] mb-1">Login Email</label>
							<input bind:value={stackForm.loginEmail} placeholder="you@email.com" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
						</div>
						<div>
							<label class="block text-xs text-[#666] mb-1">Username (if different)</label>
							<input bind:value={stackForm.loginUsername} placeholder="username" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
						</div>
						<div>
							<label class="block text-xs text-[#666] mb-1">URL</label>
							<input bind:value={stackForm.serviceUrl} placeholder="https://…" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
						</div>
						<!-- Row 3: cost -->
						<div>
							<label class="block text-xs text-[#666] mb-1">Cost ($)</label>
							<input type="number" bind:value={stackForm.cost} placeholder="0.00" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
						</div>
						<div>
							<label class="block text-xs text-[#666] mb-1">Billing Cycle</label>
							<select bind:value={stackForm.billingCycle} class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white">
								<option value="monthly">Monthly</option>
								<option value="annual">Annual</option>
								<option value="usage_based">Usage-based</option>
								<option value="free">Free</option>
								<option value="one_time">One-time</option>
							</select>
						</div>
						<div>
							<label class="block text-xs text-[#666] mb-1">Next Billing Date</label>
							<DatePicker bind:value={stackForm.nextBillingDate} onchange={(v) => stackForm.nextBillingDate = v} />
						</div>
						<!-- Row 4: trial + payment -->
						{#if stackForm.status === 'trial'}
							<div>
								<label class="block text-xs text-[#666] mb-1">Trial Start</label>
								<DatePicker bind:value={stackForm.trialStart} onchange={(v) => stackForm.trialStart = v} />
							</div>
							<div>
								<label class="block text-xs text-[#666] mb-1">Trial End *</label>
								<DatePicker bind:value={stackForm.trialEnd} onchange={(v) => stackForm.trialEnd = v} />
							</div>
						{/if}
						<div>
							<label class="block text-xs text-[#666] mb-1">Payment Method</label>
							<input bind:value={stackForm.paymentMethodLabel} placeholder="Visa •••• 4242" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
						</div>
						<!-- Row 5: password + notes -->
						<div class="col-span-3">
							<label class="flex items-center gap-2 text-xs text-[#999] cursor-pointer">
								<input type="checkbox" bind:checked={stackForm.createPassword} class="accent-white" />
								Store password in vault for this account
							</label>
						</div>
						{#if stackForm.createPassword}
							<div class="col-span-3">
								<label class="block text-xs text-[#666] mb-1">Password</label>
								<input type="password" bind:value={stackForm.rawPassword} placeholder="Enter password to vault" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
								<p class="text-xs text-[#555] mt-1">Stored in your Password Vault — visible only to you.</p>
							</div>
						{/if}
						<div class="col-span-3">
							<label class="block text-xs text-[#666] mb-1">Notes</label>
							<input bind:value={stackForm.notes} placeholder="Optional" class="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-[#555]" />
						</div>
					</div>
					<div class="flex gap-2">
						<button onclick={saveStackAccount} disabled={stackSaving || !stackForm.serviceName} class="px-4 py-2 bg-white text-black rounded text-sm font-medium hover:bg-[#e5e5e5] disabled:opacity-50 transition-colors">
							{stackSaving ? 'Saving…' : editingStack ? 'Update' : 'Add Account'}
						</button>
						<button onclick={() => { showStackForm = false; editingStack = null; }} class="px-4 py-2 border border-[#333] rounded text-sm text-[#999] hover:border-white hover:text-white transition-colors">Cancel</button>
					</div>
				</div>
			{/if}

			<!-- Account list -->
			{#each stackCategories as cat}
				{@const items = stackAccounts.filter(a => a.service_category === cat)}
				{#if items.length}
					<div class="mb-4">
						<div class="text-xs uppercase tracking-wide mb-2 {stackCatColors[cat] ?? 'text-[#666]'}">{cat}</div>
						<div class="space-y-2">
							{#each items as acct}
								{@const days = acct.trial_end ? trialDaysLeft(acct.trial_end) : null}
								<div class="bg-[#111] border border-[#2a2a2a] rounded-lg overflow-hidden">
									<div class="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-[#161616] transition-colors"
										onclick={() => expandedAccount = expandedAccount === acct.id ? null : acct.id}
									>
										<div class="text-xl w-7 text-center flex-shrink-0">{acct.service_icon ?? '🔧'}</div>
										<div class="flex-1 min-w-0">
											<div class="flex items-center gap-2">
												<span class="font-medium text-sm">{acct.service_name}</span>
												<span class="text-xs px-2 py-0.5 rounded-full {stackStatusColor(acct.status)}">{acct.status}</span>
												{#if days !== null && days >= 0 && days <= 14}
													<span class="text-xs text-yellow-400">⏱ {days}d left</span>
												{:else if days !== null && days < 0}
													<span class="text-xs text-red-400">Trial expired</span>
												{/if}
											</div>
											<div class="text-xs text-[#555] mt-0.5">
												{acct.login_email ? `${acct.login_email.slice(0,3)}…${acct.login_email.slice(acct.login_email.indexOf('@'))}` : ''}
												{acct.payment_method_label ? ` · ${acct.payment_method_label}` : ''}
											</div>
										</div>
										<div class="text-right flex-shrink-0">
											{#if acct.billing_cycle === 'free'}
												<div class="text-sm text-green-400">Free</div>
											{:else if acct.billing_cycle === 'usage_based'}
												<div class="text-sm text-[#999]">Usage</div>
											{:else}
												<div class="text-sm font-medium">{fmtD(parseFloat(acct.cost ?? 0))}</div>
												<div class="text-xs text-[#555]">/{acct.billing_cycle === 'annual' ? 'yr' : 'mo'}</div>
											{/if}
										</div>
										<div class="text-[#555] text-xs flex-shrink-0">{expandedAccount === acct.id ? '▲' : '▼'}</div>
									</div>
									{#if expandedAccount === acct.id}
										<div class="border-t border-[#2a2a2a] px-4 py-3 bg-[#0d0d0d]">
											<div class="grid grid-cols-3 gap-4 text-sm mb-3">
												{#if acct.service_url}
													<div>
														<div class="text-xs text-[#555] mb-0.5">URL</div>
														<a href={acct.service_url} target="_blank" rel="noopener" class="text-blue-400 hover:underline text-xs">{acct.service_url}</a>
													</div>
												{/if}
												{#if acct.login_email}
													<div>
														<div class="text-xs text-[#555] mb-0.5">Login</div>
														<div class="text-xs font-mono">{acct.login_email}</div>
													</div>
												{/if}
												{#if acct.next_billing_date}
													<div>
														<div class="text-xs text-[#555] mb-0.5">Next Billing</div>
														<div class="text-xs font-mono">{new Date(acct.next_billing_date).toLocaleDateString()}</div>
													</div>
												{/if}
											</div>
										</div>
									{