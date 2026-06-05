import adapter from '@sveltejs/adapter-auto';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for all non-library files (removable in Svelte 6)
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
	},

	// Suppress a11y warnings that don't affect functionality
	onwarn: (warning, handler) => {
		if (warning.code.startsWith('a11y_')) return;
		if (warning.code === 'non_reactive_update') return;
		handler(warning);
	},

	kit: {
		adapter: adapter(),

		// CSRF: Twilio webhooks are server-to-server POSTs with NO Origin header, so
		// `trustedOrigins` can't allow them (it only matches a present Origin) — that
		// caused "Cross-site POST form submissions are forbidden" (HTTP 403 → Twilio 11200)
		// on /api/twilio/* callbacks. Disable the framework origin check; these endpoints
		// are protected by Twilio signature verification (hooks.server.ts) and every other
		// API route by requireAuth() Bearer-token auth, so same-origin checking is redundant.
		csrf: {
			checkOrigin: false,
		},
	},
};

export default config;
