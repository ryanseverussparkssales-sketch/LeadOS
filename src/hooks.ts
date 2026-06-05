import type { Reroute } from '@sveltejs/kit';

// Host-based front door.
//   - edel.haus / www.edel.haus  → the Edelhaus brand lander (served from /welcome)
//   - app.edel.haus              → the EdelhausOS engine (normal app, login at /)
// The browser URL stays the bare domain; only the resolved route changes.
const LANDER_HOSTS = new Set(['edel.haus', 'www.edel.haus']);

export const reroute: Reroute = ({ url }) => {
	if (LANDER_HOSTS.has(url.hostname) && url.pathname === '/') {
		return '/welcome';
	}
};
