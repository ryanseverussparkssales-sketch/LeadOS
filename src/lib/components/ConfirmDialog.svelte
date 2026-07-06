<script lang="ts">
	let {
		open = $bindable(false),
		title,
		message = '',
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		danger = false,
		onConfirm,
		onCancel,
	}: {
		open?: boolean;
		title: string;
		message?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		danger?: boolean;
		onConfirm: () => void;
		onCancel?: () => void;
	} = $props();

	let confirmBtn = $state<HTMLButtonElement | null>(null);

	// Move focus to the confirm button whenever the dialog opens.
	$effect(() => {
		if (open && confirmBtn) {
			confirmBtn.focus();
		}
	});

	function cancel() {
		open = false;
		onCancel?.();
	}

	function confirm() {
		open = false;
		onConfirm();
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			cancel();
		} else if (e.key === 'Tab') {
			// Focus-trap-lite: keep focus within the two action buttons.
			e.preventDefault();
			confirmBtn?.focus();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<div
		class="cd-backdrop"
		onclick={cancel}
		role="presentation"
	>
		<div
			class="cd-panel"
			onclick={(e) => e.stopPropagation()}
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="cd-title"
			aria-describedby={message ? 'cd-message' : undefined}
		>
			<h2 class="cd-title" id="cd-title">{title}</h2>
			{#if message}
				<p class="cd-message" id="cd-message">{message}</p>
			{/if}

			<div class="cd-actions">
				<button type="button" class="cd-btn cd-cancel" onclick={cancel}>
					{cancelLabel}
				</button>
				<button
					type="button"
					class="cd-btn cd-confirm"
					class:cd-danger={danger}
					bind:this={confirmBtn}
					onclick={confirm}
				>
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.cd-backdrop {
		position: fixed;
		inset: 0;
		z-index: 10000;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.7);
		padding: 20px;
		animation: cd-fade 0.15s ease forwards;
	}
	.cd-panel {
		width: 100%;
		max-width: 420px;
		background: var(--c-card);
		border: 1px solid var(--c-border-subtle);
		border-radius: 12px;
		padding: 22px 24px 20px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
		animation: cd-rise 0.18s cubic-bezier(0.4, 0, 0.2, 1) forwards;
	}
	.cd-title {
		font-family: var(--font-display);
		font-size: var(--text-head);
		font-weight: 500;
		color: var(--c-text-primary);
		margin: 0 0 8px;
	}
	.cd-message {
		font-family: var(--font-ui);
		font-size: var(--text-body);
		line-height: 1.5;
		color: var(--c-text-secondary);
		margin: 0 0 20px;
	}
	.cd-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		margin-top: 4px;
	}
	.cd-btn {
		font-family: var(--font-ui);
		font-size: var(--text-body);
		font-weight: 600;
		padding: 8px 16px;
		border-radius: 8px;
		cursor: pointer;
		transition: background 0.15s, color 0.15s, border-color 0.15s;
	}
	.cd-cancel {
		background: transparent;
		border: 1px solid var(--c-border-subtle);
		color: var(--c-text-muted);
	}
	.cd-cancel:hover {
		color: var(--c-text-primary);
		border-color: var(--c-text-secondary);
	}
	.cd-confirm {
		background: var(--accent);
		border: 1px solid var(--accent);
		color: var(--accent-ink);
	}
	.cd-confirm:hover {
		background: var(--accent-hi);
		border-color: var(--accent-hi);
	}
	.cd-confirm.cd-danger {
		background: var(--end);
		border-color: var(--end);
		color: #fff;
	}
	.cd-confirm.cd-danger:hover {
		background: var(--end-hi);
		border-color: var(--end-hi);
	}
	@keyframes cd-fade {
		from { opacity: 0; }
		to { opacity: 1; }
	}
	@keyframes cd-rise {
		from { transform: translateY(8px) scale(0.98); opacity: 0; }
		to { transform: translateY(0) scale(1); opacity: 1; }
	}
</style>
