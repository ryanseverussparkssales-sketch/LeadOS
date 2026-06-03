import type { RequestHandler } from './$types';

// Serves TwiML to play a VM drop audio file and then hang up.
// Called by Twilio after a VM drop redirect from /api/voicemail-drops/drop.
export const GET: RequestHandler = async ({ url }) => {
	const audioUrl = url.searchParams.get('url') ?? '';

	if (!audioUrl) {
		// Return a silent hangup if no URL was provided
		return new Response(
			'<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
			{ headers: { 'Content-Type': 'application/xml' } }
		);
	}

	// Escape the audio URL for safe XML embedding
	const safeUrl = audioUrl
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

	const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${safeUrl}</Play>
  <Hangup/>
</Response>`;

	return new Response(twiml, {
		headers: { 'Content-Type': 'application/xml' },
	});
};
