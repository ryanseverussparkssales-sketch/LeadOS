/**
 * Client-side impersonation state for the platform super-admin "view as account".
 *
 * The selected owner id is persisted in localStorage so it survives navigation/reload,
 * and apiFetch reads it directly to attach the `X-Impersonate-Owner` header. The server
 * only honours that header when the REAL authenticated user is a super-admin, so this
 * store carries no privilege on its own.
 */
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export const IMPERSONATE_KEY = 'impersonate_owner';

const initial = browser ? localStorage.getItem(IMPERSONATE_KEY) || null : null;

/** Owner id currently being impersonated, or null. */
export const impersonatingOwner = writable<string | null>(initial);
/** Human label for the impersonated account (for the banner). */
export const impersonatingLabel = writable<string | null>(
	browser ? localStorage.getItem(IMPERSONATE_KEY + '_label') || null : null
);

export function startImpersonation(ownerId: string, label: string) {
	if (browser) {
		localStorage.setItem(IMPERSONATE_KEY, ownerId);
		localStorage.setItem(IMPERSONATE_KEY + '_label', label);
	}
	impersonatingOwner.set(ownerId);
	impersonatingLabel.set(label);
}

export function stopImpersonation() {
	if (browser) {
		localStorage.removeItem(IMPERSONATE_KEY);
		localStorage.removeItem(IMPERSONATE_KEY + '_label');
	}
	impersonatingOwner.set(null);
	impersonatingLabel.set(null);
}
