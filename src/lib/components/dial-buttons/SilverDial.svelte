<script lang="ts">
	let { callState, onclick, size = 90 }: { callState: string; onclick: () => void; size?: number } = $props();
</script>

<button {onclick} onkeydown={(e) => e.key === 'Enter' && onclick()} aria-label="Call"
	class="dial state-{callState}" style="--s:{size}px">
	<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
		<!-- machined concentric rings -->
		<circle cx="50" cy="50" r="46" stroke-width="1.1" opacity="0.75" />
		<circle cx="50" cy="50" r="39" stroke-width="0.5" opacity="0.4" />
		<circle cx="50" cy="50" r="31" stroke-width="0.5" opacity="0.3" />
		<!-- bright gleam catching the light -->
		<g class="gleam">
			<path d="M50 4 A46 46 0 0 1 88 26" stroke="rgba(255,255,255,0.55)" stroke-width="2" />
		</g>
		<!-- engraved handset -->
		<g transform="translate(38 38)" stroke-width="1.6">
			<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.18 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
		</g>
	</svg>
</button>

<style>
	.dial { position: relative; width: var(--s); height: var(--s); border: none; border-radius: 50%; padding: 0; cursor: pointer; color: #9a9ea7;
		display: flex; align-items: center; justify-content: center; transition: transform .15s ease, color .45s ease;
		background: radial-gradient(circle at 40% 34%, #2c2e33 0%, #16171a 46%, #050506 100%);
		box-shadow: inset 0 1px 3px rgba(230,235,245,.1), inset 0 -7px 14px rgba(0,0,0,.6); }
	.dial:hover { transform: scale(1.05); }
	.dial svg { width: var(--s); height: var(--s); transition: filter .45s ease; }
	.gleam { transform-box: fill-box; transform-origin: 50% 50%; animation: spin 7s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.state-calling { color: #e6e9f0; }
	.state-calling .gleam { animation-duration: 2.2s; }
	.state-calling svg { filter: drop-shadow(0 0 6px rgba(220,228,240,.5)); }
	.state-connected { color: #c4c8d0; }
	.state-connected .gleam { animation-duration: 4.5s; }
	.state-connected svg { filter: drop-shadow(0 0 5px rgba(196,200,208,.4)); }
	@media (prefers-reduced-motion: reduce) { .gleam { animation: none; } }
</style>
