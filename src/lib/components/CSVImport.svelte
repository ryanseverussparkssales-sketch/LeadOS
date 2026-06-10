<script lang="ts">
	import { apiFetch } from '$lib/api';

	let { callListId = '', onImportDone = undefined }: {
		callListId?: string;
		onImportDone?: () => void;
	} = $props();

	let dragOver = $state(false);
	let preview = $state<string[][]>([]);
	let headers = $state<string[]>([]);
	let fileContent = $state('');
	let importing = $state(false);
	let result = $state<{ created: number; duplicates: number; errors: number } | null>(null);

	function parseCSV(text: string): string[][] {
		return text.trim().split('\n').map(row =>
			row.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))
		);
	}

	function handleFile(file: File) {
		result = null;
		const reader = new FileReader();
		reader.onload = (e) => {
			const text = e.target?.result as string;
			fileContent = text;
			const rows = parseCSV(text);
			headers = rows[0] ?? [];
			preview = rows.slice(1, 6);
		};
		reader.readAsText(file);
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const file = e.dataTransfer?.files[0];
		if (file?.name.endsWith('.csv')) handleFile(file);
	}

	function handleInput(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) handleFile(file);
	}

	async function handleImport() {
		if (!fileContent) return;
		importing = true;
		result = null;
		try {
			const res = await apiFetch('/api/contacts', {
				method: 'POST',
				body: JSON.stringify({
					csv: fileContent,
					call_list_id: callListId || undefined,
				}),
			});
			const data = await res.json();
			result = { created: data.created, duplicates: data.duplicates, errors: data.errors };
			if (onImportDone) onImportDone();
		} catch {
			result = { created: 0, duplicates: 0, errors: 1 };
		} finally {
			importing = false;
			fileContent = '';
			preview = [];
			headers = [];
		}
	}
</script>

<div class="space-y-4">
	{#if callListId}
		<p class="text-xs text-[#7c7c7c]">Contacts will be imported and automatically added to this call list.</p>
	{/if}

	<div
		role="button"
		tabindex="0"
		class="rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer {dragOver ? 'border-white bg-white/5' : 'border-[#2a2a2a] hover:border-[#444]'}"
		ondragover={(e) => { e.preventDefault(); dragOver = true; }}
		ondragleave={() => { dragOver = false; }}
		ondrop={handleDrop}
		onclick={() => document.getElementById('csv-input')?.click()}
		onkeydown={(e) => e.key === 'Enter' && document.getElementById('csv-input')?.click()}
	>
		<p class="text-[#8a8a8a] text-sm mb-1">Drag & drop a CSV or click to browse</p>
		<p class="text-[#6e6e6e] text-xs">Required columns: name, phone — Optional: email, company, title</p>
		<input id="csv-input" type="file" accept=".csv" class="hidden" onchange={handleInput} />
	</div>

	{#if preview.length > 0}
		<div>
			<p class="text-xs text-[#999] uppercase tracking-widest mb-2">Preview (first 5 rows)</p>
			<div class="overflow-x-auto rounded-lg border border-[#2a2a2a]">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-[#2a2a2a]">
							{#each headers as h}
								<th class="px-3 py-2 text-left text-xs text-[#8a8a8a] font-medium">{h}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each preview as row}
							<tr class="border-b border-[#1e1e1e] last:border-0">
								{#each row as cell}
									<td class="px-3 py-2 text-[#ccc] text-xs">{cell}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<button onclick={handleImport} disabled={importing}
			class="w-full rounded-lg bg-white py-3 text-sm font-semibold text-black hover:bg-[#e5e5e5] disabled:opacity-50 transition-colors">
			{importing ? 'Importing...' : callListId ? 'Import & Add to List' : 'Import Contacts'}
		</button>
	{/if}

	{#if result}
		<div class="rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] p-4 text-sm space-y-1">
			<p class="text-[var(--accent)]">✓ {result.created} contacts imported{callListId ? ' and added to list' : ''}</p>
			{#if result.duplicates > 0}<p class="text-[#8a8a8a]">{result.duplicates} duplicates skipped</p>{/if}
			{#if result.errors > 0}<p class="text-red-400">{result.errors} errors</p>{/if}
		</div>
	{/if}
</div>
