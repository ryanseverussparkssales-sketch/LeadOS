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

		// CSRF: Twilio webhooks arrive from api.twilio.com so we can't enforce same-origin.
		// All API routes are protected by requireAuth() making framework CSRF redundant.
		csrf: {
			// Migrated from deprecated checkOrigin: false
			trustedOrigins: ['https://api.twilio.com', 'https://webhooks.twilio.com'],
		},
	},
};

export default config;
