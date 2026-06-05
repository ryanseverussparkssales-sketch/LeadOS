<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { apiFetch } from '$lib/api';
	import { spotifyState, useSpotify } from '$lib/stores/spotify';

	// Local state (fine-grained, not in shared store)
	let progressMs = $state(0);
	let durationMs = $state(1);
	let volume = $state(70);
	let loading = $state(false);
	let seeking = $state(false);

	// Derive from shared store
	$effect(() => {
		if ($spotifyState.progress_ms !== undefined) {
			progressMs = $spotifyState.progress_ms;
			durationMs = $spotifyState.duration_ms;
		}
	});

	let unsubSpotify: (() => void) | null = null;

	// Playlist state
	interface Playlist { id: string; name: string; uri: string; tracks: number; image: string | null; owner: string; }
	let playlists = $state<Playlist[]>([]);
	let showPlaylists = $state(false);
	let loadingPlaylists = $state(false);
	let playlistsLoaded = $state(false);

	let progressInterval: ReturnType<typeof setInterval>;

	// Derived
	const progressPct = $derived(durationMs > 0 ? (progressMs / durationMs) * 100 : 0);

	function fmtMs(ms: number) {
		const s = Math.floor(ms / 1000);
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}

	async function control(action: string, value?: number) {
		if (loading) return;
		loading = true;
		// Optimistic UI
		if (action === 'play') spotifyState.update(s => ({ ...s, playing: true }));
		if (action === 'pause') spotifyState.update(s => ({ ...s, playing: false }));
		await apiFetch('/api/spotify/control', { method: 'POST', body: JSON.stringify({ action, value }) });
		loading = false;
	}

	async function seek(e: Event) {
		const input = e.target as HTMLInputElement;
		const pct = parseFloat(input.value);
		const posMs = (pct / 100) * durationMs;
		progressMs = posMs;
		seeking = false;
		await control('seek', posMs);
	}

	async function setVolume(e: Event) {
		const input = e.target as HTMLInputElement;
		volume = parseInt(input.value);
		await control('volume', volume);
	}

	async function loadPlaylists() {
		if (playlistsLoaded) { showPlaylists = !showPlaylists; return; }
		loadingPlaylists = true;
		showPlaylists = true;
		const r = await apiFetch('/api/spotify/playlists');
		if (r.ok) {
			const d = await r.json();
			playlists = d.playlists ?? [];
			playlistsLoaded = true;
		}
		loadingPlaylists = false;
	}

	async function playPlaylist(uri: string) {
		showPlaylists = false;
		await apiFetch('/api/spotify/control', {
			method: 'POST',
			body: JSON.stringify({ action: 'context', contextUri: uri }),
		});
	}

	onMount(async () => {
		unsubSpotify = useSpotify();
		progressInterval = setInterval(() => {
			if ($spotifyState.playing && !seeking) progressMs = Math.min(progressMs + 1000, durationMs);
		}, 1000);
	});

	onDestroy(() => {
		unsubSpotify?.();
		clearInterval(progressInterval);
	});

	// Long track name check
	const isLong = $derived(($spotifyState.track?.name?.length ?? 0) > 20);

	let connectingSpotify = $state(false);

	async function connectSpotify() {
		if (connectingSpotify) return;
		connectingSpotify = true;
		try {
			const r = await apiFetch('/api/spotify/auth');
			if (r.ok) {
				const data = await r.json();
				if (data.url) {
					window.location.href = data.url;
				} else {
					console.error('No URL returned from Spotify auth');
				}
			} else {
				const err = await r.json().catch(() => ({}));
				console.error('Spotify auth error:', err);
			}
		} catch (e) {
			console.error('Spotify connect failed:', e);
		} finally {
			connectingSpotify = false;
		}
	}
</script>

