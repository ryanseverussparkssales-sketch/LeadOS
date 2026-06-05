<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	interface Client { id: string; name: string; }
	interface CallList { id: string; name: string; call_list_contacts: [{count: number}]; }
	interface Campaign { id: string; name: string; status: string; call_lists: CallList[]; }
	interface Project { id: string; name: string; client: Client; campaigns?: Campaign[]; }

	let clients = $state<Client[]>([]);
	let loading = $state(true);
	let projects = $state<Project[]>([]);
	let selected = $state<Project | null>(null);
	let campaigns = $state<Campaign[]>([]);
	let filterClientId = $state('');
	let newCampaignName = $state('');
	let addingCampaign = $state(false);
	let loadingCampaigns = $state(false);

	onMount(async () => {
		const [cr, pr] = await Promise.all([apiFetch('/api/clients'), apiFetch('/api/projects')]);
		clients = cr.ok ? await cr.json() : [];
		projects = pr.ok ? await pr.json() : [];
		loading = false;
	});

	const filtered = $derived(
		filterClientId ? projects.filter(p => p.client?.id === filterClientId) : projects
	);

	async function selectProject(p: Project) {
		selected = p;
		loadingCampaigns = true;
		const res = await apiFetch(`/api/campaigns?project_id=${p.id}`);
		campaigns = res.ok ? await res.json() : [];
		loadingCampaigns = false;
	}

	async function createCampaign() {
		if (!newCampaignName.trim() || !selected) return;
		addingCampaign = true;
		const res = await apiFetch('/api/campaigns', {
			method: 'POST',
			body: JSON.stringify({ name: newCampaignName, project_id: selected.id }),
		});
		addingCampaign = false;
		if (res.ok) {
			newCampaignName = '';
			const r = await apiFetch(`/api/campaigns?project_id=${selected.id}`);
			campaigns = r.ok ? await r.json() : campaigns;
			toastSuccess('Campaign created');
		} else {
			toastError('Failed to create campaign');
		}
	}

	async function deleteCampaign(id: string) {
		if (!confirm('Delete this campaign and all its call lists? This cannot be undone.')) return;
		const res = await apiFetch(`/api/campaigns/${id}`, { method: 'DELETE' });
		if (res.ok) {
			campaigns = campaigns.filter(c => c.id !== id);
			toastSuccess('Campaign deleted');
		} else {
			toastError('Failed to delete campaign');
		}
	}

	function listCount(c: Campaign) {
		return c.call_lists?.length ?? 0;
	}

	function contactCount(c: Campaign) {
		const direct = (c as any).campaign_contacts?.[0]?.count ?? 0;
		const viaLists = c.call_lists?.reduce((sum, l) =>
			sum + (l.call_list_contacts?.[0]?.count ?? 0), 0) ?? 0;
		return direct || viaLists;
	}
</script>

<svelte:head><title>Projects — RogueOS</title></svelte:head>

<div class="flex flex-col flex-1 h-full">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center gap-4">
		<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Projects</h2>
		<select bind:value={filterClientId}
			class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-xs text-white focus:border-white focus:outline-none">
			<option value="">All clients</option>
			{#each clients as c}<option value={c.id}>{c.name}</option>{/each}
		</select>
	</div>

	<div class="flex flex-1 overflow-hidden">
		<!-- Project list -->
		<div class="w-72 shrink-0 border-r border-[#1e1e1e] overflow-y-auto">
			{#each filtered as project}
				<button onclick={() => selectProject(project)}
					class="w-full text-left px-4 py-3 border-b border-[#1e1e1e] transition-colors {selected?.id === project.id ? 'bg-white/10' : 'hover:bg-white/5'}">
					<p class="text-sm text-white font-medium truncate">{project.name}</p>
					<p class="text-xs text-[#555] mt-0.5">{project.client?.name}</p>
				</button>
			{:else}
				<p class="text-center text-[#444] text-xs py-8">No projects — create from Clients view</p>
			{/each}
		</div>

		<!-- Project detail: campaigns -->
		<div class="flex-1 overflow-y-auto p-8">
			{#if selected}
				<div class="max-w-2xl">
					<div class="mb-6">
						<p class="text-xs text-[#555] mb-1">{selected.client?.name}</p>
						<h3 class="text-white text-xl font-semibold">{selected.name}</h3>
					</div>

					<!-- New campaign -->
					<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-4 mb-6">
						<p class="text-xs text-[#999] uppercase tracking-widest mb-3">New Campaign</p>
						<div class="flex gap-2">
							<input bind:value={newCampaignName} placeholder="Campaign name"
								onkeydown={(e) => e.key === 'Enter' && createCampaign()}
								class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
							<button onclick={createCampaign} disabled={addingCampaign || !newCampaignName.trim()}
								class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-40">
								Add
							</button>
						</div>
					</div>

					<!-- Campaigns list -->
					{#if loadingCampaigns}
						<p class="text-[#444] text-sm">Loading...</p>
					{:else}
						<div class="space-y-3">
							{#each campaigns as campaign}
								<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-4">
									<div class="flex items-start justify-between mb-3">
										<div>
											<p class="text-white text-sm font-medium">{campaign.name}</p>
											<p class="text-xs text-[#555] mt-0.5">
												{listCount(campaign)} call list{listCount(campaign) !== 1 ? 's' : ''} · {contactCount(campaign)} contacts
											</p>
										</div>
										<div class="flex items-center gap-3 shrink-0">
											<a href="/campaigns" class="text-xs text-[#666] hover:text-white transition-colors">
												Manage →
											</a>
											<button onclick={() => deleteCampaign(campaign.id)}
												class="text-xs text-red-700 hover:text-red-400 transition-colors">
												Delete
											</button>
										</div>
									</div>
									{#if campaign.call_lists?.length}
										<div class="flex flex-wrap gap-2">
											{#each (campaign.call_lists ?? []) as list}
												<span class="px-2 py-1 rounded text-xs bg-[#1a1a1a] border border-[#2a2a2a] text-[#666]">
													{list.name}
												</span>
											{/each}
										</div>
									{:else}
										<p class="text-xs text-[#444]">No call lists yet — add them in Campaigns view</p>
									{/if}
								</div>
							{:else}
								<p class="text-[#444] text-sm">No campaigns yet. Add one above.</p>
							{/each}
						</div>
					{/if}
				</div>
			{:else}
				<div class="flex items-center justify-center h-full">
					<p class="text-[#555] text-sm">Select a project or create one above.</p>
			</div>
	{/if}
	</div>
</div>
</div>
