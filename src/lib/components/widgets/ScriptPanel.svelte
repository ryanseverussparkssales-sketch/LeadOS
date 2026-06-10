<script lang="ts">
	import { apiFetch } from '$lib/api';
	import { onMount } from 'svelte';

	let { campaignId = '', callId = '', onScriptSelected = (_id: string) => {} }: {
		campaignId?: string;
		callId?: string;
		onScriptSelected?: (scriptId: string) => void;
	} = $props();

	interface Objection { id:string; objection:string; response:string; follow_up:string|null; }
	interface Script { id:string; title:string; opener:string|null; elevator_pitch:string|null; discovery:string|null; closing:string|null; is_default:boolean; objections:Objection[]; }

	let scripts = $state<Script[]>([]);
	let active = $state<Script | null>(null);
	let expandedObj = $state<string | null>(null);
	let activeSection = $state<string>('opener');
	let loggedObjections = $state<Set<string>>(new Set()); // per call, avoid duplicates

	onMount(async () => {
		const params = new URLSearchParams();
		if (campaignId) params.set('campaign_id', campaignId);
		const res = await apiFetch(`/api/scripts?${params}`);
		if (res.ok) {
			scripts = await res.json();
			const def = scripts.find(s => s.is_default) ?? scripts[0] ?? null;
			if (def) { active = def; onScriptSelected(def.id); }
		}
	});

	function selectScript(id: string) {
		active = scripts.find(s => s.id === id) ?? null;
		if (active) { onScriptSelected(active.id); activeSection = 'opener'; expandedObj = null; }
	}

	async function clickObjection(obj: Objection) {
		expandedObj = expandedObj === obj.id ? null : obj.id;
		// Log this objection encounter (once per call)
		if (callId && active && !loggedObjections.has(obj.id)) {
			loggedObjections = new Set([...loggedObjections, obj.id]);
			apiFetch('/api/scripts/log-objection', {
				method: 'POST',
				body: JSON.stringify({ callId, scriptId: active.id, objectionId: obj.id }),
			}).catch(() => {});
		}
	}

	const sections = $derived(active ? [
		{ key: 'opener',    label: 'Opener',    content: active.opener },
		{ key: 'pitch',     label: 'Pitch',     content: active.elevator_pitch },
		{ key: 'discovery', label: 'Discovery', content: active.discovery },
		{ key: 'closing',   label: 'Close',     content: active.closing },
	].filter(s => s.content) : []);
</script>

<div class="h-full flex flex-col">
	{#if !active}
		<div class="flex-1 flex items-center justify-center">
			<p class="text-xs text-[#6e6e6e] text-center">No script<br/><a href="/scripts" class="underline hover:text-white">Create one</a></p>
		</div>
	{:else}
		{#if scripts.length > 1}
			<select value={active.id} onchange={(e) => selectScript((e.target as HTMLSelectElement).value)}
				class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:border-white focus:outline-none mb-3">
				{#each scripts as s}<option value={s.id}>{s.title}</option>{/each}
			</select>
		{/if}

		<!-- Section tabs -->
		<div class="flex gap-1 mb-3 flex-wrap">
			{#each sections as sec}
				<button onclick={() => activeSection = sec.key}
					class="rounded px-2 py-1 text-xs transition-colors {activeSection === sec.key ? 'bg-white/10 text-white' : 'text-[#7c7c7c] hover:text-white'}">
					{sec.label}
				</button>
			{/each}
		</div>

		<!-- Script content -->
		<div class="rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] p-3 text-xs text-[#ccc] leading-relaxed whitespace-pre-wrap mb-3 flex-1 overflow-y-auto min-h-0">
			{sections.find(s => s.key === activeSection)?.content ?? '—'}
		</div>

		<!-- Objection handlers -->
		{#if active.objections?.length}
			<div class="shrink-0">
				<p class="text-xs text-[#7c7c7c] uppercase tracking-widest mb-2">Objections</p>
				<div class="space-y-1.5 overflow-y-auto max-h-44">
					{#each active.objections as obj}
						<button onclick={() => clickObjection(obj)}
							class="w-full text-left rounded-lg border p-2.5 hover:border-yellow-800 transition-colors {loggedObjections.has(obj.id) ? 'border-yellow-900/50 bg-yellow-950/10' : 'border-[#2a2a2a]'}">
							<div class="flex items-center justify-between">
								<p class="text-xs text-yellow-400 truncate flex-1">"{obj.objection}"</p>
								{#if loggedObjections.has(obj.id)}<span class="text-xs text-yellow-700 shrink-0 ml-1">✓ logged</span>{/if}
							</div>
							{#if expandedObj === obj.id}
								<p class="text-xs text-[#ccc] mt-1.5 leading-relaxed">{obj.response}</p>
								{#if obj.follow_up}<p class="text-xs text-[#7c7c7c] mt-1">↳ {obj.follow_up}</p>{/if}
							{/if}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
