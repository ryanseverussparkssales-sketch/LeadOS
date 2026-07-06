import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Standalone test config — intentionally does NOT load the SvelteKit/Tailwind
// plugins. Tests target pure, dependency-free utilities in src/lib/utils plus
// the money-path suites in tests/ so they run fast with no env / SvelteKit
// setup. Add jsdom + the svelte plugin later if component tests are needed.
//
// The `$lib` alias mirrors SvelteKit's so server modules under src/lib can be
// imported (and vi.mock'ed by the same resolved id as relative './supabase'
// imports). SvelteKit virtual modules ($env/*, ./$types) are NOT aliased:
// every test either mocks the module that imports them or imports modules
// whose only virtual import is a type-only `./$types` (erased at transpile).
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
		},
	},
	test: {
		include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
		environment: 'node',
	},
});
