import { test as setup, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Auth setup — logs in through the real UI and persists the browser storage
 * state (localStorage Supabase session + cookies) to `.auth/user.json`. The
 * `chromium` project depends on this via `dependencies: ['setup']`, so any
 * authenticated spec reuses the saved session instead of logging in per-test.
 *
 * Credentials come from env: E2E_EMAIL / E2E_PASSWORD (a real Supabase user).
 * When they're absent this setup SKIPS gracefully — the cloud assistant smoke
 * and the unauthenticated smoke spec do not need a real session, so the suite
 * still runs. Specs that DO need auth should `test.skip(!fs.existsSync(authFile))`.
 *
 * Login flow mirrors `src/routes/+page.svelte`:
 *   landing → "Log in" → email + password inputs → submit → app route.
 */

export const authFile = 'tests/e2e/.auth/user.json';

setup('authenticate', async ({ page }) => {
	const email = process.env.E2E_EMAIL;
	const password = process.env.E2E_PASSWORD;

	// No creds → skip. The rest of the suite is authored to survive this.
	setup.skip(
		!email || !password,
		'E2E_EMAIL / E2E_PASSWORD not set — skipping login; authenticated specs will skip too.',
	);

	await page.goto('/');

	// Reveal the auth form. The landing page toggles `mode` to 'login' via a
	// button rather than routing, so click the login affordance first.
	await page.getByRole('button', { name: /log in/i }).first().click();

	// Fill the email/password form (placeholders "Email" / "Password").
	await page.getByPlaceholder('Email').fill(email!);
	await page.getByPlaceholder('Password').fill(password!);

	// Submit — the button label is "SIGN IN" (or "PLEASE WAIT…" mid-flight).
	await page.getByRole('button', { name: /sign in/i }).click();

	// A successful login navigates away from '/' to one of the app shells
	// (/dashboard, /sdr, /client-portal). Assert we left the landing page.
	await expect(page).toHaveURL(/\/(dashboard|sdr|client-portal|onboarding)/, { timeout: 20_000 });

	// Persist the authenticated storage state for dependent projects.
	const dir = dirname(authFile);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	await page.context().storageState({ path: authFile });
});
