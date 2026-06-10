<script lang="ts">
	import type { Contact } from '$lib/stores';

	let { contact, onQuickNote, onQuickTask, columns = ['phone', 'tags', 'calls'] }: {
		contact: Contact;
		onQuickNote?: (id: string, name: string) => void;
		onQuickTask?: (id: string, name: string) => void;
		columns?: string[];
	} = $props();

	const show = $derived(new Set(columns));

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
			<p class="text-[#8a8a8a] text-xs truncate">{contact.company || '—'}</p>
			{#if (contact as Record<string,unknown>).contact_type && (contact as Record<string,unknown>).contact_type !== 'lead'}
				<span class="text-xs text-[#6e6e6e] capitalize">{(contact as Record<string,unknown>).contact_type as string}</span>
			{/if}
			{#if (contact as Record<string,unknown>).is_business}
				<span class="text-xs text-[var(--accent)]">B2B</span>
			{/if}
		</div>
	</div>

	{#if show.has('phone')}
		<a href="/phone?number={encodeURIComponent(contact.phone)}" title="Click to call"
			class="text-[#888] text-xs shrink-0 hover:text-[var(--accent)] transition-colors"
			style="font-family: var(--font-mono)">
			{contact.phone}
		</a>
	{/if}

	{#if show.has('email')}
		<a href="mailto:{contact.email}" class="text-[#888] text-xs shrink-0 max-w-[180px] truncate hover:text-blue-400 transition-colors">
			{contact.email || '—'}
		</a>
	{/if}

	{#if show.has('title')}
		<span class="text-[#888] text-xs shrink-0 max-w-[140px] truncate">{contact.title || '—'}</span>
	{/if}

	{#if show.has('status')}
		<span class="text-xs shrink-0 capitalize {contact.status === 'active' ? 'text-[var(--accent)]' : 'text-[#888]'}">{contact.status || '—'}</span>
	{/if}

	{#if show.has('lead_source')}
		<span class="text-[#888] text-xs shrink-0 max-w-[120px] truncate capitalize">{((contact as Record<string,unknown>).lead_source as string)?.replace(/_/g,' ') || '—'}</span>
	{/if}

	{#if show.has('tags')}
		<div class="flex gap-1 shrink-0 flex-wrap max-w-[180px]">
			{#each (contact.tags ?? []) as tag}
				<span class="px-2 py-0.5 rounded text-xs" style="background-color: {tag.color}20; color: {tag.color}">
					{tag.name}
				</span>
			{/each}
		</div>
	{/if}

	{#if show.has('calls')}
	<div class="text-right shrink-0 min-w-[70px]">
		{#if (contact as Record<string,unknown>).contact_score}
			<p class="text-xs font-medium {((contact as Record<string,unknown>).contact_score as number) >= 70 ? 'text-[var(--accent)]' : ((contact as Record<string,unknown>).contact_score as number) >= 40 ? 'text-yellow-400' : 'text-[#7c7c7c]'}">
				{(contact as Record<string,unknown>).contact_score as number}pts
			</p>
		{/if}
		<p class="text-xs text-[#8a8a8a]">{contact.call_count} calls</p>
		<p class="text-xs text-[#6e6e6e]">{formatDate(contact.last_called_at)}</p>
	</div>
	{/if}

	<!-- Hover quick-actions -->
	<div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2">
		{#if contact.phone}
			<a href="/phone?number={encodeURIComponent(contact.phone)}&contact={contact.id}"
				class="rounded-lg border border-[#2a2a2a] p-1.5 text-[#7c7c7c] hover:text-white hover:border-white transition-colors"
				title="Call {contact.name}"
				onclick={(e) => e.stopPropagation()}>
				<span class="text-xs">📞</span>
			</a>
		{/if}
		<button
			onclick={(e) => { e.stopPropagation(); onQuickNote?.(contact.id, contact.name); }}
			class="rounded-lg border border-[#2a2a2a] p-1.5 text-[#7c7c7c] hover:text-white hover:border-white transition-colors"
			title="Log note">
			<span class="text-xs">📝</span>
		</button>
		<button
			onclick={(e) => { e.stopPropagation(); onQuickTask?.(contact.id, contact.name); }}
			class="rounded-lg border border-[#2a2a2a] p-1.5 text-[#7c7c7c] hover:text-white hover:border-white transition-colors"
			title="Add task">
			<span class="text-xs">✅</span>
		</button>
	</div>
</div>
