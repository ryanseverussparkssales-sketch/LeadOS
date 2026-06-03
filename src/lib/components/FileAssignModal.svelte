<script lang="ts">
    import { apiFetch } from '$lib/api';
    import { getSession } from '$lib/services/auth';
    import { onMount } from 'svelte';

    let { files, onclose, onsaved }: Props = $props();
  type Props = {
        files: File[];
        onclose: () => void;
        onsaved: (docs: any[]) => void;
    }

    const CATEGORIES = ['general','contract','proposal','invoice','report','presentation','data','other'];
    const KB_TYPES = ['general','talking_points','objections','product','pricing','custom'];

    // Shared assignment (applies to all files)
    let title = $state(files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') : '');
    let category = $state('general');
    let clientId = $state('');
    let projectId = $state('');
    let contactId = $state('');
    let saveAs = $state<'document' | 'knowledge_base'>('document');
    let kbType = $state('general');

    // Data
    let clients = $state<{id:string;name:string}[]>([]);
    let projects = $state<{id:string;name:string;client_id?:string}[]>([]);
    let contacts = $state<{id:string;name:string;company:string}[]>([]);

    let saving = $state(false);
    let progress = $state(0);
    let errorMsg = $state('');

    onMount(async () => {
        const [cr, pr, conR] = await Promise.all([
            apiFetch('/api/clients'),
            apiFetch('/api/projects'),
            apiFetch('/api/contacts/filtered?limit=50'),
        ]);
        clients = cr.ok ? (await cr.json()).map((c: any) => ({ id: c.id, name: c.name })) : [];
        projects = pr.ok ? (await pr.json()).map((p: any) => ({ id: p.id, name: p.name, client_id: p.client_id })) : [];
        if (conR.ok) {
            const d = await conR.json();
            contacts = (d.data ?? d ?? []).map((c: any) => ({ id: c.id, name: c.name, company: c.company ?? '' }));
        }
    });

    const filteredProjects = $derived(
        clientId ? projects.filter((p) => p.client_id === clientId) : projects
    );

    function fileIcon(file: File) {
        if (file.type.startsWith('image/')) return '🖼';
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) return '📄';
        if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) return '📝';
        if (file.name.endsWith('.csv')) return '🗃';
        return '📁';
    }

    function fmtSize(bytes: number) {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1048576) return `${(bytes/1024).toFixed(0)}KB`;
        return `${(bytes/1048576).toFixed(1)}MB`;
    }

    async function save() {
        saving = true; errorMsg = ''; progress = 0;
        const session = await getSession();
        const token = session?.access_token ?? '';

        const saved = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fd = new FormData();
            fd.append('file', file);
            fd.append('name', files.length === 1 && title ? title : file.name.replace(/\.[^.]+$/, ''));
            fd.append('category', category);
            fd.append('knowledge_base', String(saveAs === 'knowledge_base'));
            fd.append('kb_type', kbType);
            if (clientId) fd.append('client_id', clientId);
            if (projectId) fd.append('project_id', projectId);
            if (contactId) fd.append('contact_id', contactId);

            try {
                const res = await fetch('/api/documents/upload', {
                    method: 'POST',
                    body: fd,
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) saved.push(await res.json());
                else errorMsg = `Upload failed for ${file.name}`;
            } catch (e) { errorMsg = String(e); }
            progress = Math.round(((i + 1) / files.length) * 100);
        }

        saving = false;
        if (saved.length) onsaved(saved);
    }
</script>

