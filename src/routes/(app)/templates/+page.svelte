<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	type TType = 'email' | 'sms';
	type TCategory = 'general' | 'follow_up' | 'thank_you' | 'intro' | 'proposal' | 'breakup' | 'custom';

	interface Template { id:string; name:string; type:TType; category:TCategory; subject:string|null; body:string; use_count:number; created_at:string; }

	let templates = $state<Template[]>([]);
	let filterType = $state<TType|''>('');
	let filterCat = $state('');
	let selected = $state<Template|null>(null);
	let editing = $state(false);
	let loading = $state(true);
	let saving = $state(false);
	let generating = $state(false);

	// Form
	let fName = $state(''); let fType = $state<TType>('email'); let fCat = $state<TCategory>('general');
	let fSubject = $state(''); let fBody = $state(''); let fGenerateDesc = $state('');
	let showGenerateForm = $state(false);

	const CATEGORIES: [TCategory, string][] = [['general','General'],['follow_up','Follow-up'],['thank_you','Thank You'],['intro','Introduction'],['proposal','Proposal'],['breakup','Breakup'],['custom','Custom']];
	const VARS = ['{name}', '{first_name}', '{company}', '{rep_name}', '{product}'];

	onMount(load);

	async function load() {
		loading = true;
		const params = new URLSearchParams();
		if (filterType) params.set('type', filterType);
		if (filterCat) params.set('category', filterCat);
		const res = await apiFetch(`/api/templates?${params}`);
		templates = res.ok ? await res.json() : [];
		loading = false;
	}

	function selectTemplate(t: Template) {
		selected = t; editing = false;
		fName = t.name; fType = t.type; fCat = t.category; fSubject = t.subject ?? ''; fBody = t.body;
	}

	function newTemplate() {
		selected = null; editing = true;
		fName = ''; fType = 'email'; fCat = 'general'; fSubject = ''; fBody = '';
	}

	async function save() {
		if (!fName.trim() || !fBody.trim()) return;
		saving = true;
		const payload = { name:fName, type:fType, category:fCat, subject:fType === 'email' ? fSubject||null : null, body:fBody };
		let res;
		if (selected?.id) {
			res = await apiFetch(`/api/templates/${selected.id}`, { method:'PUT', body: JSON.stringify(payload) });
		} else {
			res = await apiFetch('/api/templates', { method:'POST', body: JSON.stringify(payload) });
		}
		if (res.ok) {
			const saved = await res.json();
			if (selected?.id) templates = templates.map(t => t.id === saved.id ? saved : t);
			else templates = [saved, ...templates];
			selected = saved; editing = false;
			toastSuccess('Template saved');
		} else {
			toastError('Failed to save template — please try again');
		}
		saving = false;
	}

	async function generateTemplate() {
		if (!fGenerateDesc.trim()) return;
		generating = true;
		const res = await apiFetch('/api/templates', { method:'POST', body: JSON.stringify({ name:fName||'AI Template', type:fType, category:fCat, body:fGenerateDesc, generateFromDescription:true }) });
		if (res.ok) {
			const saved = await res.json();
			templates = [saved, ...templates];
			selectTemplate(saved);
			fGenerateDesc = ''; showGenerateForm = false;
			toastSuccess('Template generated');
		} else {
			toastError('Failed to generate template — please try again');
		}
		generating = false;
	}

	async function deleteTemplate(id: string) {
		if (!confirm('Delete this template?')) return;
		const res = await apiFetch(`/api/templates/${id}`, { method:'DELETE' });
		if (res.ok) {
			templates = templates.filter(t => t.id !== id);
			if (selected?.id === id) selected = null;
			toastSuccess('Template deleted');
		} else {
			toastError('Failed to delete template — please try again');
		}
	}

	function insertVar(v: string) {
		fBody += v;
	}

	const filtered = $derived(templates.filter(t => {
		if (filterType && t.type !== filterType) return false;
		if (filterCat && t.category !== filterCat) return false;
		return true;
	}));
