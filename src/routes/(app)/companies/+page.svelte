<script lang="ts">
    import { onMount } from 'svelte';
    import { titleFor } from '$lib/brand';
    import Icon from '$lib/components/Icon.svelte';
    import { apiFetch } from '$lib/api';
    import { toastSuccess, toastError } from '$lib/stores/toast';

    interface Contact { id: string; name: string; phone: string|null; email: string|null; title: string|null; status: string; }
    interface Company {
        id: string; name: string; phone: string|null; email: string|null; website: string|null;
        industry: string|null; city: string|null; state: string|null; company_type: string;
        size: string|null; tags: string[]|null; client_id: string|null; notes: string|null;
        description: string|null; client?: {name:string}|null;
        contacts?: Contact[];
    }

    const TYPES = ['prospect','customer','partner','investor','vendor'];
    const TYPE_COLORS: Record<string,string> = {
        prospect: 'text-yellow-400 bg-yellow-400/10',
        customer: 'text-[var(--accent)] bg-[var(--accent)]/12',
        partner: 'text-blue-400 bg-blue-400/10',
        investor: 'text-[var(--accent)] bg-[var(--accent)]/12',
        vendor: 'text-[#888] bg-[#1a1a1a]',
    };

    let companies = $state<Company[]>([]);
    let selected = $state<Company | null>(null);
    let loading = $state(true);
    let search = $state('');
    let clients = $state<{id:string;name:string}[]>([]);

    // Create form
    let showNew = $state(false);
    let newForm = $state({ name: '', phone: '', email: '', website: '', industry: '', city: '', state: '', company_type: 'prospect', client_id: '' });
    let saving = $state(false);

    // Edit mode
    let editing = $state(false);
    let editForm = $state<Partial<Company>>({});

    // Tag input
    let tagInput = $state('');

    let typeFilter = $state('');
    let clientFilter = $state('');
    let industryFilter = $state('');
    const industries = $derived([...new Set(companies.map(c => c.industry).filter(Boolean))].sort() as string[]);
    const filtered = $derived(companies.filter(c =>
        (!search || c.name.toLowerCase().includes(search.toLowerCase()) || c.industry?.toLowerCase().includes(search.toLowerCase()) || c.city?.toLowerCase().includes(search.toLowerCase()))
        && (!typeFilter || c.company_type === typeFilter)
        && (!clientFilter || (c as Record<string, unknown> & { client?: { id?: string } }).client?.id === clientFilter || (c as Record<string, unknown>).client_id === clientFilter)
        && (!industryFilter || c.industry === industryFilter)
    ));
    const filtersActive = $derived(Boolean(typeFilter || clientFilter || industryFilter));

    onMount(async () => {
        const [cr, clr] = await Promise.all([apiFetch('/api/companies'), apiFetch('/api/clients')]);
        companies = cr.ok ? await cr.json() : [];
        clients = clr.ok ? (await clr.json()).map((c:any)=>({id:c.id,name:c.name})) : [];
        loading = false;
    });

    async function createCompany() {
        if (!newForm.name.trim()) return;
        saving = true;
        const r = await apiFetch('/api/companies', { method: 'POST', body: JSON.stringify(newForm) });
        if (r.ok) { companies = [await r.json(), ...companies]; showNew = false; newForm = { name: '', phone: '', email: '', website: '', industry: '', city: '', state: '', company_type: 'prospect', client_id: '' }; toastSuccess('Company created'); }
        else { toastError('Failed to create company'); }
        saving = false;
    }

    async function selectCompany(c: Company) {
        const r = await apiFetch(`/api/companies/${c.id}`);
        selected = r.ok ? await r.json() : c;
        editing = false;
    }

    async function saveEdit() {
        if (!selected) return;
        const r = await apiFetch(`/api/companies/${selected.id}`, { method: 'PATCH', body: JSON.stringify(editForm) });
        if (r.ok) {
            const updated = await r.json();
            selected = { ...selected, ...updated };
            companies = companies.map(c => c.id === selected!.id ? { ...c, ...updated } : c);
            editing = false;
            toastSuccess('Company updated');
        } else {
            toastError('Failed to save changes');
        }
    }

    async function deleteCompany(id: string) {
        if (!confirm('Delete this company? This cannot be undone.')) return;
        const r = await apiFetch(`/api/companies/${id}`, { method: 'DELETE' });
        if (r.ok) {
            companies = companies.filter(c => c.id !== id);
            if (selected?.id === id) selected = null;
            toastSuccess('Company deleted');
        } else {
            toastError('Failed to delete company');
        }
    }

    function startEdit() {
        editForm = { ...selected };
        editing = true;
    }

    function addTag() {
        if (!tagInput.trim() || !editForm.tags?.includes(tagInput.trim())) {
            editForm = { ...editForm, tags: [...(editForm.tags ?? []), tagInput.trim()] };
        }
        tagInput = '';
    }

    function removeTag(tag: string) {
        editForm = { ...editForm, tags: (editForm.tags ?? []).filter(t => t !== tag) };
    }
