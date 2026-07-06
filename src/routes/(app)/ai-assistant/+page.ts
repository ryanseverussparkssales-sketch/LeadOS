import { redirect } from '@sveltejs/kit';

// The AI assistant now lives at /assistant (Wave B). This legacy path redirects
// there in `load` (before the component renders) so users don't see a blank flash.
export const load = () => {
	throw redirect(307, '/assistant');
};