<!-- Modal backdrop -->
<div class="modal-backdrop" onclick={onclose} role="dialog" aria-modal="true" aria-label="Assign documents">
    <div class="modal-card" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
            <h3 class="modal-title">{files.length === 1 ? 'Assign Document' : `Assign ${files.length} Documents`}</h3>
            <button onclick={onclose} class="close-btn" aria-label="Close">✕</button>
        </div>

        <!-- File list preview -->
        <div class="file-list">
            {#each files as f}
                <div class="file-row">
                    <span class="file-icon">{fileIcon(f)}</span>
                    <span class="file-name">{f.name}</span>
                    <span class="file-size">{fmtSize(f.size)}</span>
                </div>
            {/each}
        </div>

        <!-- Assignment form -->
        <div class="form-grid">
            {#if files.length === 1}
                <div class="form-group full">
                    <label>Title</label>
                    <input bind:value={title} placeholder="Document title" class="form-input" />
                </div>
            {/if}

            <!-- Save as: Document or Knowledge Base -->
            <div class="form-group full">
                <label>Save as</label>
                <div class="toggle-row">
                    <button class="toggle-btn {saveAs === 'document' ? 'active' : ''}" onclick={() => saveAs = 'document'}>
                        📁 Document
                    </button>
                    <button class="toggle-btn {saveAs === 'knowledge_base' ? 'active' : ''}" onclick={() => saveAs = 'knowledge_base'}>
                        🧠 Knowledge Base
                    </button>
                </div>
            </div>

            {#if saveAs === 'document'}
                <div class="form-group">
                    <label>Type</label>
                    <select bind:value={category} class="form-select">
                        {#each CATEGORIES as c}<option value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>{/each}
                    </select>
                </div>
            {:else}
                <div class="form-group">
                    <label>Knowledge Type</label>
                    <select bind:value={kbType} class="form-select">
                        {#each KB_TYPES as t}<option value={t}>{t.replace('_', ' ')}</option>{/each}
                    </select>
                </div>
            {/if}

            <div class="form-group">
                <label>Client</label>
                <select bind:value={clientId} class="form-select">
                    <option value="">— None —</option>
                    {#each clients as c}<option value={c.id}>{c.name}</option>{/each}
                </select>
            </div>

            {#if clientId && saveAs === 'document'}
                <div class="form-group">
                    <label>Project</label>
                    <select bind:value={projectId} class="form-select">
                        <option value="">— None —</option>
                        {#each filteredProjects as p}<option value={p.id}>{p.name}</option>{/each}
                    </select>
                </div>
            {/if}

            {#if saveAs === 'document'}
                <div class="form-group">
                    <label>Link to Contact (optional)</label>
                    <select bind:value={contactId} class="form-select">
                        <option value="">— None —</option>
                        {#each contacts as c}
                            <option value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>
                        {/each}
                    </select>
                </div>
            {/if}
        </div>

        {#if errorMsg}<p class="error-msg">{errorMsg}</p>{/if}

        {#if saving}
            <div class="progress-bar"><div class="progress-fill" style="width:{progress}%"></div></div>
            <p class="progress-label">Uploading {progress}%...</p>
        {/if}

        <div class="modal-footer">
            <button onclick={onclose} class="btn-cancel">Cancel</button>
            <button onclick={save} disabled={saving || (!clientId && saveAs === 'knowledge_base')}
                class="btn-save">
                {saving ? 'Saving...' : saveAs === 'knowledge_base' ? 'Add to Knowledge Base' : `Save ${files.length > 1 ? files.length + ' Files' : 'File'}`}
            </button>
        </div>
    </div>
</div>

<style>
.modal-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.7);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000; padding: 16px;
}
.modal-card {
    background: #0d0d0d; border: 1px solid #2a2a2a; border-radius: 12px;
    width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto;
    display: flex; flex-direction: column; gap: 0;
}
.modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; border-bottom: 1px solid #1e1e1e;
}
.modal-title { font-size: 14px; font-weight: 500; color: #fff; }
.close-btn { font-size: 12px; color: #555; background: none; border: none; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
.close-btn:hover { color: #ccc; background: #1a1a1a; }
.file-list { padding: 12px 20px; border-bottom: 1px solid #1e1e1e; display: flex; flex-direction: column; gap: 6px; max-height: 140px; overflow-y: auto; }
.file-row { display: flex; align-items: center; gap: 8px; }
.file-icon { font-size: 16px; }
.file-name { font-size: 12px; color: #ccc; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-size { font-size: 10px; color: #555; flex-shrink: 0; }
.form-grid { padding: 16px 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-group { display: flex; flex-direction: column; gap: 5px; }
.form-group.full { grid-column: span 2; }
label { font-size: 10px; color: #555; letter-spacing: 1px; text-transform: uppercase; }
.form-input, .form-select {
    background: #111; border: 1px solid #2a2a2a; border-radius: 6px;
    padding: 7px 10px; font-size: 12px; color: #ccc; outline: none;
    transition: border-color 0.15s;
}
.form-input:focus, .form-select:focus { border-color: #555; }
.toggle-row { display: flex; gap: 6px; }
.toggle-btn {
    flex: 1; padding: 7px 10px; font-size: 11px; border: 1px solid #2a2a2a;
    background: #111; color: #777; border-radius: 6px; cursor: pointer; transition: all 0.15s;
}
.toggle-btn.active { border-color: #fff; color: #fff; background: #1a1a1a; }
.modal-footer { padding: 14px 20px; border-top: 1px solid #1e1e1e; display: flex; justify-content: flex-end; gap: 8px; }
.btn-cancel { font-size: 12px; color: #555; background: none; border: 1px solid #2a2a2a; padding: 7px 16px; border-radius: 6px; cursor: pointer; }
.btn-cancel:hover { border-color: #555; color: #ccc; }
.btn-save { font-size: 12px; background: #fff; color: #000; border: none; padding: 7px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.btn-save:disabled { opacity: 0.4; cursor: not-allowed; }
.error-msg { padding: 0 20px; font-size: 11px; color: #ef4444; }
.progress-bar { margin: 0 20px; height: 3px; background: #1e1e1e; border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; background: #fff; border-radius: 2px; transition: width 0.3s ease; }
.progress-label { padding: 4px 20px; font-size: 10px; color: #555; text-align: center; }
</style>