</script>

<svelte:head><title>{titleFor('Companies')}</title></svelte:head>

<div class="flex flex-col flex-1 h-full">
    <div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between">
        <h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Companies</h2>
        <div class="flex items-center gap-2">
            <a href="/companies/dedup" class="rounded-lg border border-[#2a2a2a] px-4 py-2 text-xs text-[#8a8a8a] hover:border-white hover:text-white transition-colors">
                🔗 Dedup
            </a>
            <button onclick={() => showNew = !showNew} class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5]">
                + New Company
            </button>
        </div>
    </div>

    <div class="flex flex-col lg:flex-row flex-1 overflow-hidden">
        <!-- Left: company list -->
        <div class="{selected ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'} w-full lg:w-72 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-[#1e1e1e]">
            <div class="p-3 border-b border-[#1e1e1e] space-y-2">
                <input bind:value={search} placeholder="Search companies..."
                    class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
                <div class="flex gap-2">
                    <select bind:value={typeFilter}
                        class="flex-1 min-w-0 rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white focus:border-white focus:outline-none">
                        <option value="">All types</option>
                        {#each TYPES as t}<option value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>{/each}
                    </select>
                    <select bind:value={clientFilter}
                        class="flex-1 min-w-0 rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white focus:border-white focus:outline-none">
                        <option value="">All clients</option>
                        {#each clients as c}<option value={c.id}>{c.name}</option>{/each}
                    </select>
                </div>
                {#if industries.length}
                    <div class="flex gap-2 items-center">
                        <select bind:value={industryFilter}
                            class="flex-1 min-w-0 rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white focus:border-white focus:outline-none">
                            <option value="">All industries</option>
                            {#each industries as ind}<option value={ind}>{ind}</option>{/each}
                        </select>
                        {#if filtersActive}
                            <button onclick={() => { typeFilter = ''; clientFilter = ''; industryFilter = ''; }}
                                class="text-xs text-[#8a8a8a] hover:text-white transition-colors whitespace-nowrap">✕ Clear</button>
                        {/if}
                    </div>
                {/if}
            </div>

            {#if showNew}
                <div class="p-3 border-b border-[#1e1e1e] bg-[#0d0d0d] space-y-2">
                    <input bind:value={newForm.name} placeholder="Company name *" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
                    <div class="grid grid-cols-2 gap-2">
                        <input bind:value={newForm.phone} placeholder="Phone" class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" />
                        <input bind:value={newForm.city} placeholder="City" class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <select bind:value={newForm.company_type} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:outline-none">
                            {#each TYPES as t}<option value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>{/each}
                        </select>
                        <select bind:value={newForm.client_id} class="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:outline-none">
                            <option value="">No client</option>
                            {#each clients as c}<option value={c.id}>{c.name}</option>{/each}
                        </select>
                    </div>
                    <div class="flex gap-2">
                        <button onclick={() => showNew = false} class="flex-1 rounded-lg border border-[#2a2a2a] py-1.5 text-xs text-[#7c7c7c] hover:border-white hover:text-white transition-colors">Cancel</button>
                        <button onclick={createCompany} disabled={saving || !newForm.name.trim()} class="flex-1 rounded-lg bg-white py-1.5 text-xs font-semibold text-black disabled:opacity-40">
                            {saving ? '...' : 'Add'}
                        </button>
                    </div>
                </div>
            {/if}

            <div class="flex-1 overflow-y-auto">
                {#if loading}
                    <p class="text-center text-xs text-[#6e6e6e] py-8">Loading...</p>
                {:else if filtered.length === 0}
                    <p class="text-center text-xs text-[#6e6e6e] py-8">No companies yet</p>
                {:else}
                    {#each filtered as co}
                        <button onclick={() => selectCompany(co)}
                            class="w-full text-left px-4 py-3 border-b border-[#1a1a1a] transition-colors {selected?.id === co.id ? 'bg-white/10' : 'hover:bg-white/5'}">
                            <div class="flex items-center gap-2">
                                <p class="text-sm text-white font-medium truncate flex-1">{co.name}</p>
                                <span class="text-xs px-1.5 py-0.5 rounded-full {TYPE_COLORS[co.company_type] ?? 'text-[#7c7c7c]'}">{co.company_type}</span>
                            </div>
                            {#if co.city || co.industry}
                                <p class="text-xs text-[#7c7c7c] mt-0.5">{[co.industry, co.city].filter(Boolean).join(' · ')}</p>
                            {/if}
                            {#if co.client?.name}
                                <p class="text-xs text-blue-400/70 mt-0.5">{co.client.name}</p>
                            {/if}
                        </button>
                    {/each}
                {/if}
            </div>
        </div>

        <!-- Right: company detail -->
        <div class="flex-1 overflow-y-auto p-6">
            {#if selected}
                <!-- Mobile back button -->
                <button onclick={() => selected = null} class="lg:hidden text-xs text-[#7c7c7c] hover:text-white transition-colors mb-3 block">← Back</button>
                <!-- Header -->
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h3 class="text-white text-xl font-semibold">{selected.name}</h3>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-xs px-2 py-0.5 rounded-full {TYPE_COLORS[selected.company_type] ?? ''}">{selected.company_type}</span>
                            {#if selected.client?.name}<span class="text-xs text-blue-400">{selected.client.name}</span>{/if}
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick={startEdit} class="text-xs border border-[#2a2a2a] px-3 py-1.5 rounded-lg text-[#9a9a9a] hover:border-white hover:text-white transition-colors">✎ Edit</button>
                        <button onclick={() => window.confirm('Delete this company? This cannot be undone.') && deleteCompany(selected!.id)} class="text-xs text-red-700 hover:text-red-400 transition-colors">Delete</button>
                    </div>
                </div>

                {#if editing}
                    <!-- Edit form -->
                    <div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 mb-4 space-y-3 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
                        <div class="grid grid-cols-2 gap-3">
                            <div><label class="text-xs text-[#7c7c7c] block mb-1">Name</label><input bind:value={editForm.name} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
                            <div><label class="text-xs text-[#7c7c7c] block mb-1">Type</label>
                                <select bind:value={editForm.company_type} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:outline-none">
                                    {#each TYPES as t}<option value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>{/each}
                                </select>
                            </div>
                            <div><label class="text-xs text-[#7c7c7c] block mb-1">Phone</label><input bind:value={editForm.phone} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
                            <div><label class="text-xs text-[#7c7c7c] block mb-1">Email</label><input bind:value={editForm.email} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
                            <div><label class="text-xs text-[#7c7c7c] block mb-1">Website</label><input bind:value={editForm.website} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
                            <div><label class="text-xs text-[#7c7c7c] block mb-1">Industry</label><input bind:value={editForm.industry} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
                            <div><label class="text-xs text-[#7c7c7c] block mb-1">City</label><input bind:value={editForm.city} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
                            <div><label class="text-xs text-[#7c7c7c] block mb-1">State</label><input bind:value={editForm.state} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none" /></div>
                            <div><label class="text-xs text-[#7c7c7c] block mb-1">Client</label>
                                <select bind:value={editForm.client_id} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:outline-none">
                                    <option value="">None</option>
                                    {#each clients as c}<option value={c.id}>{c.name}</option>{/each}
                                </select>
                            </div>
                            <div><label class="text-xs text-[#7c7c7c] block mb-1">Size</label>
                                <select bind:value={editForm.size} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:outline-none">
                                    <option value="">Unknown</option>
                                    {#each ['1-10','11-50','51-200','200+'] as s}<option value={s}>{s} employees</option>{/each}
                                </select>
                            </div>
                        </div>
                        <div><label class="text-xs text-[#7c7c7c] block mb-1">Tags</label>
                            <div class="flex flex-wrap gap-1.5 mb-2">
                                {#each editForm.tags ?? [] as tag}
                                    <span class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-xs text-[#888]">
                                        {tag}<button onclick={() => removeTag(tag)} class="text-[#6e6e6e] hover:text-white ml-0.5"><Icon name="x" size={14} /></button>
                                    </span>
                                {/each}
                            </div>
                            <div class="flex gap-2">
                                <input bind:value={tagInput} placeholder="Add tag (e.g. iotty-investor)" onkeydown={(e) => e.key === 'Enter' && addTag()}
                                    class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />
                                <button onclick={addTag} class="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-[#9a9a9a] hover:border-white hover:text-white transition-colors">+ Add</button>
                            </div>
                        </div>
                        <div><label class="text-xs text-[#7c7c7c] block mb-1">Notes</label>
                            <textarea bind:value={editForm.notes} rows="2" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none resize-none"></textarea>
                        </div>
                        <div class="flex gap-2">
                            <button onclick={() => editing = false} class="rounded-lg border border-[#2a2a2a] px-4 py-2 text-xs text-[#9a9a9a] hover:border-white hover:text-white transition-colors">Cancel</button>
                            <button onclick={saveEdit} class="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5]">Save</button>
                        </div>
                    </div>
                {:else}
                    <!-- Info display -->
                    <div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-4 mb-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
                        <div class="grid grid-cols-2 gap-3 text-xs">
                            {#if selected.phone}<div><span class="text-[#7c7c7c]">Phone</span><p><a href="/phone?number={selected.phone}" class="text-[var(--accent)] hover:underline">{selected.phone}</a></p></div>{/if}
                            {#if selected.email}<div><span class="text-[#7c7c7c]">Email</span><p><a href="mailto:{selected.email}" class="text-blue-400 hover:underline">{selected.email}</a></p></div>{/if}
                            {#if selected.website}<div><span class="text-[#7c7c7c]">Website</span><p><a href={selected.website} target="_blank" rel="noopener" class="text-blue-400 hover:underline">{selected.website} ↗</a></p></div>{/if}
                            {#if selected.industry}<div><span class="text-[#7c7c7c]">Industry</span><p class="text-white">{selected.industry}</p></div>{/if}
                            {#if selected.city || selected.state}<div><span class="text-[#7c7c7c]">Location</span><p class="text-white">{[selected.city, selected.state].filter(Boolean).join(', ')}</p></div>{/if}
                            {#if selected.size}<div><span class="text-[#7c7c7c]">Size</span><p class="text-white">{selected.size} employees</p></div>{/if}
                        </div>
                        {#if selected.tags?.length}
                            <div class="mt-3 flex flex-wrap gap-1.5">
                                {#each selected.tags as tag}
                                    <span class="px-2 py-0.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-xs text-[#888]">{tag}</span>
                                {/each}
                            </div>
                        {/if}
                        {#if selected.notes}<p class="text-xs text-[#8a8a8a] mt-3 border-t border-[#1a1a1a] pt-3">{selected.notes}</p>{/if}
                    </div>
                {/if}

                <!-- Linked contacts -->
                <div class="rounded-xl border border-[#2a2a2a] bg-[#111] hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
                    <div class="px-8 py-4 border-b border-[#1a1a1a] flex items-center justify-between">
                        <p class="text-sm text-white font-medium">People at {selected.name}</p>
                        <a href="/contacts?company_id={selected.id}" class="text-xs text-[#7c7c7c] hover:text-white transition-colors">View all →</a>
                    </div>
                    {#if !selected.contacts?.length}
                        <p class="px-4 py-4 text-xs text-[#6e6e6e]">No contacts linked yet — add a contact and link it to this company</p>
                    {:else}
                        {#each selected.contacts as contact}
                            <div class="flex items-center justify-between px-8 py-4 border-b border-[#111] last:border-0">
                                <div>
                                    <p class="text-xs text-white">{contact.name}</p>
                                    <p class="text-xs text-[#7c7c7c]">{contact.title ?? ''}{contact.title && contact.phone ? ' · ' : ''}{contact.phone ?? ''}</p>
                                </div>
                                <div class="flex gap-2">
                                    {#if contact.phone}
                                        <a href="/phone?number={contact.phone}" class="text-xs text-[var(--accent)] hover:text-[var(--accent-hi)] transition-colors">📞</a>
                                    {/if}
                                    <a href="/contacts/{contact.id}" class="text-xs text-[#6e6e6e] hover:text-white transition-colors">→</a>
                                </div>
                            </div>
                        {/each}
                    {/if}
                </div>
            {:else}
                <div class="flex items-center justify-center h-full">
                    <div class="text-center">
                        <p class="text-[#6e6e6e] text-sm">Select a company to view details</p>
                        <p class="text-xs text-[#333] mt-1">Or create a new one with the button above</p>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>
