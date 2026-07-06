import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config (Wave C1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT — first-time setup: install the Chromium browser binary once with
 *
 *     npx playwright install chromium
 *
 * (CI must run the same command before `npm run test:e2e`.) Playwright ships no
 * browsers by default; without this step every test errors with
 * "Executable doesn't exist".
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * RUNNER ISOLATION — the repo's vitest suite includes `tests/**\/*.{test,spec}.ts`.
 * To keep the two runners from colliding, Playwright specs live under
 * `tests/e2e/` and use the `*.e2e.ts` suffix (see `testMatch` below), which the
 * vitest glob does NOT match. Do not rename E2E specs to `*.spec.ts` or vitest
 * will try (and fail) to execute them.
 */

const PORT = 5173; // SvelteKit / Vite dev default (no override in vite.config.ts)
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
	testDir: './tests/e2e',
	// Only pick up `*.e2e.ts` and the auth setup — keeps vitest's `*.spec.ts`
	// glob and this runner in separate lanes.
	testMatch: /(.*\.e2e\.ts|auth\.setup\.ts)$/,

	// A green suite must not contain committed `.only`.
	forbidOnly: !!process.env.CI,
	fullyParallel: true,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,

	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],

	timeout: 30_000,
	expect: { timeout: 10_000 },

	use: {
		baseURL: BASE_URL,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		actionTimeout: 15_000,
		navigationTimeout: 20_000,
	},

	projects: [
		// Logs in via the UI and persists storageState. Other projects depend on
		// this; it self-skips when E2E_EMAIL / E2E_PASSWORD are absent.
		{ name: 'setup', testMatch: /auth\.setup\.ts$/ },

		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
			dependencies: ['setup'],
		},
	],

	// Boot the app for local/CI runs. When something is already listening on the
	// port (e.g. `npm run dev` in another terminal, or E2E_BASE_URL points at a
	// deployed preview), reuse it instead of spawning a second server.
	webServer: {
		command: 'npm run dev',
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		stdout: 'ignore',
		stderr: 'pipe',
	},
});
