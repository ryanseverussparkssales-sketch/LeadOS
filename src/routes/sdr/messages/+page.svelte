<script lang="ts">
	import { onMount } from 'svelte';
	import { getSession } from '$lib/services/auth';
	import Inbox from '$lib/components/Inbox.svelte';

	let userName = $state('');

	onMount(async () => {
		const session = await getSession();
		userName = session?.user.email?.split('@')[0] ?? 'SDR';
	});
</script>

<svelte:head><title>Messages — RogueOS SDR</title></svelte:head>

<div class="flex-1 overflow-hidden">
	<Inbox currentUserRole="sdr" currentUserName={userName} showNewChannel={false} />
</div>
