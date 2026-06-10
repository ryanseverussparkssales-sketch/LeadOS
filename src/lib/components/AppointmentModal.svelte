<script lang="ts">
	import { apiFetch } from '$lib/api';
	import Icon from '$lib/components/Icon.svelte';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	let {
		contact,
		callId = null,
		campaignId = null,
		onClose,
		onSaved,
	}: {
		contact: { id: string; name: string; phone: string; company?: string };
		callId?: string | null;
		campaignId?: string | null;
		onClose: () => void;
		onSaved?: (appt: any) => void;
	} = $props();

	interface Question { key: string; label: string; type: string; options?: string[]; required?: boolean; }

	// Appointment details
	let scheduledDate = $state('');
	let scheduledTime = $state('');
	let durationMinutes = $state(30);
	let format = $state<'phone'|'video'|'in_person'>('phone');
	let location = $state('');
	let meetingLink = $state('');
	let notes = $state('');

	// Qualifying answers
	let answers = $state<Record<string, string>>({});

	// Template
	let questions = $state<Question[]>([]);
	let templateName = $state('General Appointment');
	let loading = $state(true);
	let saving = $state(false);
	let activeTab = $state<'details'|'qualify'>('details');

	// Default question packs for quick-load
	const PACKS: Record<string, { name: string; questions: Question[] }> = {
		window_sales:  { name: 'Window Sales', questions: [
			{ key: 'homeowner', label: 'Homeowner?', type: 'yesno', required: true },
			{ key: 'address', label: 'Property address', type: 'text', required: true },
			{ key: 'window_count', label: 'Windows needing work?', type: 'select', options: ['1-2','3-5','6-10','10+'] },
			{ key: 'issue', label: "Issue", type: 'select', options: ['Broken/cracked','Drafty','Upgrade','New construction'] },
			{ key: 'budget', label: 'Budget', type: 'select', options: ['Under $2k','$2k-$5k','$5k-$15k','$15k+','Not sure'] },
			{ key: 'urgency', label: 'Timeline', type: 'select', options: ['ASAP','30 days','1-3 months','Exploring'] },
		]},
		roofing: { name: 'Roof Damage Check', questions: [
			{ key: 'homeowner', label: 'Homeowner?', type: 'yesno', required: true },
			{ key: 'address', label: 'Property address', type: 'text', required: true },
			{ key: 'damage_type', label: 'Damage type', type: 'select', options: ['Storm/hail','Wind','Leak','Age','Other'] },
			{ key: 'insurance', label: 'Has insurance?', type: 'yesno' },
			{ key: 'carrier', label: 'Insurance carrier', type: 'text' },
			{ key: 'urgency', label: 'Urgency', type: 'select', options: ['Active leak','ASAP assessment','Planning ahead'] },
		]},
		electrician: { name: 'Electrician Appointment', questions: [
			{ key: 'homeowner', label: 'Homeowner or property manager?', type: 'yesno', required: true },
			{ key: 'address', label: 'Property address', type: 'text', required: true },
			{ key: 'job_type', label: 'Work needed', type: 'select', options: ['Light switches/outlets','Panel upgrade','Smart home install','New wiring','Repair','Other'] },
			{ key: 'smart_home', label: 'Interested in smart home?', type: 'yesno' },
			{ key: 'urgency', label: 'How soon?', type: 'select', options: ['Emergency','Within a week','Within a month','Flexible'] },
		]},
		smart_home: { name: 'Smart Home Consultation', questions: [
			{ key: 'homeowner', label: 'Homeowner?', type: 'yesno', required: true },
			{ key: 'address', label: 'Property address', type: 'text', required: true },
			{ key: 'products', label: 'Products interested in', type: 'text' },
			{ key: 'current', label: 'Current setup?', type: 'select', options: ['None','Basic (Alexa/Google)','Some devices','Full system'] },
			{ key: 'budget', label: 'Budget', type: 'select', options: ['Under $500','$500-$2k','$2k-$5k','$5k+'] },
		]},
		general: { name: 'General Appointment', questions: [
			{ key: 'decision_maker', label: 'Decision maker?', type: 'yesno', required: true },
			{ key: 'pain_point', label: 'Main problem to solve?', type: 'textarea' },
			{ key: 'budget', label: 'Budget range', type: 'text' },
			{ key: 'timeline', label: 'Timeline', type: 'select', options: ['ASAP','30 days','1-3 months','Exploring'] },
			{ key: 'stakeholders', label: 'Other decision makers?', type: 'text' },
		]},
	};

	let selectedPack = $state('general');

	async function loadTemplate() {
		if (campaignId) {
			const r = await apiFetch(`/api/appointment-templates?campaign_id=${campaignId}`);
			if (r.ok) {
				const d = await r.json();
				if (d.campaignTemplate) {
					questions = d.campaignTemplate.questions;
					templateName = d.campaignTemplate.name;
					durationMinutes = d.campaignTemplate.duration_minutes ?? 30;
					format = d.campaignTemplate.default_format ?? 'phone';
					loading = false;
					return;
				}
			}
		}
		// Fall back to general pack
		loadPack('general');
		loading = false;
	}

	function loadPack(pack: string) {
		const p = PACKS[pack];
		if (!p) return;
		selectedPack = pack;
		questions = p.questions;
		templateName = p.name;
		answers = {};
	}

	import { onMount } from 'svelte';
	onMount(loadTemplate);

	// Set tomorrow as default date
	const tomorrow = new Date();
	tomorrow.setDate(tomorrow.getDate() + 1);
	scheduledDate = tomorrow.toISOString().split('T')[0];
	scheduledTime = '10:00';

	async function save() {
		saving = true;
		const scheduledAt = scheduledDate && scheduledTime
			? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
			: null;

		const res = await apiFetch('/api/appointments', {
			method: 'POST',
			body: JSON.stringify({
				callId, contactId: contact.id, campaignId,
				scheduledAt, durationMinutes, format,
				location: location || undefined,
				meetingLink: meetingLink || undefined,
				notes: notes || undefined,
				qualifyingAnswers: answers,
			}),
		});

		if (res.ok) {
			const appt = await res.json();
			toastSuccess(`Appointment booked for ${contact.name}`);
			onSaved?.(appt);
			onClose();
		} else {
			toastError('Failed to save appointment');
		}
		saving = false;
	}

	const incompleteRequired = $derived(
		questions.filter(q => q.required && !answers[q.key]?.trim())
	);
