<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import { titleFor } from '$lib/brand';

	interface Step { id?:string; step_number:number; delay_days:number; subject:string; body:string; email_type:string; channel:string; sms_body:string|null; }
	interface Sequence { id:string; name:string; description:string|null; trigger_type:string; status:string; steps:Step[]; created_at:string; }

	let sequences = $state<Sequence[]>([]);
	let loading = $state(true);
	let selected = $state<Sequence|null>(null);
	let showNew = $state(false);
	let saving = $state(false);
	let advancing = $state(false);
	let advanceMsg = $state('');

	async function advanceSequences() {
		advancing = true;
		const res = await apiFetch('/api/sequences/advance', { method:'POST' });
		if (res.ok) { const d = await res.json(); advanceMsg = `${d.advanced} step${d.advanced !== 1 ? 's' : ''} advanced`; setTimeout(() => advanceMsg = '', 3000); }
		else { toastError('Failed to run due steps'); }
		advancing = false;
	}

	// New sequence form
	let nName = $state(''); let nDesc = $state(''); let nTrigger = $state('manual');
	let nSteps = $state<Partial<Step>[]>([{ step_number:1, delay_days:0, subject:'', body:'', email_type:'follow_up', channel:'email', sms_body:'' }]);

	onMount(async () => {
		const res = await apiFetch('/api/sequences');
		sequences = res.ok ? await res.json() : [];
		loading = false;
	});

	function stepInvalid(s: Partial<Step>): boolean {
		const ch = s.channel ?? 'email';
		if (ch === 'email') return !s.subject || !s.body;
		if (ch === 'sms') return !(s.sms_body ?? '').trim();
		return false; // call_task needs no content
	}

	async function createSequence() {
		if (!nName.trim() || nSteps.some(stepInvalid)) { toastError('Add a name and fill in every step\'s content (subject + body for email, message for SMS)'); return; }
		saving = true;
		const res = await apiFetch('/api/sequences', { method:'POST', body: JSON.stringify({ name:nName, description:nDesc||null, triggerType:nTrigger, steps:nSteps }) });
		if (res.ok) { const s = await res.json(); sequences = [s, ...sequences]; showNew = false; nName = ''; nSteps = [{ step_number:1, delay_days:0, subject:'', body:'', email_type:'follow_up', channel:'email', sms_body:'' }]; toastSuccess('Sequence created'); }
		else { toastError('Failed to create sequence'); }
		saving = false;
	}

	async function deleteSeq(id: string) {
		if (!confirm('Delete this sequence?')) return;
		const res = await apiFetch(`/api/sequences/${id}`, { method:'DELETE' });
		if (res.ok) {
			sequences = sequences.filter(s => s.id !== id);
			if (selected?.id === id) selected = null;
			toastSuccess('Sequence deleted');
		} else {
			toastError('Failed to delete sequence');
		}
	}

	function addStep() { nSteps = [...nSteps, { step_number: nSteps.length+1, delay_days: 3, subject:'', body:'', email_type:'follow_up', channel:'email', sms_body:'' }]; }
	function removeStep(i: number) { nSteps = nSteps.filter((_, idx) => idx !== i); }

	// ---- Per-step editing (existing sequences) ----
	let editingStepId = $state<string|null>(null);
	let editForm = $state<Partial<Step>>({});
	let stepSaving = $state(false);

	function startEditStep(step: Step) {
		editingStepId = step.id ?? null;
		editForm = { channel: step.channel === 'sms' || step.channel === 'call_task' ? step.channel : 'email', subject: step.subject ?? '', body: step.body ?? '', sms_body: step.sms_body ?? '', delay_days: step.delay_days ?? 0, email_type: step.email_type ?? 'follow_up' };
	}
	function cancelEditStep() { editingStepId = null; editForm = {}; }

	// Write the fresh steps into both the detail pane and the sidebar list.
	function syncSteps(steps: Step[]) {
		if (!selected) return;
		selected.steps = steps;
		sequences = sequences.map(s => s.id === selected!.id ? { ...s, steps } : s);
	}

	async function saveStep() {
		if (!editingStepId || stepInvalid(editForm)) { toastError('Fill in the step\'s content (subject + body for email, message for SMS)'); return; }
		stepSaving = true;
		const res = await apiFetch(`/api/sequences/steps/${editingStepId}`, { method:'PATCH', body: JSON.stringify({ channel: editForm.channel, subject: editForm.subject, body: editForm.body, sms_body: editForm.sms_body, delay_days: editForm.delay_days, email_type: editForm.email_type }) });
		if (res.ok) {
			const updated: Step = await res.json();
			syncSteps((selected?.steps ?? []).map(st => st.id === updated.id ? updated : st));
			cancelEditStep();
			toastSuccess('Step updated');
		} else {
			const err = await res.json().catch(() => null);
			toastError(err?.message ?? 'Failed to update step');
		}
		stepSaving = false;
	}

	async function deleteStep(step: Step) {
		if (!step.id || !confirm(`Delete step ${step.step_number}? Remaining steps will be re-numbered.`)) return;
		const res = await apiFetch(`/api/sequences/steps/${step.id}`, { method:'DELETE' });
		if (res.ok) {
			const d = await res.json();
			syncSteps(d.steps ?? (selected?.steps ?? []).filter(st => st.id !== step.id));
			if (editingStepId === step.id) cancelEditStep();
			toastSuccess('Step deleted');
		} else {
			toastError('Failed to delete step');
		}
	}

	const TRIGGER_LABELS: Record<string,string> = { manual:'Manual', lead_arrived:'Lead Arrived', call_completed:'Call Completed', callback_outcome:'Callback Outcome' };
	const CHANNEL_LABELS: Record<string,string> = { email:'Email', sms:'SMS', call_task:'Call task' };
	const CHANNEL_ICONS: Record<string,string> = { email:'✉', sms:'✎', call_task:'✆' };
	const CHANNEL_COLORS: Record<string,string> = { email:'border-[#2a2a2a] text-[#9ab6ff]', sms:'border-[#2a2a2a] text-[#7fd7a4]', call_task:'border-[#2a2a2a] text-[#e8b26b]' };
	const SMS_SOFT_LIMIT = 320;
