<script lang="ts">
	// Edelhaus brand lander — the public face of the house (edel.haus).
	// Distinct from the app login (app.edel.haus). SSR on for SEO.
	const pillars = [
		{
			name: 'Edelhaus Leads',
			tag: 'White-glove outreach',
			body: 'We find, qualify, and warm the homeowners and projects worth your time — so your team only ever speaks to people ready to build.',
			href: '#',
		},
		{
			name: 'Edelhaus OS',
			tag: 'The operating system',
			body: 'The platform our concierge team runs every engagement on — calls, pipeline, scheduling, and support, in one quiet, precise place.',
			href: 'https://app.edel.haus',
		},
		{
			name: 'Edelhaus Home Collection',
			tag: 'The curated marketplace',
			body: 'The finest names in luxury home services and smart-home automation, assembled under one roof and delivered to one standard.',
			href: '#',
		},
	];

	const steps = [
		{ n: '01', t: 'Outreach', d: 'White-glove prospecting that reaches the right homeowners with the right offer.' },
		{ n: '02', t: 'Concierge install', d: 'Coordinated, white-glove installation managed end to end — no loose ends.' },
		{ n: '03', t: 'Dedicated support', d: 'A single point of contact who stays with the client long after handover.' },
	];
</script>

<svelte:head>
	<title>Edelhaus — The House of Luxury Home</title>
	<meta name="description" content="Edelhaus brings the finest brands in luxury home services and smart-home automation together with white-glove outreach, concierge installation, and dedicated support." />
</svelte:head>

