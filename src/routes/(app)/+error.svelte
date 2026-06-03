<script lang="ts">
	import { page } from '$app/stores';
</script>

<div class="flex flex-col flex-1 h-full items-center justify-center text-center p-8">
	<p class="text-4xl mb-4">⚠️</p>
	<h1 class="text-white text-xl font-semibold mb-2">Something went wrong</h1>
	<p class="text-[#555] text-sm mb-1">{$page.error?.message ?? 'An unexpected error occurred'}</p>
	<p class="text-[#333] text-xs mb-6">Status: {$page.status}</p>
	<div class="flex gap-3">
		<button onclick={() => window.location.reload()} class="rounded-lg bg-white px-5 py-2 text-xs font-semibold text-black hover:bg-[#e5e5e5]">Reload page</button>
		<a href="/dashboard" class="rounded-lg border border-[#2a2a2a] px-5 py-2 text-xs text-[#666] hover:text-white">Go to Dashboard</a>
	</div>
</div>
