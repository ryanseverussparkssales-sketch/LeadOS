<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';

	interface AppError {
		id: string;
		type: 'network' | 'auth' | 'twilio' | 'api' | 'unknown';
		message: string;
		action?: { label: string; fn: () => void };
		dismissible: boolean;
		createdAt: number;
	}

	let errors = $state<AppError[]>([]);

	// Listen for global error events
	onMount(() => {
		const handler = (e: CustomEvent) => {
			const err = e.detail as Omit<AppError, 'id' | 'createdAt'>;
			const id = Date.now().toString();
			errors = [...errors, { ...err, id, createdAt: Date.now() }];

			// Auto-dismiss non-auth errors after 8 seconds
			if (err.type !== 'auth') {
				setTimeout(() => dismiss(id), 8000);
			}
		};

		window.addEventListener('leados:error', handler as EventListener);

		// Catch unhandled promise rejections
		const rejectionHandler = (e: PromiseRejectionEvent) => {
			// Only treat genuine network failures as a connection issue. A broad
			// `name === 'TypeError'` check would mislabel real code bugs as network
			// errors AND collide with ErrorBoundary's toast for the same rejection.
			const m: string = e.reason?.message ?? '';
			if (m.includes('Failed to fetch') || m.includes('NetworkError') || m.includes('Load failed')) {
				window.dispatchEvent(new CustomEvent('leados:error', {
					detail: {
						type: 'network',
						message: 'Connection issue — check your internet',
						dismissible: true,
					}
				}));
				e.preventDefault();
			}
		};

		window.addEventListener('unhandledrejection', rejectionHandler);
		return () => {
			window.removeEventListener('leados:error', handler as EventListener);
			window.removeEventListener('unhandledrejection', rejectionHandler);
		};
	});

	function dismiss(id: string) {
		errors = errors.filter(e => e.id !== id);
	}

	const icons: Record<string, string> = {
		network: '📡',
		auth: '🔑',
		twilio: '📞',
		api: '⚠️',
		unknown: '⚠️',
	};
</script>

{#each errors as err (err.id)}
	<div class="flex items-center justify-between px-4 py-2.5 border-b text-xs
		{err.type === 'auth' ? 'bg-red-950/50 border-red-900/50 text-red-300' :
		 err.type === 'twilio' ? 'bg-yellow-950/30 border-yellow-900/30 text-yellow-300' :
		 'bg-[#1a1a1a] border-[#2a2a2a] text-[#888]'}">
		<div class="flex items-center gap-2">
			<span>{icons[err.type]}</span>
			<span>{err.message}</span>
			{#if err.action}
				<button onclick={err.action.fn}
					class="ml-2 underline hover:no-underline opacity-80 hover:opacity-100">
					{err.action.label}
				</button>
			{/if}
		</div>
		{#if err.dismissible}
			<button onclick={() => dismiss(err.id)} class="ml-4 opacity-50 hover:opacity-100"><Icon name="x" size={14} /></button>
		{/if}
	</div>
{/each}
