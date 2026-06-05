<script lang="ts">
	import type { Contact } from '$lib/stores';

	let { contact, onQuickNote, onQuickTask }: {
		contact: Contact;
		onQuickNote?: (id: string, name: string) => void;
		onQuickTask?: (id: string, name: string) => void;
	} = $props();

	function formatDate(iso?: string) {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString();
	}
</script>

<div class="group flex items-center gap-4 px-4 py-3 border-b border-[#1e1e1e] hover:bg-[#111111] transition-colors">
	<div class="flex-1 min-w-0">
		<a href="/contacts/{contact.id}" class="text-white text-sm font-medium hover:underline truncate block">
			{contact.name}
		</a>
		<div class="flex items-center gap-2">
			<p class="text-[#666] text-xs truncate">{contact.company || '—'}</p>
			{#if (contact as Record<string,unknown>).contact_type && (contact as Record<string,unknown>).contact_type !== 'lead'}
				<span class="text-xs text-[#444] capitalize">{(contact as Record<string,unknown>).contact_type as string}</span>
			{/if}
			{#if (contact as Record<string,unknown>).is_business}
				<span class="text-xs text-[var(--accent)]">B2B</span>
			{/if}
		</div>
	</div>

	<a href="/phone?number={encodeURIComponent(contact.phone)}" title="Click to call"
		class="text-[#888] text-xs shrink-0 hover:text-[var(--accent)] transition-colors"
		style="font-family: var(--font-mono)">
		{contact.phone}
	</a>

	<div class="flex gap-1 shrink-0 flex-wrap max-w-[180px]">
		{#each (contact.tags ?? []) as tag}
			<span class="px-2 py-0.5 rounded text-xs" style="background-color: {tag.color}20; color: {tag.color}">
				{tag.name}
			</span>
		{/each}
	</div>

	<div class="text-right shrink-0 min-w-[70px]">
		{#if (contact as Record<string,unknown>).contact_score}
			<p class="text-xs font-medium {((contact as Record<string,unknown>).contact_score as number) >= 70 ? 'text-[var(--accent)]' : ((contact as Record<string,unknown>).contact_score as number) >= 40 ? 'text-yellow-400' : 'text-[#555]'}">
				{(contact as Record<string,unknown>).contact_score as number}pts
			</p>
		{/if}
		<p class="text-xs text-[#666]">{contact.call_count} calls</p>
		<p class="text-xs text-[#444]">{formatDate(contact.last_called_at)}</p>
	</div>

	<!-- Hover quick-actions -->
	<div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2">
		{#if contact.phone}
			<a href="/phone?number={encodeURIComponent(contact.phone)}&contact={contact.id}"
				class="rounded-lg border border-[#2a2a2a] p-1.5 text-[#555] hover:text-white hover:border-white transition-colors"
				title="Call {contact.name}"
				onclick={(e) => e.stopPropagation()}>
				<span class="text-xs">📞</span>
			</a>
		{/if}
		<button
			onclick={(e) => { e.stopPropagation(); onQuickNote?.(contact.id, contact.name); }}
			class="rounded-lg border border-[#2a2a2a] p-1.5 text-[#555] hover:text-white hover:border-white transition-colors"
			title="Log note">
			<span class="text-xs">📝</span>
		</button>
		<button
			onclick={(e) => { e.stopPropagation(); onQuickTask?.(contact.id, contact.name); }}
			class="rounded-lg border border-[#2a2a2a] p-1.5 text-[#555] hover:text-white hover:border-white transition-colors"
			title="Add task">
			<span class="text-xs">✅</span>
		</button>
	</div>
</div>
