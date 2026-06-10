<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import DatePicker from '$lib/components/DatePicker.svelte';

	interface Report {
		id: string; report_type: string; report_title: string;
		created_at: string; html_content: string; content: string;
		client?: { name: string }; project?: { name: string };
	}

	let reports = $state<Report[]>([]);
	let selected = $state<Report | null>(null);
	let loading = $state(true);
	let showModal = $state<'report' | 'invoice' | null>(null);
	let generating = $state(false);
	let shareUrl = $state('');
	let sharing = $state(false);

	async function shareReport(id: string) {
		sharing = true; shareUrl = '';
		const res = await apiFetch('/api/portal', { method: 'POST', body: JSON.stringify({ reportId: id }) });
		if (res.ok) {
			const d = await res.json();
			shareUrl = window.location.origin + d.url;
			navigator.clipboard.writeText(shareUrl).then(() => toastSuccess('Share link copied')).catch(() => {});
		} else {
			toastError('Failed to create share link');
		}
		sharing = false;
	}

	// Report form
	let reportTitle = $state('');
	let reportDateFrom = $state('');
	let reportDateTo = $state(new Date().toISOString().slice(0,10));
	let reportContext = $state('');

	// Invoice form
	let invClientName = $state('');
	// ACH fields
	let invBankName = $state('');
	let invRouting = $state('');
	let invAccount = $state('');
	let invAccountType = $state('checking');
	let invMemo = $state('');
	let invHours = $state(0);
	let invRate = $state(150);
	let invTax = $state(0);
	let invDate = $state(new Date().toISOString().slice(0,10));
	let invDueDate = $state('');
	let invServices = $state('Sales development services');

	onMount(load);

	async function load() {
		loading = true;
		const res = await apiFetch('/api/reports');
		reports = res.ok ? await res.json() : [];
		loading = false;
	}

	async function generateReport() {
		if (!reportTitle) return;
		generating = true;
		const res = await apiFetch('/api/reports', {
			method: 'POST',
			body: JSON.stringify({
				type: 'action_report',
				title: reportTitle,
				dateFrom: reportDateFrom || undefined,
				dateTo: reportDateTo || undefined,
				extraContext: reportContext || undefined,
			}),
		});
		if (res.ok) {
			const r = await res.json();
			reports = [r, ...reports];
			selected = r;
			showModal = null;
			reportTitle = ''; reportContext = '';
			toastSuccess('Report generated');
		} else {
			toastError('Failed to generate report');
		}
		generating = false;
	}

	async function generateInvoice() {
		if (!invClientName || !invHours || !invRate) return;
		generating = true;
		const res = await apiFetch('/api/invoices', {
			method: 'POST',
			body: JSON.stringify({
				clientName: invClientName,
				hoursWorked: invHours,
				hourlyRate: invRate,
				taxPercent: invTax,
				invoiceDate: invDate,
				dueDate: invDueDate || undefined,
				services: invServices,
			}),
		});
		if (res.ok) {
			await load();
			showModal = null;
			toastSuccess('Invoice created');
		} else {
			toastError('Failed to create invoice');
		}
		generating = false;
	}

	async function deleteReport(id: string) {
		if (!confirm('Delete this report?')) return;
		const res = await apiFetch(`/api/reports/${id}`, { method: 'DELETE' });
		if (res.ok) {
			if (selected?.id === id) selected = null;
			reports = reports.filter(r => r.id !== id);
			toastSuccess('Report deleted');
		} else {
			toastError('Failed to delete report');
		}
	}

	function printReport() {
		if (!selected?.html_content) return;
		const w = window.open('', '_blank');
		if (!w) { toastError('Allow pop-ups to print'); return; }
		w.document.write(selected.html_content);
		w.document.close();
		w.print();
	}

	function typeLabel(t: string) {
		return t === 'invoice' ? '📄 Invoice' : '📊 Report';
	}
</script>

<svelte:head><title>Reports — Edelhaus</title></svelte:head>

