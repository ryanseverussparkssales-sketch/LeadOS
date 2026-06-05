import type { HandleClientError } from '@sveltejs/kit';

// Capture unhandled client-side errors. Sentry-ready: report `error` here if the
// Sentry SvelteKit SDK is installed and PUBLIC_SENTRY_DSN is set.
export const handleError: HandleClientError = ({ error, event, status, message }) => {
	console.error(`[client-error] ${event.url.pathname} → ${status} ${message}`, error);
	return { message: status >= 500 ? 'Something went wrong. Please retry.' : message };
};