</script>

<svelte:head><title>Templates — Edelhaus</title></svelte:head>

<div class="flex flex-col flex-1 h-full">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between">
		<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Email & SMS Templates</h2>
		<div class="flex gap-2">
			<!-- Type + Category filters -->
			<select bind:value={filterType} onchange={load} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs text-white focus:border-white focus:outline-none">
				<option value="">All types</option><option value="email">Email</option><option value="sms">SMS</option>
			</select>
			<button onclick={() => showGenerateForm = !showGenerateForm} class="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/12 px-3 py-1.5 text-xs text-[var(--accent)] hover:bg-[var(--accent-hi)] transition-colors">✨ Generate</button>
			<button onclick={newTemplate} class="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">+ New Template</button>
		</div>
	</div>

	{#if showGenerateForm}
		<div class="border-b border-[#1e1e1e] bg-[var(--accent)]/12 px-8 py-4">
			<div class="max-w-2xl space-y-3">
				<p class="text-xs text-[var(--accent)] font-medium">✨ AI Template Generator</p>
				<div class="flex gap-3">
					<select bind:value={fType} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-[var(--accent)]/40 focus:outline-none">
						<option value="email">Email</option><option value="sms">SMS</option>
					</select>
					<select bind:value={fCat} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-[var(--accent)]/40 focus:outline-none">
						{#each CATEGORIES as [v,l]}<option value={v}>{l}</option>{/each}
					</select>
					<input bind:value={fName} placeholder="Template name" class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-[var(--accent)]/40 focus:outline-none" />
				</div>
				<textarea bind:value={fGenerateDesc} rows="2" placeholder="Describe what this template should do: e.g. 'Follow up after a no-answer call, mention we tried to reach them and invite them to book a time'" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-[var(--accent)]/40 focus:outline-none resize-none"></textarea>
				<button onclick={generateTemplate} disabled={generating || !fGenerateDesc.trim()} class="rounded-lg bg-[var(--accent)] px-5 py-2 text-xs font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-hi)] disabled:opacity-40 transition-colors">
					{generating ? '✨ Writing...' : '✨ Generate Template'}
				</button>
			</div>
		</div>
	{/if}

	<div class="flex flex-1 overflow-hidden">
		<!-- Template list -->
		<div class="w-64 shrink-0 border-r border-[#1e1e1e] overflow-y-auto">
			{#if loading}
		<div class="p-8 space-y-3">
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
		</div>
	{:else if filtered.length === 0}
				<p class="text-xs text-[#6e6e6e] text-center py-8">No templates yet</p>
			{:else}
				{#each filtered as t}
					<button onclick={() => selectTemplate(t)}
						class="w-full text-left px-4 py-3 border-b border-[#1e1e1e] transition-colors {selected?.id === t.id ? 'bg-white/10' : 'hover:bg-white/5'}">
						<div class="flex items-center gap-2 mb-0.5">
							<span class="text-xs {t.type === 'email' ? 'text-blue-400' : 'text-[var(--accent)]'}">{t.type === 'email' ? '✉' : '💬'}</span>
							<p class="text-sm text-white font-medium truncate">{t.name}</p>
						</div>
						<p class="text-xs text-[#7c7c7c] capitalize">{t.category.replace(/_/g,' ')} · {t.use_count} uses</p>
					</button>
				{/each}
			{/if}
		</div>

		<!-- Template detail / editor -->
		<div class="flex-1 overflow-y-auto p-8">
			{#if editing}
				<div class="max-w-2xl space-y-4">
					<input bind:value={fName} placeholder="Template name *" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2 text-lg text-white placeholder-[#444] focus:border-white focus:outline-none font-medium" />
					<div class="flex gap-3">
						<select bind:value={fType} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
							<option value="email">Email</option><option value="sms">SMS (text)</option>
						</select>
						<select bind:value={fCat} class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
							{#each CATEGORIES as [v,l]}<option value={v}>{l}</option>{/each}
						</select>
					</div>
					{#if fType === 'email'}
						<div>
							<label class="text-xs text-[#7c7c7c] block mb-1.5">Subject Line</label>
							<input bind:value={fSubject} placeholder="Subject (supports variables)" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
						</div>
					{/if}
					<div>
						<div class="flex items-center justify-between mb-1.5">
							<label class="text-xs text-[#7c7c7c]">Body *</label>
							<div class="flex gap-1">
								{#each VARS as v}
									<button onclick={() => insertVar(v)} class="rounded px-1.5 py-0.5 text-xs bg-[#1a1a1a] border border-[#2a2a2a] text-[#8a8a8a] hover:text-white hover:border-[#444] transition-colors" style="font-family:var(--font-mono)">{v}</button>
								{/each}
							</div>
						</div>
						<textarea bind:value={fBody} rows={fType === 'sms' ? 4 : 8} placeholder="Template body...&#10;&#10;Use variables: {'{name}'}, {'{company}'}, {'{rep_name}'}, {'{product}'}" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
						{#if fType === 'sms'}
							<p class="text-xs text-right mt-1 {fBody.length > 160 ? 'text-red-400' : 'text-[#6e6e6e]'}">{fBody.length}/160</p>
						{/if}
					</div>
					<div class="flex gap-3">
						<button onclick={save} disabled={saving || !fName.trim() || !fBody.trim()} class="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5]">{saving ? 'Saving...' : 'Save Template'}</button>
						<button onclick={() => { editing = false; if (selected) selectTemplate(selected); else selected = null; }} class="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-[#8a8a8a] hover:text-white">Cancel</button>
					</div>
				</div>
			{:else if selected}
				<div class="max-w-2xl space-y-5">
					<div class="flex items-start justify-between">
						<div>
							<div class="flex items-center gap-2 mb-1">
								<span class="text-lg">{selected.type === 'email' ? '✉️' : '💬'}</span>
								<h3 class="text-white text-xl font-semibold">{selected.name}</h3>
							</div>
							<p class="text-xs text-[#7c7c7c] capitalize">{selected.type} · {selected.category.replace(/_/g,' ')} · {selected.use_count} uses</p>
						</div>
						<div class="flex gap-2">
							<button onclick={() => { editing = true; }} class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#999] hover:border-white hover:text-white transition-colors">Edit</button>
							<button onclick={() => deleteTemplate(selected!.id)} class="text-xs text-red-700 hover:text-red-400 px-2">Delete</button>
						</div>
					</div>

					{#if selected.subject}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
							<p class="text-xs text-[#7c7c7c] uppercase tracking-widest mb-1">Subject</p>
							<p class="text-sm text-white">{selected.subject}</p>
						</div>
					{/if}

					<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
						<p class="text-xs text-[#7c7c7c] uppercase tracking-widest mb-2">Body</p>
						<p class="text-sm text-[#ccc] whitespace-pre-wrap leading-relaxed">{selected.body}</p>
					</div>

					<!-- Variable legend -->
					<div class="rounded-lg border border-[#1e1e1e] p-3">
						<p class="text-xs text-[#6e6e6e] font-medium mb-1.5">Variables (auto-filled when used with a contact)</p>
						<div class="flex flex-wrap gap-2">
							{#each [{v:'{name}',d:"Contact's full name"},{v:'{first_name}',d:"First name only"},{v:'{company}',d:"Company name"},{v:'{rep_name}',d:"Your name"},{v:'{product}',d:"Your product"}] as item}
								<div class="rounded px-2 py-1 bg-[#1a1a1a] border border-[#2a2a2a]">
									<code class="text-xs text-blue-400">{item.v}</code>
									<span class="text-xs text-[#6e6e6e] ml-1.5">{item.d}</span>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{:else}
				<div class="flex items-center justify-center h-full">
					<div class="text-center">
						<p class="text-[#6e6e6e] text-sm">Select a template or create a new one</p>
						<button onclick={newTemplate} class="mt-3 text-xs text-white underline">Create first template</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