<div class="eh">
	<!-- Top bar -->
	<header class="bar">
		<span class="mark">EDELHAUS</span>
		<nav class="links">
			<a href="#collection">Collection</a>
			<a href="#how">Service</a>
			<a href="https://app.edel.haus" class="ghost">Sign in</a>
		</nav>
	</header>

	<!-- Hero -->
	<section class="hero">
		<p class="eyebrow">The house of luxury home</p>
		<h1>
			The finest in <em>home</em>,<br />delivered to one standard.
		</h1>
		<p class="lede">
			Edelhaus brings the best brands across luxury home services and smart-home automation together —
			with white-glove outreach, concierge installation, and customer support worthy of the homes they enter.
		</p>
		<div class="cta">
			<a href="#collection" class="btn-gold">Explore the Collection</a>
			<a href="#how" class="btn-line">How we work</a>
		</div>
	</section>

	<div class="rule"></div>

	<!-- Pillars -->
	<section id="collection" class="pillars">
		{#each pillars as p}
			<a class="pillar" href={p.href} target={p.href.startsWith('http') ? '_blank' : undefined} rel={p.href.startsWith('http') ? 'noopener' : undefined}>
				<span class="pillar-tag">{p.tag}</span>
				<h3>{p.name}</h3>
				<p>{p.body}</p>
				<span class="pillar-go">Enter →</span>
			</a>
		{/each}
	</section>

	<div class="rule"></div>

	<!-- The service promise -->
	<section id="how" class="how">
		<h2>White glove, from first call to final detail.</h2>
		<div class="steps">
			{#each steps as s}
				<div class="step">
					<span class="step-n">{s.n}</span>
					<h4>{s.t}</h4>
					<p>{s.d}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Closing -->
	<section class="close">
		<h2>One house. Every detail.</h2>
		<p>For brands ready to be carried, and clients ready to be cared for.</p>
		<a href="mailto:hello@edel.haus" class="btn-gold">Request an introduction</a>
	</section>

	<footer class="foot">
		<span class="mark sm">EDELHAUS</span>
		<span class="foot-sub">Edelhaus · Luxury home services & smart automation · edel.haus</span>
	</footer>
</div>

<style>
	.eh {
		--gold: #c8a24a;
		--ink: #0a0a0a;
		--paper: #f4efe6;
		background: radial-gradient(120% 80% at 50% -10%, #161310 0%, #0a0a0a 55%);
		color: #e9e4da;
		min-height: 100vh;
		font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
		-webkit-font-smoothing: antialiased;
	}

	.mark {
		font-family: 'Bodoni*', 'Playfair Display', Georgia, serif;
		letter-spacing: 0.42em;
		font-weight: 700;
		color: var(--paper);
	}
	.mark.sm { font-size: 13px; letter-spacing: 0.34em; }

	/* Top bar */
	.bar {
		display: flex; align-items: center; justify-content: space-between;
		padding: 28px clamp(20px, 6vw, 80px);
		font-size: 13px;
	}
	.bar .mark { font-size: 15px; }
	.links { display: flex; align-items: center; gap: clamp(14px, 3vw, 34px); }
	.links a { color: #9a948a; text-decoration: none; letter-spacing: 0.04em; transition: color .2s; }
	.links a:hover { color: var(--paper); }
	.links a.ghost { color: var(--gold); }

	/* Hero */
	.hero {
		padding: clamp(60px, 12vh, 150px) clamp(20px, 6vw, 80px) clamp(50px, 9vh, 110px);
		max-width: 1040px;
	}
	.eyebrow {
		color: var(--gold); text-transform: uppercase; letter-spacing: 0.32em;
		font-size: 12px; margin: 0 0 26px;
	}
	.hero h1 {
		font-family: 'Bodoni*', 'Playfair Display', Georgia, serif;
		font-weight: 700; color: var(--paper);
		font-size: clamp(40px, 7vw, 86px); line-height: 1.02; letter-spacing: -0.01em;
		margin: 0 0 30px;
	}
	.hero h1 em { font-style: italic; color: var(--gold); }
	.lede {
		max-width: 620px; color: #b9b2a6; font-size: clamp(16px, 1.5vw, 19px);
		line-height: 1.65; margin: 0 0 38px;
	}
	.cta { display: flex; gap: 14px; flex-wrap: wrap; }

	.btn-gold {
		background: var(--gold); color: #1a1206; text-decoration: none;
		padding: 14px 28px; border-radius: 2px; font-weight: 600; font-size: 14px;
		letter-spacing: 0.03em; transition: transform .15s, background .2s;
	}
	.btn-gold:hover { background: #d8b25e; transform: translateY(-1px); }
	.btn-line {
		border: 1px solid #3a352c; color: #d8d2c6; text-decoration: none;
		padding: 14px 26px; border-radius: 2px; font-size: 14px; letter-spacing: 0.03em; transition: border-color .2s, color .2s;
	}
	.btn-line:hover { border-color: var(--gold); color: var(--paper); }

	.rule { height: 1px; background: linear-gradient(90deg, transparent, #2a251d 30%, #2a251d 70%, transparent); }

	/* Pillars */
	.pillars {
		display: grid; grid-template-columns: repeat(3, 1fr);
		gap: 1px; background: #211c15;
		border-block: 1px solid #211c15;
	}
	.pillar {
		background: #0c0a08; padding: clamp(32px, 4vw, 56px) clamp(24px, 3vw, 44px);
		text-decoration: none; color: inherit; display: flex; flex-direction: column;
		transition: background .25s;
	}
	.pillar:hover { background: #100d09; }
	.pillar-tag { color: var(--gold); font-size: 11px; text-transform: uppercase; letter-spacing: 0.24em; }
	.pillar h3 {
		font-family: 'Bodoni*', 'Playfair Display', Georgia, serif;
		color: var(--paper); font-size: clamp(22px, 2.4vw, 30px); margin: 16px 0 14px; font-weight: 700;
	}
	.pillar p { color: #a39c90; font-size: 15px; line-height: 1.6; margin: 0 0 26px; flex: 1; }
	.pillar-go { color: #6f6a60; font-size: 13px; letter-spacing: 0.04em; transition: color .2s; }
	.pillar:hover .pillar-go { color: var(--gold); }

	/* How */
	.how { padding: clamp(64px, 11vh, 130px) clamp(20px, 6vw, 80px); max-width: 1100px; }
	.how h2, .close h2 {
		font-family: 'Bodoni*', 'Playfair Display', Georgia, serif;
		color: var(--paper); font-weight: 700; font-size: clamp(28px, 4vw, 48px);
		line-height: 1.1; margin: 0 0 48px; letter-spacing: -0.01em;
	}
	.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(24px, 4vw, 56px); }
	.step-n { font-family: 'Bodoni*', Georgia, serif; color: var(--gold); font-size: 28px; }
	.step h4 { color: var(--paper); font-size: 18px; margin: 14px 0 10px; font-weight: 600; }
	.step p { color: #a39c90; font-size: 15px; line-height: 1.6; margin: 0; }

	/* Close */
	.close {
		text-align: center; padding: clamp(70px, 13vh, 150px) clamp(20px, 6vw, 80px);
		border-top: 1px solid #211c15;
		background: radial-gradient(80% 120% at 50% 120%, #15110b 0%, transparent 60%);
	}
	.close h2 { margin-bottom: 16px; }
	.close p { color: #a39c90; font-size: 17px; margin: 0 0 34px; }

	/* Footer */
	.foot {
		display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
		padding: 30px clamp(20px, 6vw, 80px); border-top: 1px solid #1a1610;
	}
	.foot-sub { color: #6f6a60; font-size: 12px; letter-spacing: 0.03em; }

	@media (max-width: 760px) {
		.pillars, .steps { grid-template-columns: 1fr; }
		.links a:not(.ghost) { display: none; }
	}
</style>
