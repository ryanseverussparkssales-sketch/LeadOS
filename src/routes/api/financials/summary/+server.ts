import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const userId = await getEffectiveUserId(user.id);

	const period = url.searchParams.get('period') ?? 'month'; // month | quarter | year
	const now = new Date();
	let since: Date;

	if (period === 'quarter') {
		since = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
	} else if (period === 'year') {
		since = new Date(now.getFullYear(), 0, 1);
	} else {
		since = new Date(now.getFullYear(), now.getMonth(), 1);
	}
	const sinceStr = since.toISOString().slice(0, 10);

	// Run all queries in parallel
	const [invoicesRes, dealsRes, quotaRes, apiCostRes, techStackRes, balanceRes] = await Promise.all([
		// All invoices this period
		supabaseAdmin
			.from('invoices')
			.select('total, status, paid_at, invoice_date, client:clients(name)')
			.eq('user_id', userId)
			.gte('invoice_date', sinceStr),

		// Pipeline deals value
		supabaseAdmin
			.from('deals')
			.select('value, stage, won_at, client:clients(name)')
			.eq('user_id', userId)
			.not('stage', 'in', '("lost")'),

		// Active quota
		supabaseAdmin
			.from('quotas')
			.select('*')
			.eq('user_id', userId)
			.lte('period_start', now.toISOString().slice(0, 10))
			.gte('period_end', now.toISOString().slice(0, 10)),

		// API costs this period
		supabaseAdmin
			.from('api_usage_log')
			.select('total_cost, twilio_cost, groq_cost, claude_cost')
			.eq('user_id', userId)
			.gte('created_at', since.toISOString()),

		// Active tech stack monthly spend
		supabaseAdmin
			.from('tech_stack_items')
			.select('name, monthly_cost, billing_cycle, category')
			.eq('user_id', userId)
			.eq('active', true),

		// Balance entries this period
		supabaseAdmin
			.from('balance_entries')
			.select('entry_date, income, expenses')
			.eq('user_id', userId)
			.gte('entry_date', sinceStr)
			.order('entry_date', { ascending: true }),
	]);

	const invoices = invoicesRes.data ?? [];
	const deals = dealsRes.data ?? [];
	const quotas = quotaRes.data ?? [];
	const apiCosts = apiCostRes.data ?? [];
	const techStack = techStackRes.data ?? [];
	const balance = balanceRes.data ?? [];

	// Invoice aggregation
	const totalInvoiced = invoices.reduce((s, i) => s + (i.total ?? 0), 0);
	const totalPaid = invoices
		.filter((i) => i.status === 'paid')
		.reduce((s, i) => s + (i.total ?? 0), 0);
	const totalOutstanding = invoices
		.filter((i) => i.status !== 'paid')
		.reduce((s, i) => s + (i.total ?? 0), 0);
	const overdueInvoices = invoices.filter(
		(i) => i.status === 'open' && i.invoice_date && new Date(i.invoice_date) < now
	);

	// Deal aggregation
	const pipelineValue = deals
		.filter((d) => !['won', 'lost'].includes(d.stage))
		.reduce((s, d) => s + (d.value ?? 0), 0);
	const wonValue = deals
		.filter((d) => d.stage === 'won')
		.reduce((s, d) => s + (d.value ?? 0), 0);

	// API cost aggregation
	const totalApiCost = apiCosts.reduce((s, r) => s + (r.total_cost ?? 0), 0);
	const twilioTotal = apiCosts.reduce((s, r) => s + (r.twilio_cost ?? 0), 0);
	const groqTotal = apiCosts.reduce((s, r) => s + (r.groq_cost ?? 0), 0);
	const claudeTotal = apiCosts.reduce((s, r) => s + (r.claude_cost ?? 0), 0);

	// Tech stack monthly total
	const techMonthly = techStack.reduce((s, t) => {
		const monthly =
			t.billing_cycle === 'annual'
				? (t.monthly_cost ?? 0) / 12
				: t.billing_cycle === 'one_time'
					? 0
					: (t.monthly_cost ?? 0);
		return s + monthly;
	}, 0);

	// Balance aggregation
	const totalIncome = balance.reduce((s, b) => s + (b.income ?? 0), 0);
	const totalExpenses = balance.reduce((s, b) => s + (b.expenses ?? 0), 0);
	const netBalance = totalIncome - totalExpenses;

	// Quota progress
	const revenueQuota = quotas.find((q) => q.quota_type === 'revenue');
	const quotaProgress = revenueQuota
		? { target: revenueQuota.target_value, actual: totalPaid + wonValue, pct: Math.round(((totalPaid + wonValue) / revenueQuota.target_value) * 100) }
		: null;

	// MRR from balance entries — monthly income trend
	const mrrTrend = balance.map((b) => ({
		date: b.entry_date,
		income: b.income,
		expenses: b.expenses,
		net: (b.income ?? 0) - (b.expenses ?? 0),
	}));

	return json({
		period,
		since: sinceStr,
		invoices: {
			total: invoices.length,
			totalInvoiced,
			totalPaid,
			totalOutstanding,
			overdueCount: overdueInvoices.length,
			recentInvoices: invoices.slice(0, 5),
		},
		deals: { pipelineValue, wonValue },
		apiCosts: { total: totalApiCost, twilio: twilioTotal, groq: groqTotal, claude: claudeTotal },
		techStack: { monthlyTotal: techMonthly, annualTotal: techMonthly * 12, items: techStack },
		balance: { totalIncome, totalExpenses, netBalance, trend: mrrTrend },
		quota: quotaProgress,
	});
};
