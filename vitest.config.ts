import { defineConfig } from 'vitest/config';

// Standalone test config — intentionally does NOT load the SvelteKit/Tailwind
// plugins. Tests target pure, dependency-free utilities in src/lib/utils so they
// run fast with no env / SvelteKit setup. Add jsdom + the svelte plugin later if
// component tests are needed.
export default defineConfig({
	test: {
		include: ['src/**/*.{test,spec}.ts'],
		environment: 'node',
	},
});
