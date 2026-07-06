import { test, expect, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { authFile } from './auth.setup';

/**
 * Flagship assistant E2E.
 *
 * These specs need an authenticated session ((app) routes require login). They
 * reuse the storageState written by `auth.setup.ts`; if no creds were provided
 * that file won't exist, so we skip the whole file rather than fail.
 *
 * The streaming test does NOT need a real backend or Anthropic key: it stubs
 * the cloud SSE route (`POST /api/assistant/stream`) with a canned body and
 * asserts the client-side SSE parser + transcript rendering. We also force the
 * engine to stay in CLOUD mode by failing the local `GET .../health` probe.
 */

test.skip(
	!existsSync(authFile),
	'No saved auth session (set E2E_EMAIL / E2E_PASSWORD and run the setup project).',
);

test.use({ storageState: authFile });

/** Make the local Guppy probe fail so the engine deterministically picks CLOUD. */
async function forceCloudMode(page: Page): Promise<void> {
	// engine.ts probes GET http://127.0.0.1:8080/health (cross-origin). Abort it
	// so probeEngine() resolves to 'cloud' regardless of the CI host.
	await page.route('**/127.0.0.1:8080/health', (route) => route.abort());
	await page.route('**/localhost:8080/health', (route) => route.abort());
}

/** Canned SSE body matching the engine contract: source → tokens → [DONE]. */
const CANNED_SSE =
	'data: {"source":"cloud:test"}\n\n' +
	'data: {"token":"Hello"}\n\n' +
	'data: {"token":" world"}\n\n' +
	'data: [DONE]\n\n';

test.describe('Assistant page', () => {
	test('renders the assistant shell (header, composer, engine badge)', async ({ page }) => {
		await forceCloudMode(page);
		await page.goto('/assistant');

		// Header title.
		await expect(page.getByRole('heading', { name: 'Assistant' })).toBeVisible();

		// Composer textarea.
		await expect(page.getByPlaceholder(/message the assistant/i)).toBeVisible();

		// Engine badge — cloud is the default / probe-failure mode.
		await expect(page.getByText(/cloud\s*·\s*claude/i)).toBeVisible();
	});

	test('streams a mocked reply and reflects the source', async ({ page }) => {
		await forceCloudMode(page);

		// Intercept the cloud stream route and fulfill with the canned SSE body.
		await page.route('**/api/assistant/stream', async (route) => {
			await route.fulfill({
				status: 200,
				headers: {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
				},
				body: CANNED_SSE,
			});
		});

		await page.goto('/assistant');

		const composer = page.getByPlaceholder(/message the assistant/i);
		await composer.fill('hi there');
		// Enter sends (no Shift).
		await composer.press('Enter');

		// The streamed tokens "Hello" + " world" concatenate to "Hello world"
		// inside the assistant bubble.
		await expect(page.getByText('Hello world')).toBeVisible({ timeout: 15_000 });

		// The user's own message is echoed in the transcript.
		await expect(page.getByText('hi there')).toBeVisible();

		// The answered-by line reflects the {"source":"cloud:test"} event.
		await expect(page.getByText(/via\s+cloud:test/i)).toBeVisible();
	});
});
