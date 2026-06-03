<script lang="ts">
	import { apiFetch } from '$lib/api';
	import { onMount } from 'svelte';
	// Redirect to the existing AI assistant widget page
	import { goto } from '$app/navigation';
	onMount(() => goto('/dashboard'));
</script>
