<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { apiFetch } from '$lib/api';
	import { getSession } from '$lib/services/auth';
	import DropZone from '$lib/components/DropZone.svelte';
	import FileAssignModal from '$lib/components/FileAssignModal.svelte';

	interface Doc {
		id:string; name:string; file_url:string; file_type:string|null; file_size:number|null;
		document_category:string; created_at:string; contact_id:string|null; deal_id:string|null;
		client_id?:string|null; project_id?:string|null;
		contact?:{name:string;company:string}|null; storage_path:string|null;
		savedAs?: 'knowledge_base';
	}

	let docs = $state<Doc[]>([]);
	let loading = $state(true);
	let filterCat = $state('');
	let filterClient = $state('');
	let search = $state('');
	let uploading = $state(false);
	let uploadMsg = $state('');
	let urlInput = $state(''); let urlName = $state(''); let urlCat = $state('general');

	// Drop zone state
	let pendingFiles = $state<File[]>([]);
	let showAssignModal = $state(false);

	// Clients for filter
	let clients = $state<{id:string;name:string}[]>([]);

	const CATEGORIES = ['general','contract','proposal','invoice','report','presentation','data','other'];
	const CAT_ICONS: Record<string,string> = { general:'📄', contract:'📜', proposal:'📋', invoice:'💰', report:'📊', presentation:'📽', data:'🗃', other:'📁' };

	onMount(load);

	async function load() {
		loading = true;
		const [res, cr] = await Promise.all([apiFetch('/api/documents'), apiFetch('/api/clients')]);
		docs = res.ok ? await res.json() : [];
		clients = cr.ok ? (await cr.json()).map((c: any) => ({ id: c.id, name: c.name })) : [];

		// Also fetch reports as docs
		const rr = await apiFetch('/api/reports');
		if (rr.ok) {
			const reports = await rr.json();
			for (const r of reports) {
				if (!docs.find(d => d.id === `report-${r.id}`)) {
					docs.push({ id:`report-${r.id}`, name:r.report_title, file_url:`/reports`, file_type:'text/html', file_size:null, document_category:'report', created_at:r.created_at, contact_id:null, deal_id:null, storage_path:null });
				}
			}
		}
		docs.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
		loading = false;
	}

	// Fix 1: correct auth using Supabase session
	async function uploadFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		uploading = true; uploadMsg = '';
		const fd = new FormData();
		fd.append('file', file);
		fd.append('category', urlCat);

		const session = await getSession();
		const token = session?.access_token ?? '';

		const res = await fetch('/api/documents/upload', {
			method: 'POST',
			body: fd,
			headers: { Authorization: `Bearer ${token}` }
		});
		if (res.ok) { const d = await res.json(); docs = [d, ...docs]; uploadMsg = d.uploadError ?? '✓ Uploaded'; }
		else uploadMsg = 'Upload failed';
		uploading = false;
	}

	async function addUrl() {
		if (!urlInput.trim()) return;
		uploading = true;
		const fd = new FormData();
		fd.append('url', urlInput); fd.append('name', urlName || urlInput.split('/').pop() || 'Link'); fd.append('category', urlCat);

		const session = await getSession();
		const token = session?.access_token ?? '';

		const res = await fetch('/api/documents/upload', {
			method: 'POST',
			body: fd,
			headers: { Authorization: `Bearer ${token}` }
		});
		if (res.ok) { const d = await res.json(); docs = [d, ...docs]; urlInput = ''; urlName = ''; uploadMsg = '✓ Link saved'; }
		uploading = false;
	}

	async function deleteDoc(id: string) {
		await apiFetch(`/api/documents/${id}`, { method:'DELETE' });
		docs = docs.filter(d => d.id !== id);
	}

	// Drop zone handlers
	function onFilesDropped(files: File[]) {
		pendingFiles = files;
		showAssignModal = true;
	}

	function onDocsSaved(newDocs: Doc[]) {
		// Knowledge base saves won't appear in doc list; regular docs do
		const regularDocs = newDocs.filter(d => d.savedAs !== 'knowledge_base');
		if (regularDocs.length) docs = [...regularDocs, ...docs];
		showAssignModal = false;
		pendingFiles = [];
		uploadMsg = newDocs[0]?.savedAs === 'knowledge_base'
			? `✓ Added ${newDocs.length} item${newDocs.length > 1 ? 's' : ''} to Knowledge Base`
			: `✓ Saved ${newDocs.length} file${newDocs.length > 1 ? 's' : ''}`;
	}

	function fmtSize(bytes: number|null) {
		if (!bytes) return '';
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1048576) return `${(bytes/1024).toFixed(0)}KB`;
		return `${(bytes/1048576).toFixed(1)}MB`;
	}

	function fmtDate(iso: string) { return new Date(iso).toLocaleDateString(); }

	function clientName(id: string | null | undefined) {
		if (!id) return null;
		return clients.find(c => c.id === id)?.name ?? null;
	}

	const filtered = $derived(docs.filter(d => {
		if (filterCat && d.document_category !== filterCat) return false;
		if (filterClient && d.client_id !== filterClient) return false;
		if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
		return true;
	}));

	// Export helpers
	function exportCSV(type: string) {
		window.open(`/api/export?type=${type}`, '_blank');
	}
