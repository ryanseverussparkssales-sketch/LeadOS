<script lang="ts">
	let connected = $state(false);
	// TODO: implement Spotify OAuth at /api/auth/spotify
	// Needs: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET in .env.local
	// Scopes: streaming, user-read-playback-state, user-modify-playback-state
</script>
<div class="h-full flex flex-col items-center justify-center space-y-3">
	{#if !connected}
		<div class="text-center space-y-2">
			<p class="text-2xl">🎵</p>
			<p class="text-xs text-[#555]">Play music while dialing</p>
			<a href="/api/auth/spotify?redirect=/dashboard"
				class="block rounded-lg border border-[#2a2a2a] px-4 py-2 text-xs text-[#999] hover:border-white hover:text-white transition-colors">
				Connect Spotify
			</a>
			<p class="text-xs text-[#333]">Requires SPOTIFY_CLIENT_ID in .env.local</p>
		</div>
	{:else}
		<p class="text-xs text-[#444]">Spotify connected</p>
	{/if}
</div>
