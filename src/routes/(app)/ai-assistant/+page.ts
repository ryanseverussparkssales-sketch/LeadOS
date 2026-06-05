import { redirect } from '@sveltejs/kit';

// The AI assistant lives as a global widget, not a standalone page. Redirect in
// `load` (before the component renders) so users don't see a blank flash.
export const load = () => {
	throw redirect(307, '/dashboard');
};