<div class="sm-root">
	<!-- Corner bracket decorations -->
	<div class="corner tl"></div>
	<div class="corner tr"></div>
	<div class="corner bl"></div>
	<div class="corner br"></div>

	<!-- Scan-line overlay -->
	<div class="scanlines" aria-hidden="true"></div>

	{#if !$spotifyState.connected}
		<!-- Not connected state -->
		<div class="not-connected">
			<span class="nc-icon">🎵</span>
			<button onclick={connectSpotify} disabled={connectingSpotify} class="nc-link">
			{connectingSpotify ? 'Opening...' : 'Connect Spotify →'}
		</button>
		</div>
	{:else}
		<!-- Row 1: main controls -->
		<div class="row-main">
			<!-- Album art -->
			<div class="art-wrap">
				{#if $spotifyState.track?.image}
					<img src={$spotifyState.track.image} alt="Album art" class="art-img" />
				{:else}
					<div class="art-placeholder">♪</div>
				{/if}
			</div>

			<!-- Track info -->
			<div class="track-info">
				<div class="track-name-wrap">
					{#if isLong}
						<div class="marquee-clip">
							<span class="marquee-text">{$spotifyState.track?.name ?? '—'}</span>
						</div>
					{:else}
						<span class="track-name">{$spotifyState.track?.name ?? '—'}</span>
					{/if}
				</div>
				<span class="track-artist">{$spotifyState.track?.artist ?? '—'}</span>
			</div>

			<!-- BPM badge -->
			{#if $spotifyState.bpm > 0}
				<div class="bpm-badge">{Math.round($spotifyState.bpm)} BPM</div>
			{/if}

			<!-- Playback controls -->
			<div class="ctrl-group" class:ctrl-loading={loading}>
				<button
					class="ctrl-btn"
					onclick={() => control('previous')}
					disabled={loading}
					aria-label="Previous">⏮</button>
				<button
					class="ctrl-btn play-btn"
					onclick={() => control($spotifyState.playing ? 'pause' : 'play')}
					disabled={loading}
					aria-label={$spotifyState.playing ? 'Pause' : 'Play'}>
					{$spotifyState.playing ? '⏸' : '▶'}
				</button>
				<button
					class="ctrl-btn"
					onclick={() => control('next')}
					disabled={loading}
					aria-label="Next">⏭</button>
				<!-- Playlist button -->
				<button onclick={loadPlaylists} class="ctrl-small" title="Choose playlist" aria-label="Playlists">
					{loadingPlaylists ? '...' : '♫'}
				</button>
			</div>

			<!-- Volume -->
			<div class="vol-group">
				<span class="vol-icon">🔈</span>
				<input
					type="range"
					min="0"
					max="100"
					value={volume}
					onchange={setVolume}
					class="vol-slider"
					aria-label="Volume" />
			</div>
		</div>

		<!-- Playlist panel (anchored to ctrl-group via relative wrapper) -->
		{#if showPlaylists}
			<div class="playlist-panel">
				<div class="playlist-header">
					<span class="playlist-title">YOUR PLAYLISTS</span>
					<button onclick={() => showPlaylists = false} class="playlist-close"><Icon name="x" size={14} /></button>
				</div>
				{#if loadingPlaylists}
					<div class="playlist-loading">Loading...</div>
				{:else if playlists.length === 0}
					<div class="playlist-empty">No playlists found</div>
				{:else}
					<div class="playlist-list">
						{#each playlists as pl}
							<button onclick={() => playPlaylist(pl.uri)} class="playlist-item" title="{pl.tracks} tracks">
								{#if pl.image}
									<img src={pl.image} alt={pl.name} class="playlist-img" />
								{:else}
									<div class="playlist-img-placeholder">♫</div>
								{/if}
								<div class="playlist-info">
									<p class="playlist-name">{pl.name}</p>
									<p class="playlist-meta">{pl.tracks} tracks · {pl.owner}</p>
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Row 2: progress bar -->
		<div class="row-progress">
			<span class="prog-time">{fmtMs(progressMs)}</span>
			<input
				type="range"
				min="0"
				max="100"
				value={progressPct}
				onmousedown={() => seeking = true}
				onchange={seek}
				class="prog-slider"
				aria-label="Seek" />
			<span class="prog-time">{fmtMs(durationMs)}</span>
		</div>
	{/if}
</div>

<style>

	/* Root */
	.sm-root {
		position: relative;
		background: #020a04;
		border: 1px solid #1db954;
		border-radius: 6px;
		padding: 8px 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-family: 'Share Tech Mono', monospace;
		overflow: visible;
		box-sizing: border-box;
		min-height: 80px;
	}

	/* Scan lines */
	.scanlines {
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(
			0deg,
			transparent,
			transparent 2px,
			rgba(0, 0, 0, 0.07) 2px,
			rgba(0, 0, 0, 0.07) 4px
		);
		pointer-events: none;
		z-index: 0;
	}

	/* Corner brackets */
	.corner {
		position: absolute;
		width: 8px;
		height: 8px;
		border-color: #1db954;
		border-style: solid;
		z-index: 2;
	}
	.corner.tl { top: 3px; left: 3px; border-width: 1px 0 0 1px; }
	.corner.tr { top: 3px; right: 3px; border-width: 1px 1px 0 0; }
	.corner.bl { bottom: 3px; left: 3px; border-width: 0 0 1px 1px; }
	.corner.br { bottom: 3px; right: 3px; border-width: 0 1px 1px 0; }

	/* All child content above overlays */
	.sm-root > *:not(.scanlines):not(.corner) {
		position: relative;
		z-index: 1;
	}

	/* Not connected */
	.not-connected {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 10px 0;
	}
	.nc-icon { font-size: 16px; }
	.nc-link {
		font-size: 10px;
		letter-spacing: 1px;
		color: #1db954;
		text-decoration: none;
		border-bottom: 1px solid #1db954;
		transition: text-shadow 0.2s;
	}
	.nc-link:hover { text-shadow: 0 0 8px #1db954; }

	/* Row 1 */
	.row-main {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	/* Album art */
	.art-wrap {
		flex-shrink: 0;
		width: 40px;
		height: 40px;
	}
	.art-img {
		width: 40px;
		height: 40px;
		border-radius: 4px;
		border: 1px solid #1db954;
		object-fit: cover;
		box-shadow: 0 0 8px #1db95440;
	}
	.art-placeholder {
		width: 40px;
		height: 40px;
		border-radius: 4px;
		border: 1px solid #1db954;
		background: #011a0a;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 18px;
		color: #1db954;
		box-shadow: 0 0 8px #1db95440;
	}

	/* Track info */
	.track-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.track-name-wrap {
		overflow: hidden;
		white-space: nowrap;
	}
	.track-name {
		font-size: 11px;
		font-weight: bold;
		color: #ffffff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: block;
		text-shadow: 0 0 6px #1db95488;
	}

	/* Marquee for long names */
	.marquee-clip {
		overflow: hidden;
		width: 100%;
	}
	.marquee-text {
		display: inline-block;
		font-size: 11px;
		font-weight: bold;
		color: #ffffff;
		text-shadow: 0 0 6px #1db95488;
		animation: marquee 8s linear infinite;
		white-space: nowrap;
		padding-right: 24px;
	}
	@keyframes marquee {
		0%   { transform: translateX(0); }
		100% { transform: translateX(-50%); }
	}

	.track-artist {
		font-size: 9px;
		color: #1db954;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* BPM badge */
	.bpm-badge {
		flex-shrink: 0;
		font-size: 8px;
		letter-spacing: 1px;
		color: #1db954;
		border: 1px solid #1db954;
		padding: 2px 5px;
		border-radius: 10px;
		box-shadow: 0 0 5px #1db95455;
		animation: bpm-pulse 1s ease infinite;
	}
	@keyframes bpm-pulse { 0%,100%{opacity:1} 50%{opacity:0.55} }

	/* Controls */
	.ctrl-group {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
		position: relative;
	}
	.ctrl-loading .ctrl-btn { opacity: 0.5; }

	.ctrl-btn {
		background: none;
		border: 1px solid #1db954;
		color: #1db954;
		font-size: 12px;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: box-shadow 0.15s, background 0.15s;
		padding: 0;
		line-height: 1;
	}
	.ctrl-btn:hover:not(:disabled) {
		background: #1db95420;
		box-shadow: 0 0 10px #1db954aa;
	}
	.ctrl-btn:disabled { cursor: not-allowed; }
	.play-btn {
		width: 32px;
		height: 32px;
		font-size: 13px;
	}

	/* Playlist toggle button */
	.ctrl-small {
		font-size: 14px;
		padding: 3px 7px;
		border: 1px solid #1db95430;
		color: #1db954;
		background: none;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s;
		line-height: 1;
	}
	.ctrl-small:hover { background: #1db95420; border-color: #1db954; }

	/* Playlist panel */
	.playlist-panel {
		position: absolute;
		bottom: calc(100% + 6px);
		right: 0;
		width: 280px;
		max-height: 320px;
		background: #0a1a0c;
		border: 1px solid #1db954;
		border-radius: 8px;
		overflow: hidden;
		z-index: 50;
		box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.6);
		display: flex;
		flex-direction: column;
	}
	.playlist-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		border-bottom: 1px solid #1db95430;
		flex-shrink: 0;
	}
	.playlist-title {
		font-size: 9px;
		font-weight: 600;
		color: #1db954;
		letter-spacing: 1.5px;
	}
	.playlist-close {
		font-size: 11px;
		color: #555;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0 2px;
		line-height: 1;
	}
	.playlist-close:hover { color: #ccc; }
	.playlist-loading, .playlist-empty {
		padding: 20px;
		text-align: center;
		font-size: 11px;
		color: #555;
	}
	.playlist-list {
		overflow-y: auto;
		flex: 1;
	}
	.playlist-list::-webkit-scrollbar { width: 4px; }
	.playlist-list::-webkit-scrollbar-track { background: transparent; }
	.playlist-list::-webkit-scrollbar-thumb { background: #1db95440; border-radius: 2px; }
	.playlist-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 7px 12px;
		background: none;
		border: none;
		border-bottom: 1px solid #1a2a1c;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s;
	}
	.playlist-item:last-child { border-bottom: none; }
	.playlist-item:hover { background: #1a2a1c; }
	.playlist-img {
		width: 36px;
		height: 36px;
		border-radius: 3px;
		object-fit: cover;
		flex-shrink: 0;
		border: 1px solid #1db95430;
	}
	.playlist-img-placeholder {
		width: 36px;
		height: 36px;
		border-radius: 3px;
		background: #1a2a1c;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #1db954;
		font-size: 14px;
		flex-shrink: 0;
	}
	.playlist-info {
		flex: 1;
		min-width: 0;
	}
	.playlist-name {
		font-size: 11px;
		color: #ccc;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		margin: 0;
	}
	.playlist-meta {
		font-size: 9px;
		color: #1db954;
		opacity: 0.6;
		margin: 2px 0 0;
	}

	/* Volume */
	.vol-group {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}
	.vol-icon { font-size: 12px; }
	.vol-slider {
		width: 56px;
		accent-color: #1db954;
		cursor: pointer;
		height: 2px;
	}

	/* Row 2: progress */
	.row-progress {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.prog-time {
		font-size: 8px;
		color: #1db954;
		opacity: 0.6;
		flex-shrink: 0;
		min-width: 28px;
	}
	.prog-slider {
		flex: 1;
		accent-color: #1db954;
		cursor: pointer;
		height: 2px;
	}

	/* Range input styling for webkit */
	input[type='range'] {
		-webkit-appearance: none;
		appearance: none;
		background: transparent;
	}
	input[type='range']::-webkit-slider-runnable-track {
		height: 3px;
		background: #1db95433;
		border-radius: 2px;
	}
	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #1db954;
		margin-top: -3.5px;
		box-shadow: 0 0 5px #1db954;
		cursor: pointer;
	}
	input[type='range']:focus { outline: none; }
</style>
