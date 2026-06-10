<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';
	import { currentUser } from '$lib/stores';
	import { toastError } from '$lib/stores/toast';
	import Inbox from '$lib/components/Inbox.svelte';

	let clients = $state<{id:string;name:string}[]>([]);
	let teamMembers = $state<{id:string;member_email:string;member_user_id:string|null}[]>([]);

	onMount(async () => {
		try {
			const [cr, tr] = await Promise.all([apiFetch('/api/clients'), apiFetch('/api/team')]);
			clients = cr.ok ? await cr.json() : [];
			teamMembers = tr.ok ? await tr.json() : [];
		} catch (e) {
			toastError('Failed to load messaging data — try refreshing');
		}
	});
</script>

<svelte:head><title>Messaging — Edelhaus</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-hidden">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between shrink-0">
		<div>
			<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Team Messaging</h2>
			<p class="text-[10px] text-[#6e6e6e] mt-0.5">Channels between you, your clients, and your reps</p>
		</div>
	</div>
	<div class="flex-1 overflow-hidden">
		<Inbox
			currentUserRole="admin"
			currentUserName={$currentUser?.email ?? 'Admin'}
			showNewChannel={true}
			{clients}
			{teamMembers}
		/>
	</div>
</div>
