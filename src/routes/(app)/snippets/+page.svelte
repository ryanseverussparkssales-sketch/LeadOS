<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	interface Snippet { id:string; trigger:string; title:string; content:string; }
	let snippets = $state<Snippet[]>([]);
	let loading = $state(true);
	let nTrigger = $state(''); let nTitle = $state(''); let nContent = $state('');
	let saving = $state(false);

	onMount(async () => {
		const res = await apiFetch('/api/snippets');
		snippets = res.ok ? await res.json() : [];
		loading = false;
	});

	async function addSnippet() {
		if (!nTrigger.trim() || !nContent.trim()) return;
		saving = true;
		const res = await apiFetch('/api/snippets', { method:'POST', body: JSON.stringify({ trigger:nTrigger, title:nTitle||nTrigger, content:nContent }) });
		if (res.ok) { snippets = [await res.json(), ...snippets]; nTrigger = ''; nTitle = ''; nContent = ''; toastSuccess('Snippet added'); }
		else { toastError('Failed to add snippet — please try again'); }
		saving = false;
	}

	async function del(id: string) {
		if (!confirm('Delete this snippet?')) return;
		const res = await apiFetch(`/api/snippets/${id}`, { method:'DELETE' });
		if (res.ok) {
			snippets = snippets.filter(s => s.id !== id);
			toastSuccess('Snippet deleted');
		} else {
			toastError('Failed to delete snippet — please try again');
		}
	}
</script>

<svelte:head><title>Snippets — Edelhaus</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-y-auto">
	<div class="border-b border-[#1e1e1e] px-8 py-4">
		<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Text Snippets</h2>
		<p class="text-xs text-[#7c7c7c] mt-0.5">Type the trigger anywhere (SMS, email, notes) → Tab to expand</p>
	</div>
	<div class="p-8 max-w-2xl space-y-6">
		<!-- Add snippet -->
		<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-5 space-y-3">
			<p class="text-xs text-[#999] uppercase tracking-widest">New Snippet</p>
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="text-xs text-[#7c7c7c] block mb-1">Trigger (e.g. /intro)</label>
					<input bind:value={nTrigger} placeholder="/intro" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" style="font-family:var(--font-mono)" />
				</div>
				<div>
					<label class="text-xs text-[#7c7c7c] block mb-1">Title (optional)</label>
					<input bind:value={nTitle} placeholder="Introduction" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
				</div>
			</div>
			<div>
				<label class="text-xs text-[#7c7c7c] block mb-1">Content *</label>
				<textarea bind:value={nContent} rows="4" placeholder="Hi, my name is Ryan from Edelhaus. I'm reaching out because..." class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none resize-none"></textarea>
			</div>
			<button onclick={addSnippet} disabled={saving || !nTrigger.trim() || !nContent.trim()} class="rounded-lg bg-white px-5 py-2 text-xs font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5]">{saving ? 'Saving...' : 'Add Snippet'}</button>
		</div>

		<!-- Snippet list -->
	{#if loading}
		<div class="flex-1 p-8 space-y-3">
			{#each [1,2,3,4,5] as _}
				<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			{/each}
		</div>
	{:else}

		{#if snippets.length === 0}
			<p class="text-[#6e6e6e] text-sm">No snippets yet. Create one above.</p>
		{:else}
			<div class="space-y-2">
				{#each snippets as snippet}
					<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-4 group flex items-start gap-4">
						<code class="text-sm text-blue-400 w-24 shrink-0 pt-0.5">{snippet.trigger}</code>
						<div class="flex-1 min-w-0">
							<p class="text-sm text-white font-medium">{snippet.title}</p>
							<p class="text-xs text-[#8a8a8a] mt-0.5 whitespace-pre-wrap">{snippet.content}</p>
						</div>
						<button onclick={() => del(snippet.id)} class="opacity-0 group-hover:opacity-100 text-xs text-red-700 hover:text-red-400 transition-all shrink-0"><Icon name="x" size={14} /></button>
					</div>
				{/each}
			</div>
		{/if}
{/if}
	</div>
</div>