</script>

<svelte:head><title>Docs — Edelhaus</title></svelte:head>

{#if showAssignModal}
	<FileAssignModal files={pendingFiles} onclose={() => { showAssignModal = false; pendingFiles = []; }} onsaved={onDocsSaved} />
{/if}

<div class="flex flex-col flex-1 h-full overflow-y-auto">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between">
		<div>
			<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Document Library</h2>
			<p class="text-xs text-[#7c7c7c] mt-0.5">{docs.length} documents</p>
		</div>
		<div class="flex gap-2 items-center">
			<!-- Export dropdown -->
			<div class="relative group">
				<button class="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#999] hover:border-white hover:text-white transition-colors">↓ Export CSV</button>
				<div class="absolute right-0 top-full mt-1 bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden w-44 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
					{#each [['contacts','Contacts'],['calls','Calls'],['deals','Deals'],['time-entries','Time Entries'],['analytics','Analytics']] as [t,l]}
						<button onclick={() => exportCSV(t)} class="w-full text-left px-4 py-2.5 text-xs text-[#888] hover:text-white hover:bg-white/5 transition-colors border-b border-[#1e1e1e] last:border-0">{l}</button>
					{/each}
				</div>
			</div>
			<label class="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors cursor-pointer">
				+ Upload
				<input type="file" class="hidden" onchange={uploadFile} />
			</label>
		</div>
	</div>

	<!-- Upload status -->
	{#if uploadMsg}
		<div class="px-8 py-2 bg-[#0d0d0d] border-b border-[#1e1e1e]">
			<p class="text-xs {uploadMsg.startsWith('✓') ? 'text-[var(--accent)]' : 'text-red-400'}">{uploadMsg}</p>
		</div>
	{/if}

	<!-- Drop zone -->
	<div class="px-8 py-5 border-b border-[#1e1e1e]">
		<DropZone
			accept=".pdf,.docx,.doc,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp"
			multiple={true}
			onfiles={onFilesDropped}
			label="Drop documents here"
			sublabel="PDF · DOCX · CSV · Images · or click to browse"
		/>
	</div>

	<div class="flex flex-1 overflow-hidden">
		<!-- Sidebar: filters + URL upload -->
		<div class="w-60 shrink-0 border-r border-[#1e1e1e] flex flex-col">
			<div class="p-4 space-y-3 border-b border-[#1e1e1e]">
				<input bind:value={search} placeholder="Search docs..." class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" />

				<!-- Category filter -->
				<div class="space-y-1">
					<button onclick={() => filterCat = ''} class="w-full text-left px-2 py-1.5 rounded text-xs transition-colors {!filterCat ? 'bg-white/10 text-white' : 'text-[#7c7c7c] hover:text-white'}">All documents ({docs.length})</button>
					{#each CATEGORIES as cat}
						{@const count = docs.filter(d => d.document_category === cat).length}
						{#if count > 0 || true}
							<button onclick={() => filterCat = filterCat === cat ? '' : cat} class="w-full text-left px-2 py-1.5 rounded text-xs transition-colors flex items-center gap-2 {filterCat === cat ? 'bg-white/10 text-white' : 'text-[#7c7c7c] hover:text-white'}">
								<span>{CAT_ICONS[cat]}</span>
								<span class="flex-1 capitalize">{cat}</span>
								<span class="text-[#333]">{count}</span>
							</button>
						{/if}
					{/each}
				</div>

				<!-- Client filter -->
				{#if clients.length > 0}
					<div class="pt-2 border-t border-[#1e1e1e]">
						<p class="text-xs text-[#7c7c7c] uppercase tracking-widest mb-2">By Client</p>
						<button onclick={() => filterClient = ''} class="w-full text-left px-2 py-1.5 rounded text-xs transition-colors {!filterClient ? 'bg-white/10 text-white' : 'text-[#7c7c7c] hover:text-white'}">All clients</button>
						{#each clients as c}
							<button onclick={() => filterClient = filterClient === c.id ? '' : c.id} class="w-full text-left px-2 py-1.5 rounded text-xs transition-colors truncate {filterClient === c.id ? 'bg-white/10 text-white' : 'text-[#7c7c7c] hover:text-white'}">{c.name}</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Add URL link -->
			<div class="p-4 space-y-2 flex-1">
				<p class="text-xs text-[#7c7c7c] uppercase tracking-widest mb-2">Add Link</p>
				<input bind:value={urlInput} placeholder="https://..." class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" />
				<input bind:value={urlName} placeholder="Display name" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" />
				<select bind:value={urlCat} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white focus:border-white focus:outline-none">
					{#each CATEGORIES as cat}<option value={cat} class="capitalize">{cat}</option>{/each}
				</select>
				<button onclick={addUrl} disabled={uploading || !urlInput.trim()} class="w-full rounded-lg bg-white py-2 text-xs font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5]">Save Link</button>
			</div>
		</div>

		<!-- Main: doc grid -->
		<div class="flex-1 overflow-y-auto p-6">
			{#if loading}
				<p class="text-[#6e6e6e] text-sm">Loading...</p>
			{:else if filtered.length === 0}
				<div class="flex items-center justify-center h-full text-center">
					<div>
						<p class="text-4xl mb-3">📁</p>
						<p class="text-[#6e6e6e] text-sm">No documents yet</p>
						<p class="text-[#333] text-xs mt-1">Drop files above or add a link</p>
					</div>
				</div>
			{:else}
				<div class="grid grid-cols-3 gap-3">
					{#each filtered as doc}
						<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-4 group hover:border-[#444] transition-colors">
							<div class="flex items-start justify-between mb-3">
								<span class="text-2xl">{CAT_ICONS[doc.document_category] ?? '📄'}</span>
								<div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
									{#if !doc.file_url.startsWith('pending-upload:')}
										<a href={doc.file_url} target="_blank" class="rounded p-1 text-[#7c7c7c] hover:text-white hover:bg-white/5 transition-colors text-xs" title="Open">↗</a>
									{/if}
									{#if !doc.id.startsWith('report-')}
										<button onclick={() => deleteDoc(doc.id)} class="rounded p-1 text-red-700 hover:text-red-400 hover:bg-red-950/20 transition-colors text-xs" title="Delete"><Icon name="x" size={14} /></button>
									{/if}
								</div>
							</div>
							<p class="text-sm text-white font-medium truncate mb-1">{doc.name}</p>
							<div class="flex items-center gap-2 flex-wrap">
								<span class="text-xs text-[#6e6e6e] capitalize">{doc.document_category}</span>
								{#if doc.file_size}<span class="text-xs text-[#333]">{fmtSize(doc.file_size)}</span>{/if}
							</div>
							{#if clientName(doc.client_id)}
								<div class="mt-2">
									<span class="inline-block text-[10px] px-2 py-0.5 rounded-full border border-[#2a2a2a] text-[#8a8a8a]">{clientName(doc.client_id)}</span>
								</div>
							{/if}
							<p class="text-xs text-[#333] mt-2">{fmtDate(doc.created_at)}</p>
							{#if doc.file_url.startsWith('pending-upload:')}
								<p class="text-xs text-yellow-600 mt-1">⚠ Create "documents" bucket in Supabase Storage to enable uploads</p>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
