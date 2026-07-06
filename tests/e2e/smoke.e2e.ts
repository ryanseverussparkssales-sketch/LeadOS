import { test, expect } from '@playwright/test';

/**
 * Unauthenticated smoke.
 *
 * Runs with NO storageState (fresh context, no session), so it verifies the
 * public landing page and the auth gate. Assertions are deliberately
 * structural (roles, URL shape, form controls) rather than exact marketing
 * copy, so they survive landing-page wording changes.
 */

// Explicitly drop any inherited auth for this file — it must be a fresh, logged-out context.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Public smoke (logged out)', () => {
	test('landing page loads and offers a login affordance', async ({ page }) => {
		await page.goto('/');

		// Something clickable that leads to sign-in. The landing page has a
		// "Log in →" button and a "SIGN IN" button; assert at least one exists.
		const loginAffordance = page.getByRole('button', { name: /log ?in|sign in/i });
		await expect(loginAffordance.first()).toBeVisible();

		// Reveal the auth form and confirm the email/password controls render.
		await page.getByRole('button', { name: /log in/i }).first().click();
		await expect(page.getByPlaceholder('Email')).toBeVisible();
		await expect(page.getByPlaceholder('Password')).toBeVisible();
	});

	test('assistant route requires auth (redirects a logged-out visitor away)', async ({ page }) => {
		await page.goto('/assistant');

		// Unauthenticated access must NOT land on the assistant. The (app) group
		// guards its routes and sends logged-out users to the login surface — we
		// assert we did not stay on /assistant (resilient to whether that's a
		// redirect to '/', '/login', or an in-place login prompt).
		await expect(page).not.toHaveURL(/\/assistant$/, { timeout: 15_000 });

		// And the assistant composer should not be present for a logged-out user.
		await expect(page.getByPlaceholder(/message the assistant/i)).toHaveCount(0);
	});
});