</script>

<!-- Modal overlay -->
<div class="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4" role="dialog" onclick={(e) => { if ((e.target as Element).classList.contains("z-[100]")) onClose(); }}>
	<div class="rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d] w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">

		<!-- Header -->
		<div class="flex items-center justify-between px-6 py-4 border-b border-[#1a1a1a] shrink-0">
			<div>
				<h2 class="text-white font-semibold">Book Appointment</h2>
				<p class="text-xs text-[#7c7c7c] mt-0.5">{contact.name}{contact.company ? ` · ${contact.company}` : ''}</p>
			</div>
			<button onclick={onClose} class="text-[#6e6e6e] hover:text-white transition-colors text-lg"><Icon name="x" size={14} /></button>
		</div>

		<!-- Quick-load template packs -->
		{#if !campaignId}
			<div class="px-6 py-3 border-b border-[#1a1a1a] shrink-0">
				<p class="text-[10px] text-[#6e6e6e] uppercase tracking-widest mb-2">Question template</p>
				<div class="flex gap-1.5 flex-wrap">
					{#each Object.entries(PACKS) as [key, pack]}
						<button onclick={() => loadPack(key)}
							class="px-2.5 py-1 rounded-lg text-[10px] transition-colors {selectedPack === key ? 'bg-white/15 text-white border border-white/20' : 'border border-[#2a2a2a] text-[#7c7c7c] hover:text-white hover:border-[#444]'}">
							{pack.name}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Tabs -->
		<div class="flex border-b border-[#1a1a1a] shrink-0">
			{#each [['details','Details'],['qualify','Qualify']] as [tab, label]}
				<button onclick={() => activeTab = tab as any}
					class="flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 {activeTab === tab ? 'border-white text-white' : 'border-transparent text-[#7c7c7c] hover:text-white'}">
					{label}
					{#if tab === 'qualify' && incompleteRequired.length > 0}
						<span class="ml-1 text-red-400">({incompleteRequired.length} required)</span>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">

			{#if activeTab === 'details'}
				<!-- Date + Time -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs text-[#7c7c7c] mb-1">Date</label>
						<input type="date" bind:value={scheduledDate} autofocus
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
					</div>
					<div>
						<label class="block text-xs text-[#7c7c7c] mb-1">Time</label>
						<input type="time" bind:value={scheduledTime}
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" />
					</div>
				</div>

				<!-- Format + Duration -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs text-[#7c7c7c] mb-1">Format</label>
						<select bind:value={format} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:outline-none">
							<option value="phone">📞 Phone</option>
							<option value="video">🎥 Video call</option>
							<option value="in_person">🏠 In person</option>
						</select>
					</div>
					<div>
						<label class="block text-xs text-[#7c7c7c] mb-1">Duration</label>
						<select bind:value={durationMinutes} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:outline-none">
							{#each [15,30,45,60,90,120] as d}
								<option value={d}>{d} min</option>
							{/each}
						</select>
					</div>
				</div>

				<!-- Location / Meeting link -->
				{#if format === 'in_person'}
					<div>
						<label class="block text-xs text-[#7c7c7c] mb-1">Location</label>
						<input bind:value={location} placeholder="Address or location"
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none" />
					</div>
				{:else if format === 'video'}
					<div>
						<label class="block text-xs text-[#7c7c7c] mb-1">Meeting link</label>
						<input bind:value={meetingLink} placeholder="https://zoom.us/j/..."
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none" />
					</div>
				{/if}

				<div>
					<label class="block text-xs text-[#7c7c7c] mb-1">Notes</label>
					<textarea bind:value={notes} rows="2" placeholder="Anything else to note..."
						class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none resize-none"></textarea>
				</div>

			{:else}
				<!-- Qualifying questions -->
				{#if loading}
					<div class="space-y-3">{#each [1,2,3] as _}<div class="h-12 bg-[#111] rounded-lg animate-pulse"></div>{/each}</div>
				{:else}
					{#each questions as q}
						<div>
							<label class="block text-xs text-[#7c7c7c] mb-1">
								{q.label}{#if q.required}<span class="text-red-400 ml-0.5">*</span>{/if}
							</label>
							{#if q.type === 'yesno'}
								<div class="flex gap-2">
									{#each [['yes','Yes ✓'],['no','No ✗'],['unknown','Not sure']] as [v,l]}
										<button onclick={() => answers = { ...answers, [q.key]: v }}
											class="flex-1 py-2 rounded-lg text-xs border transition-colors {answers[q.key] === v ? 'bg-white/15 border-white text-white' : 'border-[#2a2a2a] text-[#7c7c7c] hover:text-white hover:border-[#444]'}">
											{l}
										</button>
									{/each}
								</div>
							{:else if q.type === 'select' && q.options}
								<select value={answers[q.key] ?? ''} onchange={(e) => answers = { ...answers, [q.key]: (e.target as HTMLSelectElement).value }}
									class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:outline-none">
									<option value="">Select…</option>
									{#each q.options as opt}<option value={opt}>{opt}</option>{/each}
								</select>
							{:else if q.type === 'textarea'}
								<textarea value={answers[q.key] ?? ''} oninput={(e) => answers = { ...answers, [q.key]: (e.target as HTMLTextAreaElement).value }}
									rows="2" placeholder="Type answer..."
									class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none resize-none"></textarea>
							{:else}
								<input type="text" value={answers[q.key] ?? ''} oninput={(e) => answers = { ...answers, [q.key]: (e.target as HTMLInputElement).value }}
									placeholder="Type answer..."
									class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#333] focus:border-white focus:outline-none" />
							{/if}
						</div>
					{/each}
				{/if}
			{/if}
		</div>

		<!-- Footer -->
		<div class="px-6 py-4 border-t border-[#1a1a1a] flex gap-3 shrink-0">
			<button onclick={onClose} class="flex-1 rounded-lg border border-[#2a2a2a] py-2.5 text-xs text-[#8a8a8a] hover:border-white hover:text-white hover:bg-white/5 transition-colors">
				Cancel
			</button>
			<button onclick={save} disabled={saving || !scheduledDate}
				class="flex-1 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hi)] py-2.5 text-xs font-semibold text-[var(--accent-ink)] disabled:opacity-40 transition-colors">
				{saving ? 'Booking…' : '📅 Book Appointment'}
			</button>
		</div>

	</div>
</div>
