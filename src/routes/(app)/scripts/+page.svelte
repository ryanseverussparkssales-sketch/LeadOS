<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	interface Objection { id:string; objection:string; response:string; follow_up:string|null; sort_order:number; }
	interface Script { id:string; title:string; opener:string|null; elevator_pitch:string|null; discovery:string|null; closing:string|null; is_default:boolean; client:{id:string;name:string}|null; campaign:{id:string;name:string}|null; objections:Objection[]; }

	let scripts = $state<Script[]>([]);
	let selected = $state<Script | null>(null);
	let editing = $state(false);
	let saving = $state(false);
	let clients = $state<{id:string;name:string}[]>([]);
	let campaigns = $state<{id:string;name:string}[]>([]);

	// Form fields
	let fTitle = $state(''); let fOpener = $state(''); let fPitch = $state('');
	let fDiscovery = $state(''); let fClosing = $state(''); let fClient = $state('');
	let fCampaign = $state(''); let fDefault = $state(false);

	// Performance analytics
	type ScriptView = 'script' | 'performance';
	let scriptView = $state<ScriptView>('script');
	interface Analytics {
		callCount: number;
		successRate: number;
		answerRate: number;
		callbackRate: number;
		avgDurationSeconds: number;
		outcomes: Record<string,number>;
		callTypes: Record<string,number>;
		topObjections: {text:string;count:number}[];
		weeklyTrend: {week:string;total:number;success:number;rate:string}[];
	}
	let analytics = $state<Analytics|null>(null);
	let loadingAnalytics = $state(false);

	async function loadAnalytics(scriptId: string) {
		loadingAnalytics = true;
		analytics = null;
		const res = await apiFetch(`/api/scripts/${scriptId}/analytics`);
		if (res.ok) analytics = await res.json();
		loadingAnalytics = false;
	}

	// New objection form
	let newObjection = $state(''); let newResponse = $state(''); let newFollowUp = $state('');
	let addingObj = $state(false);

	// Grouping: filter state for left panel
	let filterClientId = $state('');
	let filterCampaignId = $state('');

	const filteredScripts = $derived(scripts.filter(s => {
		if (filterClientId && s.client?.id !== filterClientId && s.client?.id != null) return false;
		if (filterCampaignId && s.campaign?.id !== filterCampaignId) return false;
		return true;
	}));

	// Scripts grouped by client then by global
	const scriptsByClient = $derived(() => {
		const groups: { label: string; clientId: string | null; scripts: Script[] }[] = [];
		const clientMap = new Map<string | null, Script[]>();
		for (const s of scripts) {
			const key = s.client?.id ?? null;
			if (!clientMap.has(key)) clientMap.set(key, []);
			clientMap.get(key)!.push(s);
		}
		// Global first, then by client name
		if (clientMap.has(null)) groups.push({ label: 'Global', clientId: null, scripts: clientMap.get(null)! });
		for (const [clientId, ss] of clientMap) {
			if (clientId !== null) {
				const label = ss[0]?.client?.name ?? 'Unknown Client';
				groups.push({ label, clientId, scripts: ss });
			}
		}
		return groups;
	});

	onMount(async () => {
		try {
			const [sr, cr, camr] = await Promise.all([
				apiFetch('/api/scripts'),
				apiFetch('/api/clients'),
				apiFetch('/api/campaigns'),
			]);
			scripts   = sr.ok   ? await sr.json()   : [];
			clients   = cr.ok   ? (await cr.json()).map((c: {id:string;name:string}) => ({ id: c.id, name: c.name })) : [];
			campaigns = camr.ok ? (await camr.json()).map((c: {id:string;name:string}) => ({ id: c.id, name: c.name })) : [];
			if (scripts.length) selectScript(scripts[0]);
		} catch (err) {
			console.error('[scripts onMount]', err);
		}
	});

	function selectScript(s: Script) {
		selected = s; editing = false;
		fTitle = s.title; fOpener = s.opener ?? ''; fPitch = s.elevator_pitch ?? '';
		fDiscovery = s.discovery ?? ''; fClosing = s.closing ?? '';
		fClient = ''; fCampaign = ''; fDefault = s.is_default;
	}

	// AI Script Generator
	let showAIGenerator = $state(false);
	let generating = $state(false);
	let streamComplete = $state(false);
	let generatedScript = $state('');
	let genProduct = $state(''); let genPersona = $state(''); let genBenefits = $state('');
	let genObjections = $state(''); let genTone = $state('professional'); let genContext = $state('');

	async function generateScript() {
		if (!genProduct.trim() || !genPersona.trim()) return;
		generating = true;
		streamComplete = false;
		generatedScript = '';
		try {
			const res = await apiFetch('/api/scripts/generate', { method:'POST', body: JSON.stringify({ product:genProduct, persona:genPersona, keyBenefits:genBenefits, commonObjections:genObjections, tone:genTone, additionalContext:genContext }) });
			if (!res.ok || !res.body) { generating = false; return; }

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				// Don't expose partial JSON — just track internally until stream ends
			}

			streamComplete = true;

			// Parse completed JSON from streamed text
			let script: Record<string, unknown> | null = null;
			try {
				const match = buffer.match(/\{[\s\S]*\}/);
				script = match ? JSON.parse(match[0]) : null;
			} catch {
				// Bad JSON — show a user-visible error rather than silently failing
				generatedScript = '⚠ Failed to parse generated script. Please try again.';
				generating = false;
				return;
			}

			if (script) {
				fTitle = (script.title as string) ?? '';
				fOpener = (script.opener as string) ?? '';
				fPitch = (script.elevatorPitch as string) ?? '';
				fDiscovery = (script.discovery as string) ?? '';
				fClosing = (script.closing as string) ?? '';
				// Save with objections
				const saveRes = await apiFetch('/api/scripts', { method:'POST', body: JSON.stringify({ title:fTitle, opener:fOpener, elevatorPitch:fPitch, discovery:fDiscovery, closing:fClosing, objections:(script.objections as Record<string,string>[])?.map((o) => ({ objection:o.objection, response:o.response, follow_up:o.followUp })) }) });
				if (saveRes.ok) {
					const saved = await saveRes.json();
					scripts = [{ ...saved, objections:(script.objections as Record<string,string>[])?.map((o, i) => ({ id:`gen-${i}`, ...o, follow_up:o.followUp })) ?? [] }, ...scripts];
					selectScript(scripts[0]);
					showAIGenerator = false;
					genProduct = ''; genPersona = ''; generatedScript = ''; streamComplete = false;
				}
			} else {
				generatedScript = '⚠ AI response did not contain a valid script. Please try again.';
			}
		} catch (e) {
			console.error(e);
			generatedScript = '⚠ Generation failed. Check your connection and try again.';
			streamComplete = true;
		}
		generating = false;
	}

	// Script improvement AI
	let showImprovement = $state(false);
	let loadingImprovement = $state(false);
	let improvement = $state<{overallScore:number;diagnosis:string;improvements:{section:string;issue:string;suggestion:string;whyItWorks:string}[];quickWins:string[];strengthsToKeep:string[];} | null>(null);
	let improvementStats = $state<{totalCalls:number;successCount:number;avgQuality:number} | null>(null);

	async function getImprovements() {
		if (!selected) return;
		loadingImprovement = true;
		improvement = null;
		const res = await apiFetch(`/api/scripts/${selected.id}/improve`, { method:'POST' });
		if (res.ok) { const d = await res.json(); improvement = d.analysis; improvementStats = d.stats; }
		loadingImprovement = false;
		showImprovement = true;
		scriptView = 'performance';
	}

	function newScript() {
		selected = null; editing = true;
		fTitle = 'New Script'; fOpener = ''; fPitch = ''; fDiscovery = ''; fClosing = '';
		fClient = ''; fCampaign = ''; fDefault = false;
	}

	async function saveScript() {
		saving = true;
		const payload = { title: fTitle, opener: fOpener || null, elevatorPitch: fPitch || null, discovery: fDiscovery || null, closing: fClosing || null, clientId: fClient || null, campaignId: fCampaign || null, isDefault: fDefault };
		let res;
		if (selected?.id) {
			res = await apiFetch(`/api/scripts/${selected.id}`, { method: 'PUT', body: JSON.stringify(payload) });
		} else {
			res = await apiFetch('/api/scripts', { method: 'POST', body: JSON.stringify(payload) });
		}
		if (res.ok) {
			const saved = await res.json();
			if (selected?.id) {
				scripts = scripts.map(s => s.id === saved.id ? { ...saved, objections: selected!.objections } : s);
			} else {
				scripts = [{ ...saved, objections: [] }, ...scripts];
			}
			selected = { ...saved, objections: selected?.objections ?? [] };
			editing = false;
		}
		saving = false;
	}

	async function deleteScript() {
		if (!selected || !confirm('Delete this script?')) return;
		await apiFetch(`/api/scripts/${selected.id}`, { method: 'DELETE' });
		scripts = scripts.filter(s => s.id !== selected!.id);
		selected = scripts[0] ?? null;
	}

	async function addObjection() {
		if (!selected || !newObjection || !newResponse) return;
		addingObj = true;
		const res = await apiFetch(`/api/scripts/${selected.id}/objections`, {
			method: 'POST',
			body: JSON.stringify({ objection: newObjection, response: newResponse, followUp: newFollowUp || null }),
		});
		if (res.ok) {
			const obj = await res.json();
			selected = { ...selected, objections: [...(selected.objections ?? []), obj] };
			scripts = scripts.map(s => s.id === selected!.id ? selected! : s);
			newObjection = ''; newResponse = ''; newFollowUp = '';
		}
		addingObj = false;
	}

	async function deleteObjection(oid: string) {
		if (!selected) return;
		await apiFetch(`/api/scripts/${selected.id}/objections/${oid}`, { method: 'DELETE' });
		selected = { ...selected, objections: selected.objections.filter(o => o.id !== oid) };
		scripts = scripts.map(s => s.id === selected!.id ? selected! : s);
	}
