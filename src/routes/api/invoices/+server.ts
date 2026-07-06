import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import { BRAND } from '$lib/brand';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('invoices')
		.select('*, client:clients(id, name), report:generated_reports(report_title)')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false });
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const {
		clientId, clientName, hoursWorked, hourlyRate, taxPercent,
		invoiceDate, dueDate, services, bankName, routingNumber, accountNumber, accountType, paymentMemo,
		contractType, contractStart, contractEnd, scopeOfWork,
		expectedHoursWeekly, expectedHoursMonthly, projectIds,
	} = await request.json();

	const subtotal = hoursWorked * hourlyRate;
	const taxAmount = subtotal * ((taxPercent ?? 0) / 100);
	const total = subtotal + taxAmount;

	// Generate invoice number (INV-YYYYMMDD-XXX)
	const date = new Date(invoiceDate ?? new Date());
	const dateStr = date.toISOString().slice(0,10).replace(/-/g,'');
	const count = Math.floor(Math.random() * 900) + 100;
	const invoiceNumber = `INV-${dateStr}-${count}`;

	const htmlContent = generateInvoiceHtml({
		bankName: bankName ?? '', routingNumber: routingNumber ?? '',
		accountNumber: accountNumber ?? '', accountType: accountType ?? 'checking',
		paymentMemo: paymentMemo ?? '',
		invoiceNumber, clientName: clientName ?? 'Client',
		invoiceDate: invoiceDate ?? new Date().toISOString().slice(0,10),
		dueDate: dueDate ?? '',
		hoursWorked, hourlyRate, subtotal, taxPercent: taxPercent ?? 0, taxAmount, total,
		services: services ?? 'Sales development services',
		contractType: contractType ?? 'invoice',
		scopeOfWork: scopeOfWork ?? '',
		contractStart: contractStart ?? '',
		contractEnd: contractEnd ?? '',
	});

	const { data: invoice, error: e } = await supabaseAdmin
		.from('invoices')
		.insert({
			user_id: user.id,
			client_id: clientId ?? null,
			invoice_number: invoiceNumber,
			invoice_date: invoiceDate ?? new Date().toISOString().slice(0,10),
			due_date: dueDate ?? null,
			hours_worked: hoursWorked,
			hourly_rate: hourlyRate,
			subtotal,
			tax_percent: taxPercent ?? 0,
			tax_amount: taxAmount,
			total,
			bank_name: bankName ?? null,
			routing_number: routingNumber ?? null,
			account_number: accountNumber ?? null,
			account_type: accountType ?? 'checking',
			payment_memo: paymentMemo ?? null,
			contract_type: contractType ?? 'invoice',
			contract_start: contractStart ?? null,
			contract_end: contractEnd ?? null,
			scope_of_work: scopeOfWork ?? null,
			expected_hours_weekly: expectedHoursWeekly ?? null,
			expected_hours_monthly: expectedHoursMonthly ?? null,
			project_ids: projectIds?.length ? projectIds : null,
		})
		.select()
		.single();

	if (e) throw error(500, e.message);

	// Also save as a report for unified listing
	await supabaseAdmin.from('generated_reports').insert({
		user_id: user.id,
		client_id: clientId ?? null,
		report_type: 'invoice',
		report_title: `Invoice ${invoiceNumber}`,
		html_content: htmlContent,
		content: `Invoice ${invoiceNumber}\nTotal: $${total.toFixed(2)}`,
	});

	return json({ ...invoice, html_content: htmlContent });
};