</script>

<svelte:head><title>{titleFor('Sequences')}</title></svelte:head>

<div class="flex flex-col flex-1 h-full">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between">
		<div>
			<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Sequences</h2>
			<p class="text-xs text-[#7c7c7c] mt-0.5">Automated multi-channel cadences — email, SMS, and call tasks over time</p>
		</div>
		<div class="flex gap-2">
		<button onclick={advanceSequences} disabled={advancing} class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#999] hover:border-white hover:text-white transition-colors">{advancing ? 'Running...' : '▶ Run Due Steps'}</button>
		<button onclick={() => showNew = !showNew} class="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">+ New Sequence</button>
	</div>
	</div>

	{#if loading}
		<div class="flex-1 p-8 space-y-3">
			{#each [1,2,3,4,5] as _}
				<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			{/each}
		</div>
	{:else}

	{#if showNew}
		<div class="border-b border-[#1e1e1e] bg-[#0d0d0d] p-6 overflow-y-auto max-h-[70vh]">
			<div class="max-w-2xl space-y-4">
				<div class="grid grid-cols-2 gap-4">
					<div><label class="text-xs text-[#7c7c7c] block mb-1">Name *</label><input bind:value={nName} placeholder="Q2 Follow-up Sequence" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" /></div>
					<div><label class="text-xs text-[#7c7c7c] block mb-1">Trigger</label>
						<select bind:value={nTrigger} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
							{#each Object.entries(TRIGGER_LABELS) as [v, l]}<option value={v}>{l}</option>{/each}
						</select>
					</div>
					<div class="col-span-2"><label class="text-xs text-[#7c7c7c] block mb-1">Description</label><input bind:value={nDesc} placeholder="Follow-up after first call" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" /></div>
				</div>

				<div class="space-y-3">
					<p class="text-xs text-[#999] uppercase tracking-widest">Steps</p>
					{#each nSteps as step, i}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 space-y-3 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-3">
									<p class="text-xs text-white font-medium">Step {i+1}</p>
									<div class="flex rounded-lg border border-[#2a2a2a] overflow-hidden">
										{#each Object.entries(CHANNEL_LABELS) as [v, l]}
											<button onclick={() => step.channel = v} class="px-2.5 py-1 text-[11px] transition-colors {(step.channel ?? 'email') === v ? 'bg-white text-black font-semibold' : 'bg-[#1a1a1a] text-[#7c7c7c] hover:text-white'}">{l}</button>
										{/each}
									</div>
								</div>
								<div class="flex items-center gap-3">
									<div class="flex items-center gap-2">
										<label class="text-xs text-[#7c7c7c]">Send after</label>
										<input type="number" bind:value={step.delay_days} min="0" class="w-16 rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white focus:outline-none" />
										<span class="text-xs text-[#7c7c7c]">days</span>
									</div>
									{#if nSteps.length > 1}<button onclick={() => removeStep(i)} class="text-xs text-red-700 hover:text-red-400">Remove</button>{/if}
								</div>
							</div>
							{#if (step.channel ?? 'email') === 'email'}
								<input bind:value={step.subject} placeholder="Email subject" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
								<textarea bind:value={step.body} rows="4" placeholder="Email body... Use {'{'}name{'}'}, {'{'}company{'}'} as variables" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
							{:else if step.channel === 'sms'}
								{@const smsLen = (step.sms_body ?? '').length}
								<textarea bind:value={step.sms_body} rows="3" placeholder="SMS message..." class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
								<div class="flex items-center justify-between">
									<p class="text-[11px] text-[#6e6e6e]">Variables: {'{{name}}'}, {'{{company}}'}, {'{{phone}}'}, {'{{email}}'}, {'{{title}}'} · Sent 9:00–20:00 in your account timezone</p>
									<p class="text-[11px] {smsLen > SMS_SOFT_LIMIT ? 'text-amber-500' : 'text-[#6e6e6e]'}">{smsLen}/{SMS_SOFT_LIMIT}</p>
								</div>
							{:else}
								<p class="text-xs text-[#8a8a8a]">A high-priority call task will be created for the assigned SDR (or the account owner) when this step runs. No content needed.</p>
							{/if}
						</div>
					{/each}
					<button onclick={addStep} class="text-xs text-[#7c7c7c] hover:text-white">+ Add Step</button>
				</div>

				<div class="flex gap-3">
					<button onclick={createSequence} disabled={saving || !nName.trim()} class="rounded-lg bg-white px-5 py-2 text-xs font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5]">{saving ? 'Saving...' : 'Create Sequence'}</button>
					<button onclick={() => showNew = false} class="text-xs text-[#7c7c7c] hover:text-white px-3">Cancel</button>
				</div>
			</div>
		</div>
	{/if}

	<div class="flex flex-1 overflow-hidden">
		<div class="w-72 shrink-0 border-r border-[#1e1e1e] overflow-y-auto">
			{#each sequences as seq}
				<button onclick={() => selected = seq} class="w-full text-left px-4 py-3 border-b border-[#1e1e1e] hover:bg-white/5 transition-colors {selected?.id === seq.id ? 'bg-white/10' : ''}">
					<p class="text-sm text-white font-medium truncate">{seq.name}</p>
					<p class="text-xs text-[#7c7c7c] mt-0.5">{seq.steps?.length ?? 0} steps · {TRIGGER_LABELS[seq.trigger_type]}</p>
				</button>
			{:else}
				<p class="text-[#6e6e6e] text-xs text-center py-8">No sequences yet</p>
			{/each}
		</div>

		<div class="flex-1 overflow-y-auto p-8">
			{#if selected}
				<div class="max-w-2xl space-y-5">
					<div class="flex items-start justify-between">
						<div>
							<h3 class="text-white text-xl font-semibold">{selected.name}</h3>
							<p class="text-xs text-[#7c7c7c] mt-0.5">Trigger: {TRIGGER_LABELS[selected.trigger_type]} · {selected.steps?.length ?? 0} steps</p>
							{#if selected.description}<p class="text-sm text-[#888] mt-1">{selected.description}</p>{/if}
						</div>
						<button onclick={() => deleteSeq(selected!.id)} class="text-xs text-red-700 hover:text-red-400">Delete</button>
					</div>

					{#each (selected.steps ?? []).sort((a,b) => a.step_number - b.step_number) as step}
						{@const ch = step.channel === 'sms' || step.channel === 'call_task' ? step.channel : 'email'}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
							{#if editingStepId === step.id}
								<div class="space-y-3">
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-3">
											<p class="text-xs text-white font-medium">Step {step.step_number}</p>
											<div class="flex rounded-lg border border-[#2a2a2a] overflow-hidden">
												{#each Object.entries(CHANNEL_LABELS) as [v, l]}
													<button onclick={() => editForm.channel = v} class="px-2.5 py-1 text-[11px] transition-colors {(editForm.channel ?? 'email') === v ? 'bg-white text-black font-semibold' : 'bg-[#1a1a1a] text-[#7c7c7c] hover:text-white'}">{l}</button>
												{/each}
											</div>
										</div>
										<div class="flex items-center gap-2">
											<label class="text-xs text-[#7c7c7c]">Send after</label>
											<input type="number" bind:value={editForm.delay_days} min="0" class="w-16 rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white focus:outline-none" />
											<span class="text-xs text-[#7c7c7c]">days</span>
										</div>
									</div>
									{#if (editForm.channel ?? 'email') === 'email'}
										<input bind:value={editForm.subject} placeholder="Email subject" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
										<textarea bind:value={editForm.body} rows="4" placeholder="Email body... Use {'{'}name{'}'}, {'{'}company{'}'} as variables" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
									{:else if editForm.channel === 'sms'}
										{@const editSmsLen = (editForm.sms_body ?? '').length}
										<textarea bind:value={editForm.sms_body} rows="3" placeholder="SMS message..." class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
										<div class="flex items-center justify-between">
											<p class="text-[11px] text-[#6e6e6e]">Variables: {'{{name}}'}, {'{{company}}'}, {'{{phone}}'}, {'{{email}}'}, {'{{title}}'} · Sent 9:00–20:00 in your account timezone</p>
											<p class="text-[11px] {editSmsLen > SMS_SOFT_LIMIT ? 'text-amber-500' : 'text-[#6e6e6e]'}">{editSmsLen}/{SMS_SOFT_LIMIT}</p>
										</div>
									{:else}
										<p class="text-xs text-[#8a8a8a]">A high-priority call task will be created for the assigned SDR (or the account owner) when this step runs. No content needed.</p>
									{/if}
									<div class="flex gap-3">
										<button onclick={saveStep} disabled={stepSaving} class="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5]">{stepSaving ? 'Saving...' : 'Save Step'}</button>
										<button onclick={cancelEditStep} class="text-xs text-[#7c7c7c] hover:text-white px-2">Cancel</button>
									</div>
								</div>
							{:else}
								<div class="flex items-center justify-between mb-3">
									<div class="flex items-center gap-2">
										<p class="text-xs text-white font-medium">Step {step.step_number}</p>
										<span class="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider {CHANNEL_COLORS[ch]}">{CHANNEL_ICONS[ch]} {CHANNEL_LABELS[ch]}</span>
									</div>
									<div class="flex items-center gap-3">
										<p class="text-xs text-[#6e6e6e]">{step.delay_days === 0 ? 'Immediately' : `After ${step.delay_days} days`}</p>
										<button onclick={() => startEditStep(step)} title="Edit step" aria-label="Edit step" class="text-xs text-[#7c7c7c] hover:text-white">✎ Edit</button>
										<button onclick={() => deleteStep(step)} title="Delete step" aria-label="Delete step" class="text-xs text-red-700 hover:text-red-400">Delete</button>
									</div>
								</div>
								{#if ch === 'sms'}
									<p class="text-xs text-[#8a8a8a] whitespace-pre-wrap">{step.sms_body}</p>
								{:else if ch === 'call_task'}
									<p class="text-xs text-[#8a8a8a]">Creates a high-priority call task for the assigned SDR.</p>
								{:else}
									<p class="text-sm text-white mb-1">{step.subject}</p>
									<p class="text-xs text-[#8a8a8a] whitespace-pre-wrap">{step.body}</p>
								{/if}
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<div class="flex items-center justify-center h-full">
					<p class="text-[#6e6e6e] text-sm">Select a sequence to view its steps</p>
				</div>
			{/if}
		</div>
	</div>
{/if}
</div>
