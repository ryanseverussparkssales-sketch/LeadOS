<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		error = '',
		hint = '',
		required = false,
		id = '',
		children,
	}: {
		label: string;
		error?: string;
		hint?: string;
		required?: boolean;
		id?: string;
		children?: Snippet<[{ id: string; describedBy: string | undefined }]>;
	} = $props();

	// Stable auto-generated id when none supplied.
	const fieldId = $derived(id || `ff-${Math.random().toString(36).slice(2, 9)}`);
	const msgId = $derived(`${fieldId}-msg`);
	// Only advertise describedby when there is a message to point at.
	const describedBy = $derived(error || hint ? msgId : undefined);
</script>

<div class="ff">
	<label class="ff-label" for={fieldId}>
		{label}{#if required}<span class="ff-req" aria-hidden="true">*</span>{/if}
	</label>

	{@render children?.({ id: fieldId, describedBy })}

	{#if error}
		<p class="ff-error" id={msgId} role="alert">{error}</p>
	{:else if hint}
		<p class="ff-hint" id={msgId}>{hint}</p>
	{/if}
</div>

<style>
	.ff {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.ff-label {
		font-family: var(--font-ui);
		font-size: var(--text-meta);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--c-text-secondary);
	}
	.ff-req {
		color: var(--accent);
		margin-left: 2px;
		font-weight: 700;
	}
	.ff-error {
		font-family: var(--font-ui);
		font-size: var(--text-meta);
		line-height: 1.4;
		color: var(--end-text);
		margin: 0;
	}
	.ff-hint {
		font-family: var(--font-ui);
		font-size: var(--text-meta);
		line-height: 1.4;
		color: var(--c-text-muted);
		margin: 0;
	}
</style>
