<script lang="ts">
	let { callState, onclick, size = 90 }: { callState: string; onclick: () => void; size?: number } = $props();
</script>

<button {onclick} onkeydown={(e) => e.key === 'Enter' && onclick()} aria-label="Call"
	class="dial state-{callState}" style="--s:{size}px">
	<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
		<!-- polished sheen sweeping across the stone -->
		<g class="sheen">
			<ellipse cx="50" cy="34" rx="38" ry="11" fill="rgba(255,246,230,0.07)" stroke="none" />
		</g>
		<!-- brass rim -->
		<circle cx="50" cy="50" r="46.5" stroke-width="1.3" opacity="0.85" />
		<circle cx="50" cy="50" r="40" stroke-width="0.4" opacity="0.28" />
		<!-- engraved handset -->
		<g transform="translate(38 38)" stroke-width="1.6">
			<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.18 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
		</g>
	</svg>
</button>

<style>
	.dial { position: relative; width: var(--s); height: var(--s); border: none; border-radius: 50%; padding: 0; cursor: pointer; color: #a8842f;
		display: flex; align-items: center; justify-content: center; transition: transform .15s ease, color .45s ease;
		background: radial-gradient(circle at 40% 36%, #2a2520 0%, #141110 46%, #050403 100%);
		box-shadow: inset 0 1px 3px rgba(255,240,220,.08), inset 0 -7px 14px rgba(0,0,0,.6); }
	.dial:hover { transform: scale(1.05); }
	.dial svg { width: var(--s); height: var(--s); transition: filter .45s ease; }
	.sheen { transform-box: fill-box; transform-origin: 50% 50%; animation: sweep 9s linear infinite; }
	@keyframes sweep { to { transform: rotate(360deg); } }

	.state-calling { color: #d4af37; }
	.state-calling .sheen { animation-duration: 2.6s; }
	.state-calling svg { filter: drop-shadow(0 0 6px rgba(212,175,55,.5)); }
	.state-connected { color: #c8a24a; }
	.state-connected .sheen { animation-duration: 5s; }
	.state-connected svg { filter: drop-shadow(0 0 5px rgba(200,162,74,.4)); }
	@media (prefers-reduced-motion: reduce) { .sheen { animation: none; } }
</style>