function generateInvoiceHtml(d: {
	invoiceNumber: string; clientName: string; invoiceDate: string; dueDate: string;
	hoursWorked: number; hourlyRate: number; subtotal: number;
	taxPercent: number; taxAmount: number; total: number; services: string;
	bankName?: string; routingNumber?: string; accountNumber?: string; accountType?: string; paymentMemo?: string;
	contractType?: string; scopeOfWork?: string; contractStart?: string; contractEnd?: string;
}) {
	const contractLabel: Record<string, string> = {
		invoice: 'Invoice', retainer: 'Monthly Retainer', project: 'Project-Based', hourly: 'Hourly',
	};
	const typeLabel = contractLabel[d.contractType ?? 'invoice'] ?? 'Invoice';

	return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:40px;color:#111;line-height:1.6}
  .header{display:flex;justify-content:space-between;margin-bottom:40px}
  h1{font-size:32px;margin:0}
  .label{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-bottom:4px}
  table{width:100%;border-collapse:collapse;margin:24px 0}
  th{text-align:left;border-bottom:2px solid #111;padding:8px 0;font-size:13px;text-transform:uppercase;letter-spacing:1px}
  td{padding:12px 0;border-bottom:1px solid #eee}
  .total-row td{border-top:2px solid #111;border-bottom:none;font-weight:bold;font-size:18px}
  .right{text-align:right}
  .scope{margin-top:24px;padding:16px;background:#f9f9f9;border-left:3px solid #111;font-size:14px}
  @media print{body{margin:0}}
</style>
</head><body>
<div class="header">
  <div><h1>${typeLabel}</h1>${d.contractType && d.contractType !== 'invoice' ? `<div style="color:#666;font-size:14px;margin-top:4px">${typeLabel}</div>` : ''}</div>
  <div style="text-align:right">
    <div class="label">Invoice #</div><div style="font-size:18px;font-weight:bold">${d.invoiceNumber}</div>
  </div>
</div>

<div style="display:flex;gap:60px;margin-bottom:40px">
  <div>
    <div class="label">Bill To</div>
    <div style="font-size:18px;font-weight:bold">${d.clientName}</div>
  </div>
  <div>
    <div class="label">Invoice Date</div>
    <div>${d.invoiceDate}</div>
    ${d.dueDate ? `<div class="label" style="margin-top:8px">Due Date</div><div>${d.dueDate}</div>` : ''}
    ${d.contractStart ? `<div class="label" style="margin-top:8px">Contract Period</div><div>${d.contractStart}${d.contractEnd ? ` – ${d.contractEnd}` : ''}</div>` : ''}
  </div>
</div>

${d.scopeOfWork ? `<div class="scope"><div class="label">Scope of Work</div><div style="margin-top:6px">${d.scopeOfWork}</div></div>` : ''}

<table>
  <thead><tr><th>Description</th><th>Hours</th><th>Rate</th><th class="right">Amount</th></tr></thead>
  <tbody>
    <tr>
      <td>${d.services}</td>
      <td>${d.hoursWorked}</td>
      <td>$${d.hourlyRate}/hr</td>
      <td class="right">$${d.subtotal.toFixed(2)}</td>
    </tr>
    ${d.taxPercent > 0 ? `<tr><td colspan="3">Tax (${d.taxPercent}%)</td><td class="right">$${d.taxAmount.toFixed(2)}</td></tr>` : ''}
    <tr class="total-row"><td colspan="3">Total Due</td><td class="right">$${d.total.toFixed(2)}</td></tr>
  </tbody>
</table>

${(d.routingNumber || d.accountNumber) ? `<div style="margin-top:40px;padding-top:20px;border-top:1px solid #eee"><div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-bottom:12px">ACH Payment Info</div><table style="width:100%;font-size:14px;border-collapse:collapse">${d.bankName ? '<tr><td style="color:#666;width:40%">Bank</td><td>' + d.bankName + '</td></tr>' : ''}${d.routingNumber ? '<tr><td style="color:#666">Routing #</td><td style="font-family:monospace">' + d.routingNumber + '</td></tr>' : ''}${d.accountNumber ? '<tr><td style="color:#666">Account #</td><td style="font-family:monospace">' + d.accountNumber + '</td></tr>' : ''}${d.paymentMemo ? '<tr><td style="color:#666">Memo</td><td>' + d.paymentMemo + '</td></tr>' : ''}</table></div>` : ''}<p style="margin-top:60px;font-size:12px;color:#666">Generated by ${BRAND} · ${new Date().toLocaleDateString()}</p>
</body></html>`;
}