</script>

<svelte:head><title>Scripts — LeadOS</title></svelte:head>

<div class="flex flex-col flex-1 h-full">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between">
		<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Call Scripts</h2>
		<div class="flex gap-2">
			<button onclick={() => showAIGenerator = true}
				class="rounded-lg border border-purple-800 px-4 py-1.5 text-xs text-purple-400 hover:bg-purple-900/20 transition-colors">
				✦ Generate with AI
			</button>
			<button onclick={newScript} class="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">
				+ New Script
			</button>
		</div>
	</div>

	<!-- AI Script Generator Modal -->
	{#if showAIGenerator}
		<div class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onclick={() => showAIGenerator = false} role="dialog">
			<div class="rounded-xl border border-purple-800/40 bg-[#0d0d0d] p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onclick={(e) => e.stopPropagation()}>
				<div class="flex items-center justify-between mb-5">
					<div>
						<h3 class="text-white font-semibold">✦ Generate Script with AI</h3>
						<p class="text-xs text-[#555] mt-0.5">Claude writes a complete cold call playbook with objection handlers</p>
					</div>
					<button onclick={() => showAIGenerator = false} class="text-[#555] hover:text-white text-sm">✕</button>
				</div>

				<div class="space-y-4">
					<div>
						<label class="text-xs text-[#999] block mb-1.5">Product / Service *</label>
						<input bind:value={genProduct} placeholder="e.g. iotty smart switches, The Beard Club subscription..."
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
					</div>

					<div>
						<label class="text-xs text-[#999] block mb-1.5">Target Persona *</label>
						<input bind:value={genPersona} placeholder="e.g. residential electricians, men 25-45 who care about grooming..."
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
					</div>

					<div>
						<label class="text-xs text-[#999] block mb-1.5">Key Benefits</label>
						<input bind:value={genBenefits} placeholder="e.g. 10-min install, works with Alexa, Italian design..."
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
					</div>

					<div>
						<label class="text-xs text-[#999] block mb-1.5">Common Objections to Handle</label>
						<input bind:value={genObjections} placeholder="e.g. too expensive, already have smart switches, not interested..."
							class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="text-xs text-[#999] block mb-1.5">Tone</label>
							<select bind:value={genTone} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:outline-none">
								<option value="professional">Professional</option>
								<option value="conversational">Conversational</option>
								<option value="consultative">Consultative</option>
								<option value="direct">Direct & Bold</option>
								<option value="warm">Warm & Friendly</option>
							</select>
						</div>
						<div>
							<label class="text-xs text-[#999] block mb-1.5">Additional Context</label>
							<input bind:value={genContext} placeholder="Any extra context..."
								class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
						</div>
					</div>

					<div class="pt-2 flex gap-3">
						<button onclick={() => showAIGenerator = false} class="rounded-lg border border-[#2a2a2a] px-4 py-2.5 text-sm text-[#666] hover:text-white transition-colors">
							Cancel
						</button>
						<button onclick={generateScript} disabled={generating || !genProduct.trim() || !genPersona.trim()}
							class="flex-1 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-40 transition-colors">
							{generating ? '✦ Writing your script...' : '✦ Generate Full Script'}
						</button>
					</div>

					{#if generating || (streamComplete && generatedScript)}
						<div class="rounded-lg bg-purple-950/20 border border-purple-800/20 p-3">
							{#if streamComplete && generatedScript}
								<!-- Error message from failed parse — show it clearly -->
								<p class="text-xs text-red-400 text-center">{generatedScript}</p>
							{:else}
								<!-- While streaming: show animated indicator, not raw partial JSON -->
								<div class="flex items-center justify-center gap-2">
									<span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
									<p class="text-xs text-purple-400">Generating script...</p>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<div class="flex flex-1 overflow-hidden">
		<!-- Script list — grouped by client -->
		<div class="w-64 shrink-0 border-r border-[#1e1e1e] overflow-y-auto">
			{#if scripts.length === 0}
				<p class="text-[#444] text-xs text-center py-8">No scripts yet.<br/>Create one above.</p>
			{:else}
				{#each scriptsByClient() as group}
					<!-- Client group header -->
					<div class="px-4 py-2 bg-[#0d0d0d] border-b border-[#1e1e1e] sticky top-0 z-10">
						<p class="text-[10px] text-[#555] uppercase tracking-widest font-semibold">{group.label}</p>
					</div>
					{#each group.scripts as script}
						<button onclick={() => selectScript(script)}
							class="w-full text-left px-4 py-2.5 border-b border-[#111] transition-colors {selected?.id === script.id ? 'bg-white/10 border-l-2 border-l-white' : 'hover:bg-white/5'}">
							<div class="flex items-center gap-2">
								<p class="text-sm text-white font-medium truncate">{script.title}</p>
								{#if script.is_default}<span class="text-[10px] bg-white/10 text-white px-1 py-0.5 rounded shrink-0">Default</span>{/if}
							</div>
							{#if script.campaign?.name}
								<p class="text-[10px] text-[#444] mt-0.5 truncate">📣 {script.campaign.name}</p>
							{/if}
							<p class="text-[10px] text-[#333] mt-0.5">{script.objections?.length ?? 0} objection handlers</p>
						</button>
					{/each}
				{/each}
			{/if}
		</div>

		<!-- Script detail / editor -->
		<div class="flex-1 overflow-y-auto p-8">
			{#if editing}
				<!-- Edit form -->
				<div class="max-w-2xl space-y-5">
					<div class="flex items-center gap-3">
						<input bind:value={fTitle} placeholder="Script title"
							class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2 text-lg text-white placeholder-[#444] focus:border-white focus:outline-none font-medium" />
						<label class="flex items-center gap-2 shrink-0 cursor-pointer">
							<input type="checkbox" bind:checked={fDefault} />
							<span class="text-xs text-[#999]">Default</span>
						</label>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="text-xs text-[#555] block mb-1.5">Client (optional)</label>
							<select bind:value={fClient} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
								<option value="">Global (all clients)</option>
								{#each clients as c}<option value={c.id}>{c.name}</option>{/each}
							</select>
						</div>
						<div>
							<label class="text-xs text-[#555] block mb-1.5">Campaign (optional)</label>
							<select bind:value={fCampaign} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
								<option value="">All campaigns</option>
								{#each campaigns as c}<option value={c.id}>{c.name}</option>{/each}
							</select>
						</div>
					</div>

					{#each [['fOpener', 'Opener', 'Hi [Name], this is [Your Name] calling from...'], ['fPitch', 'Elevator Pitch', 'We help sales teams...'], ['fDiscovery', 'Discovery Questions', 'Can I ask...?'], ['fClosing', 'Close / Next Steps', 'The best next step would be...']] as [field, label, placeholder]}
						<div>
							<label class="text-xs text-[#555] block mb-1.5">{label}</label>
							<textarea
								value={field === 'fOpener' ? fOpener : field === 'fPitch' ? fPitch : field === 'fDiscovery' ? fDiscovery : fClosing}
								oninput={(e) => {
									const v = (e.target as HTMLTextAreaElement).value;
									if (field === 'fOpener') fOpener = v;
									else if (field === 'fPitch') fPitch = v;
									else if (field === 'fDiscovery') fDiscovery = v;
									else fClosing = v;
								}}
								rows="3"
								{placeholder}
								class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
						</div>
					{/each}

					<div class="flex gap-3">
						<button onclick={saveScript} disabled={saving || !fTitle.trim()}
							class="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40 transition-colors">
							{saving ? 'Saving...' : 'Save Script'}
						</button>
						<button onclick={() => { editing = false; if (selected) selectScript(selected); }}
							class="rounded-lg border border-[#2a2a2a] px-6 py-2.5 text-sm text-[#666] hover:text-white transition-colors">
							Cancel
						</button>
					</div>
				</div>

			{:else if selected}
				<div class="max-w-2xl space-y-6">
					<div class="flex items-start justify-between">
						<div>
							<h3 class="text-white text-xl font-semibold">{selected.title}</h3>
							<p class="text-xs text-[#555] mt-0.5">
								{selected.client?.name ?? selected.campaign?.name ?? 'Global script'}
								{selected.is_default ? ' · Default' : ''}
							</p>
						</div>
						<div class="flex gap-2">
							<button onclick={getImprovements} disabled={loadingImprovement}
								class="rounded-lg border border-purple-800/40 px-3 py-1.5 text-xs text-purple-400 hover:bg-purple-900/20 transition-colors disabled:opacity-40">
								{loadingImprovement ? '✦ Analyzing...' : '✦ AI Improve'}
							</button>
							<button onclick={() => { editing = true; }}
								class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#999] hover:border-white hover:text-white transition-colors">
								Edit
							</button>
							<button onclick={deleteScript} class="text-xs text-red-700 hover:text-red-400 px-2 transition-colors">Delete</button>
						</div>
					</div>

					{#if showImprovement && improvement}
						<div class="rounded-xl border border-purple-800/30 bg-purple-950/10 p-5 space-y-4">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-3">
									<span class="text-2xl font-bold {improvement.overallScore >= 80 ? 'text-green-400' : improvement.overallScore >= 60 ? 'text-yellow-400' : 'text-red-400'}">{improvement.overallScore}/100</span>
									<p class="text-sm text-white font-medium">Script Analysis</p>
								</div>
								<button onclick={() => showImprovement = false} class="text-[#444] hover:text-white text-xs">✕</button>
							</div>
							<p class="text-sm text-[#ccc] leading-relaxed">{improvement.diagnosis}</p>
							{#if improvement.quickWins?.length}
								<div class="rounded-lg bg-green-950/20 border border-green-800/20 p-3">
									<p class="text-xs text-green-400 font-medium mb-2">⚡ Quick Wins</p>
									{#each improvement.quickWins as win}
										<p class="text-xs text-[#ccc] mb-1">• {win}</p>
									{/each}
								</div>
							{/if}
							{#if improvement.improvements?.length}
								<div class="space-y-3">
									<p class="text-xs text-[#999] uppercase tracking-widest">Suggested Improvements</p>
									{#each improvement.improvements as imp}
										<div class="rounded-lg border border-[#2a2a2a] bg-[#111] p-4">
											<div class="flex items-center gap-2 mb-2">
												<span class="text-xs bg-[#1a1a1a] text-[#888] px-2 py-0.5 rounded capitalize">{imp.section}</span>
												<p class="text-xs text-yellow-400">{imp.issue}</p>
											</div>
											<p class="text-sm text-[#ccc] mb-2">{imp.suggestion}</p>
											<p class="text-xs text-[#555]">↳ {imp.whyItWorks}</p>
										</div>
									{/each}
								</div>
							{/if}
							{#if improvement.strengthsToKeep?.length}
								<div class="rounded-lg bg-[#111] border border-[#2a2a2a] p-3">
									<p class="text-xs text-[#555] font-medium mb-2">✓ Keep these</p>
									{#each improvement.strengthsToKeep as s}
										<p class="text-xs text-[#888] mb-1">• {s}</p>
									{/each}
								</div>
							{/if}
						</div>
					{/if}

					{#each [['Opener', selected.opener], ['Elevator Pitch', selected.elevator_pitch], ['Discovery', selected.discovery], ['Closing', selected.closing]] as [label, content]}
						{#if content}
							<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
								<p class="text-xs text-[#555] uppercase tracking-widest mb-3">{label}</p>
								<p class="text-sm text-[#ccc] leading-relaxed whitespace-pre-wrap">{content}</p>
							</div>
						{/if}
					{/each}

					<div>
						<p class="text-xs text-[#999] uppercase tracking-widest mb-3">Objection Handlers ({selected.objections?.length ?? 0})</p>
						{#each (selected.objections ?? []).sort((a,b) => a.sort_order - b.sort_order) as obj}
							<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 mb-3 group hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
								<div class="flex items-start justify-between mb-2">
									<p class="text-sm text-yellow-400 font-medium">"{obj.objection}"</p>
									<button onclick={() => deleteObjection(obj.id)} class="opacity-0 group-hover:opacity-100 text-[#666] hover:text-red-400 transition-colors text-xs ml-auto">🗑</button>
								</div>
								{#if obj.response}<p class="text-sm text-[#ccc] mt-2">{obj.response}</p>{/if}
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<div class="flex items-center justify-center h-full">
					<div class="text-center">
						<p class="text-3xl mb-3">📝</p>
						<p class="text-[#555] text-sm">Select a script to view it</p>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>