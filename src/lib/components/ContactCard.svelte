<script lang="ts">
	import type { Contact } from '$lib/stores';
	import DialButtonRenderer from './DialButtonRenderer.svelte';

	let { contact, onDial, onSkip }: { contact: Contact; onDial: () => void; onSkip: () => void } = $props();
</script>

<div class="rounded-xl border border-[#2a2a2a] bg-[#111111] p-8">
	<!-- Contact info -->
	<div class="mb-4 text-center">
		<div class="flex items-center justify-center gap-2">
			<h2 class="text-2xl font-semibold text-white">{contact.name}</h2>
			{#if contact.contact_score}
				<span class="text-xs font-mono font-bold {contact.contact_score >= 70 ? 'text-[var(--call)]' : contact.contact_score >= 45 ? 'text-yellow-400' : 'text-[#555]'}"
					title="Lead score">
					{contact.contact_score}
				</span>
			{/if}
		</div>
		{#if contact.title}
			<p class="text-[#999] text-sm mt-1">{contact.title}</p>
		{/if}
		{#if contact.company}
			<p class="text-[#666] text-sm">{contact.company}</p>
		{/if}
	</div>

	<div class="mb-6 text-center">
		<p class="text-[#555] text-xs uppercase tracking-widest mb-1">Phone</p>
		<a
			href="/phone?number={encodeURIComponent(contact.phone)}"
			title="Open in Phone tab"
			class="text-white text-lg hover:text-[var(--call)] transition-colors"
			style="font-family: var(--font-mono)"
		>
			{contact.phone}
		</a>
	</div>

	{#if contact.tags && contact.tags.length > 0}
		<div class="flex flex-wrap gap-2 justify-center mb-6">
			{#each contact.tags as tag}
				<span
					class="px-2 py-1 rounded text-xs font-medium"
					style="background-color: {tag.color}20; color: {tag.color}; border: 1px solid {tag.color}40"
				>
					{tag.name}
				</span>
			{/each}
		</div>
	{/if}

	<!-- Dial button (elegant gallery skin) -->
	<div class="flex flex-col items-center gap-4 mt-2">
		<DialButtonRenderer callState="idle" onclick={onDial} size={140} />

		<p class="text-[10px] tracking-[0.3em] text-[#555] uppercase">Dial</p>

		<!-- Skip button — small, below the dial button -->
		<button
			onclick={onSkip}
			class="text-xs text-[#444] hover:text-[#888] transition-colors tracking-widest uppercase border border-[#222] hover:border-[#444] rounded px-6 py-1.5"
		>
			Skip →
		</button>
	</div>
</div>