<div class="flex flex-col flex-1 h-full">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between">
		<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Reports & Invoices</h2>
		<div class="flex gap-2">
			<button onclick={() => showModal = 'report'}
				class="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
				+ Action Report
			</button>
			<button onclick={() => showModal = 'invoice'}
				class="rounded-lg border border-[#2a2a2a] px-4 py-1.5 text-xs text-[#999] hover:border-white hover:text-white transition-colors">
				+ Invoice
			</button>
		</div>
	</div>

	<div class="flex flex-1 overflow-hidden">
		<!-- List -->
		<div class="w-72 shrink-0 border-r border-[#1e1e1e] overflow-y-auto">
			{#if loading}
		<div class="p-8 space-y-3">
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
		</div>
	{:else if reports.length === 0}
				<p class="text-[#6e6e6e] text-xs text-center py-8">No reports yet</p>
			{:else}
				{#each reports as report}
					<button onclick={() => selected = report}
						class="w-full text-left px-4 py-3 border-b border-[#1e1e1e] transition-colors {selected?.id === report.id ? 'bg-white/10' : 'hover:bg-white/5'}">
						<p class="text-xs text-[#7c7c7c] mb-0.5">{typeLabel(report.report_type)}</p>
						<p class="text-sm text-white font-medium truncate">{report.report_title}</p>
						<p class="text-xs text-[#6e6e6e] mt-0.5">{new Date(report.created_at).toLocaleDateString()}</p>
					</button>
				{/each}
			{/if}
		</div>

		<!-- Detail -->
		<div class="flex-1 overflow-y-auto">
			{#if selected}
				<div class="flex flex-col h-full">
					<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between shrink-0">
						<p class="text-white text-sm font-medium">{selected.report_title}</p>
						<div class="flex gap-2">
							<button onclick={printReport}
								class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#999] hover:border-white hover:text-white transition-colors">
								Print / PDF
							</button>
							<button onclick={() => deleteReport(selected!.id)}
								class="text-xs text-red-700 hover:text-red-400 transition-colors px-2">
								Delete
							</button>
						</div>
					</div>
					<!-- Render HTML report -->
					<div class="flex-1 overflow-y-auto bg-white">
						{#if selected.html_content}
							<iframe srcdoc={selected.html_content} class="w-full h-full border-0" title="Report"></iframe>
						{:else}
							<div class="p-8 text-gray-600 whitespace-pre-wrap text-sm">{selected.content}</div>
						{/if}
					</div>
				</div>
			{:else}
				<div class="flex items-center justify-center h-full">
					<p class="text-[#6e6e6e] text-sm">Select a report or generate a new one</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Action Report Modal -->
{#if showModal === 'report'}
	<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
		onclick={() => showModal = null} role="dialog" aria-modal="true">
		<div class="bg-[#111111] border border-[#2a2a2a] rounded-xl w-[500px]"
			onclick={(e) => e.stopPropagation()}>
			<div class="p-5 border-b border-[#2a2a2a] flex justify-between">
				<p class="text-white font-medium">Generate Action Report</p>
				<button onclick={() => showModal = null} class="text-[#8a8a8a] hover:text-white"><Icon name="x" size={14} /></button>
			</div>
			<div class="p-5 space-y-4">
				<div>
					<label class="block text-xs text-[#999] uppercase tracking-widest mb-1.5">Report Title *</label>
					<input bind:value={reportTitle} placeholder="Q2 2026 Sales Activity Report"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs text-[#999] uppercase tracking-widest mb-1.5">From Date</label>
						<DatePicker bind:value={reportDateFrom} onchange={(v) => reportDateFrom = v} />
					</div>
					<div>
						<label class="block text-xs text-[#999] uppercase tracking-widest mb-1.5">To Date</label>
						<DatePicker bind:value={reportDateTo} onchange={(v) => reportDateTo = v} />
					</div>
				</div>
				<div>
					<label class="block text-xs text-[#999] uppercase tracking-widest mb-1.5">Additional Context (optional)</label>
					<textarea bind:value={reportContext} rows="3"
						placeholder="e.g. This report is for Acme Corp Q2 review. Focus on enterprise leads."
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none">
					</textarea>
				</div>
				<button onclick={generateReport} disabled={generating || !reportTitle}
					class="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-50 transition-colors">
					{generating ? 'Generating with Claude...' : 'Generate Report'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Invoice Modal -->
{#if showModal === 'invoice'}
	<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
		onclick={() => showModal = null} role="dialog" aria-modal="true">
		<div class="bg-[#111111] border border-[#2a2a2a] rounded-xl w-[500px]"
			onclick={(e) => e.stopPropagation()}>
			<div class="p-5 border-b border-[#2a2a2a] flex justify-between">
				<p class="text-white font-medium">Create Invoice</p>
				<button onclick={() => showModal = null} class="text-[#8a8a8a] hover:text-white"><Icon name="x" size={14} /></button>
			</div>
			<div class="p-5 space-y-4">
				<div>
					<label class="block text-xs text-[#999] uppercase tracking-widest mb-1.5">Client Name *</label>
					<input bind:value={invClientName} placeholder="Acme Corp"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
				</div>
				<div>
					<label class="block text-xs text-[#999] uppercase tracking-widest mb-1.5">Services Description</label>
					<input bind:value={invServices} placeholder="Sales development services"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
				</div>
				<div class="grid grid-cols-3 gap-3">
					<div>
						<label class="block text-xs text-[#999] uppercase tracking-widest mb-1.5">Hours *</label>
						<input type="number" bind:value={invHours} min="0" step="0.5"
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
					</div>
					<div>
						<label class="block text-xs text-[#999] uppercase tracking-widest mb-1.5">Rate ($/hr) *</label>
						<input type="number" bind:value={invRate} min="0"
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
					</div>
					<div>
						<label class="block text-xs text-[#999] uppercase tracking-widest mb-1.5">Tax %</label>
						<input type="number" bind:value={invTax} min="0" max="100"
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
					</div>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs text-[#999] uppercase tracking-widest mb-1.5">Invoice Date</label>
						<DatePicker bind:value={invDate} onchange={(v) => invDate = v} />
					</div>
					<div>
						<label class="block text-xs text-[#999] uppercase tracking-widest mb-1.5">Due Date</label>
						<DatePicker bind:value={invDueDate} onchange={(v) => invDueDate = v} />
					</div>
				</div>
				<!-- ACH Section -->
				<div class="space-y-3">
					<p class="text-xs text-[#999] uppercase tracking-widest">Payment Info (ACH) — Optional</p>
					<div class="grid grid-cols-2 gap-2">
						<input bind:value={invBankName} placeholder="Bank name"
							class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" />
						<select bind:value={invAccountType}
							class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:border-white focus:outline-none">
							<option value="checking">Checking</option>
							<option value="savings">Savings</option>
						</select>
						<input bind:value={invRouting} placeholder="Routing number"
							class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" style="font-family:var(--font-mono)" />
						<input bind:value={invAccount} placeholder="Account number"
							class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" style="font-family:var(--font-mono)" />
					</div>
					<input bind:value={invMemo} placeholder="Payment memo / reference (optional)"
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" />
				</div>
				<!-- Total preview -->
				{#if invHours > 0 && invRate > 0}
					<div class="rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] p-3 text-sm">
						<div class="flex justify-between text-[#888]"><span>Subtotal</span><span>${(invHours * invRate).toFixed(2)}</span></div>
						{#if invTax > 0}<div class="flex justify-between text-[#888]"><span>Tax ({invTax}%)</span><span>${(invHours * invRate * invTax / 100).toFixed(2)}</span></div>{/if}
						<div class="flex justify-between text-white font-semibold mt-1 pt-1 border-t border-[#2a2a2a]">
							<span>Total</span>
							<span>${(invHours * invRate * (1 + invTax / 100)).toFixed(2)}</span>
						</div>
					</div>
				{/if}
				<button onclick={generateInvoice} disabled={generating || !invClientName || !invHours || !invRate}
					class="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-50 transition-colors">
					{generating ? 'Creating...' : 'Create Invoice'}
				</button>
			</div>
		</div>
	</div>
{/if}
