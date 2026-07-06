// Migration note: run supabase-scraper-upgrade.sql to add campaign_id, call_list_id, source_query, notes columns
import { json, error } from '@sveltejs/kit';
import { assertAiAccess } from '$lib/server/tier';
import { safeFetch } from '$lib/server/ssrf';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import { MODELS } from '$lib/server/models';
import { env } from '$env/dynamic/private';
import { BRAND } from '$lib/brand';
import type { RequestHandler } from './$types';

// GET: list scraped contacts
export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('scraped_contacts')
		.select('*')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false })
		.limit(100);
	return json(data ?? []);
};

// POST: scrape a URL, extract from screenshot, enrich, search, streamer lookup, or CSV import
// Modes that actually call a model — only these are tier-gated. Geo (Google Places)
// and CSV import/preview don't use AI, so they're available to every plan.
const AI_MODES = new Set(['web', 'screenshot', 'enrich', 'search', 'streamer']);

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const body = await request.json();
	const { mode, url, imageBase64, imageType, contactId, contactName, contactTitle, contactCompany } = body;
	if (AI_MODES.has(mode)) await assertAiAccess(user.id);

	// ── MODE: web ────────────────────────────────────────────────────────────
	if (mode === 'web') {
		if (!url) throw error(400, 'url required');
		let html = '';
		try {
			const res = await safeFetch(url, {
				headers: { 'User-Agent': `Mozilla/5.0 (compatible; ${BRAND}/1.0)` },
				signal: AbortSignal.timeout(10000),
			});
			html = (await res.text()).slice(0, 50000);
		} catch (fetchErr) {
			throw error(422, `Could not fetch URL: ${fetchErr instanceof Error ? fetchErr.message : 'timeout'}`);
		}

		const prompt = `Extract all contact information from this webpage HTML. Return a JSON array of contacts.
Each contact: { "name": string, "email": string, "phone": string, "title": string, "company": string, "confidence": 0-1 }
Only include people with at least a name or email. Omit generic emails (info@, contact@, etc) unless no other option.
Return ONLY the JSON array, nothing else.

URL: ${url}
HTML (truncated):
${html.slice(0, 30000)}`;

		const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
			body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
		});

		if (!claudeRes.ok) throw error(500, 'Claude extraction failed');
		const claudeData = await claudeRes.json() as { content: Array<{type:string;text:string}> };
		const rawText = claudeData.content[0]?.text ?? '[]';

		let contacts: Array<Record<string, unknown>> = [];
		try {
			const match = rawText.match(/\[[\s\S]*\]/);
			contacts = match ? JSON.parse(match[0]) : [];
		} catch { contacts = []; }

		const saved = [];
		for (const c of contacts.slice(0, 20)) {
			const { data: row } = await supabaseAdmin.from('scraped_contacts').insert({
				user_id: user.id,
				source: 'web_scrape',
				source_url: url,
				raw_name: c.name ?? null,
				raw_email: c.email ?? null,
				raw_phone: c.phone ?? null,
				raw_title: c.title ?? null,
				raw_company: c.company ?? null,
				confidence: c.confidence ?? 0.8,
			}).select().single();
			if (row) saved.push(row);
		}

		return json({ found: saved.length, contacts: saved });
	}

	// ── MODE: screenshot ──────────────────────────────────────────────────────
	if (mode === 'screenshot') {
		if (!imageBase64) throw error(400, 'imageBase64 required');

		const prompt = `Extract contact information from this screenshot. Return JSON:
{ "name": string, "email": string, "phone": string, "title": string, "company": string, "confidence": 0-1 }
Return ONLY the JSON object, nothing else.`;

		const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
			body: JSON.stringify({
				model: MODELS.opus,
				max_tokens: 500,
				messages: [{
					role: 'user',
					content: [
						{ type: 'image', source: { type: 'base64', media_type: imageType ?? 'image/png', data: imageBase64 } },
						{ type: 'text', text: prompt },
					],
				}],
			}),
		});

		if (!claudeRes.ok) throw error(500, 'Claude vision failed');
		const claudeData = await claudeRes.json() as { content: Array<{type:string;text:string}> };
		const rawText = claudeData.content[0]?.text ?? '{}';

		let extracted: Record<string, unknown> = {};
		try {
			const match = rawText.match(/\{[\s\S]*\}/);
			extracted = match ? JSON.parse(match[0]) : {};
		} catch { extracted = {}; }

		const { data: row } = await supabaseAdmin.from('scraped_contacts').insert({
			user_id: user.id,
			source: 'screenshot',
			raw_name: extracted.name ?? null,
			raw_email: extracted.email ?? null,
			raw_phone: extracted.phone ?? null,
			raw_title: extracted.title ?? null,
			raw_company: extracted.company ?? null,
			confidence: extracted.confidence ?? 0.7,
		}).select().single();

		return json({ extracted, saved: row });
	}

	// ── MODE: enrich ──────────────────────────────────────────────────────────
	if (mode === 'enrich') {
		if (!contactId) throw error(400, 'contactId required');

		const prompt = `Generate sales outreach enrichment for this prospect:
Name: ${contactName ?? 'Unknown'}
Title: ${contactTitle ?? 'Unknown'}
Company: ${contactCompany ?? 'Unknown'}

Return JSON:
{
  "companySummary": "2-3 sentence summary of what the company likely does",
  "outreachAngle": "Best angle for a cold call (1-2 sentences)",
  "personalizedMessage": "A brief personalized opening for a cold call",
  "talkingPoints": ["point 1", "point 2", "point 3"]
}
Return ONLY the JSON.`;

		const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
			body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
		});

		if (!claudeRes.ok) throw error(500, 'Claude enrichment failed');
		const claudeData = await claudeRes.json() as { content: Array<{type:string;text:string}> };
		const rawText = claudeData.content[0]?.text ?? '{}';

		let enrichment: Record<string, unknown> = {};
		try {
			const match = rawText.match(/\{[\s\S]*\}/);
			enrichment = match ? JSON.parse(match[0]) : {};
		} catch { enrichment = {}; }

		const { data: row } = await supabaseAdmin.from('contact_enrichments').upsert({
			user_id: user.id,
			contact_id: contactId,
			company_summary: enrichment.companySummary ?? null,
			outreach_angle: enrichment.outreachAngle ?? null,
			personalized_message: enrichment.personalizedMessage ?? null,
			talking_points: JSON.stringify(enrichment.talkingPoints ?? []),
			enriched_at: new Date().toISOString(),
		}, { onConflict: 'contact_id' }).select().single();

		return json({ enrichment, saved: row });
	}

	// ── MODE: search ──────────────────────────────────────────────────────────
	if (mode === 'search') {
		const { query, campaignId, callListId } = body;
		if (!query) throw error(400, 'query required');

		let searchHtml = '';
		try {
			const ddgRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' contact phone')}`, {
				headers: { 'User-Agent': `Mozilla/5.0 (compatible; ${BRAND}/1.0)` },
				signal: AbortSignal.timeout(10000),
			});
			searchHtml = await ddgRes.text();
		} catch { return json({ found: 0, contacts: [], message: 'Search unavailable' }); }

		const urlPrompt = `From this DuckDuckGo search results HTML, extract up to 10 business website URLs likely to have contact information.
Return ONLY a JSON array of URLs: ["https://...", "https://..."]
Prefer local business websites, not directories.
Query was: "${query}"
HTML: ${searchHtml.slice(0, 20000)}`;

		const urlRes = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
			body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, messages: [{ role: 'user', content: urlPrompt }] }),
		});

		const urlData = await urlRes.json() as { content: Array<{type:string;text:string}> };
		let urls: string[] = [];
		try {
			const match = urlData.content[0]?.text?.match(/\[[\s\S]*\]/);
			urls = match ? JSON.parse(match[0]) : [];
		} catch { urls = []; }

		if (urls.length === 0) {
			return json({ found: 0, contacts: [], message: 'No results found for that search. Try a more specific query.' });
		}

		const allContacts: Array<Record<string, unknown>> = [];
		for (const pageUrl of urls.slice(0, 5)) {
			try {
				const pageRes = await safeFetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
				const pageHtml = (await pageRes.text()).slice(0, 30000);

				const extractPrompt = `Extract contact information from this business webpage. Return a JSON array of contacts.
Each contact: { "name": string|null, "phone": string|null, "email": string|null, "title": string|null, "company": string|null, "confidence": 0-1 }
Include the business itself as a contact if you find a phone number. Return ONLY the JSON array.
URL: ${pageUrl}
HTML: ${pageHtml.slice(0, 20000)}`;

				const extRes = await fetch('https://api.anthropic.com/v1/messages', {
					method: 'POST',
					headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
					body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, messages: [{ role: 'user', content: extractPrompt }] }),
				});
				const extData = await extRes.json() as { content: Array<{type:string;text:string}> };
				const match2 = extData.content[0]?.text?.match(/\[[\s\S]*\]/);
				const contacts = match2 ? JSON.parse(match2[0]) : [];
				for (const c of contacts.slice(0, 5)) {
					if (c.phone || c.email || c.name) allContacts.push({ ...c, source_url: pageUrl });
				}
			} catch { /* skip failed URLs */ }
		}

		const saved = [];
		for (const c of allContacts.slice(0, 30)) {
			const { data: row } = await supabaseAdmin.from('scraped_contacts').insert({
				user_id: user.id,
				source: 'search',
				source_url: c.source_url,
				source_query: query,
				raw_name: c.name ?? null,
				raw_email: c.email ?? null,
				raw_phone: c.phone ?? null,
				raw_title: c.title ?? null,
				raw_company: c.company ?? null,
				confidence: c.confidence ?? 0.75,
				campaign_id: campaignId ?? null,
				call_list_id: callListId ?? null,
			}).select().single();
			if (row) saved.push(row);
		}

		return json({ found: saved.length, contacts: saved, searched: urls.length });
	}

	// ── MODE: places (Google Maps geo search — cities × queries × radius) ──────
	if (mode === 'places') {
		const apiKey = env.GOOGLE_MAPS_API_KEY;
		if (!apiKey) throw error(400, 'GOOGLE_MAPS_API_KEY is not configured on the server.');

		const { cities, queries, radius, campaignId, callListId } = body as {
			cities?: Array<{ name: string; lat: number; lng: number }>;
			queries?: string[];
			radius?: number;
			campaignId?: string;
			callListId?: string;
		};
		if (!Array.isArray(cities) || cities.length === 0) throw error(400, 'cities required');
		if (!Array.isArray(queries) || queries.length === 0) throw error(400, 'queries required');
		const searchRadius = Number(radius) > 0 ? Number(radius) : 15000;

		const PLACES = 'https://maps.googleapis.com/maps/api/place';
		const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
		const seen = new Set<string>();
		const collected: Array<Record<string, unknown>> = [];

		// Text Search across every city × query, following next_page_token pagination.
		for (const city of cities) {
			for (const query of queries) {
				let pageToken: string | null = null;
				let page = 0;
				do {
					const params = new URLSearchParams(
						pageToken
							? { pagetoken: pageToken, key: apiKey }
							: { query, location: `${city.lat},${city.lng}`, radius: String(searchRadius), key: apiKey },
					);
					if (pageToken) await sleep(2000); // token needs a moment to become valid
					let data: { status?: string; results?: Array<Record<string, unknown>>; next_page_token?: string } = {};
					try {
						const res = await fetch(`${PLACES}/textsearch/json?${params}`, { signal: AbortSignal.timeout(15000) });
						data = await res.json();
					} catch { break; }
					if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') break;
					for (const p of (data.results ?? []) as Array<Record<string, any>>) {
						if (!p.place_id || seen.has(p.place_id)) continue;
						seen.add(p.place_id);
						collected.push({
							placeId: p.place_id,
							name: p.name ?? '',
							address: p.formatted_address ?? '',
							city: city.name,
							rating: p.rating ?? null,
							searchType: query,
						});
					}
					pageToken = data.next_page_token ?? null;
					page++;
				} while (pageToken && page < 3);
			}
		}

		// Best-effort phone enrichment via Place Details — bounded concurrency (was 60 sequential).
		const detailLimit = 60;
		const toDetail = collected.slice(0, detailLimit);
		const DETAIL_CONCURRENCY = 10;
		for (let i = 0; i < toDetail.length; i += DETAIL_CONCURRENCY) {
			await Promise.all(toDetail.slice(i, i + DETAIL_CONCURRENCY).map(async (c) => {
				try {
					const dParams = new URLSearchParams({ place_id: String(c.placeId), fields: 'formatted_phone_number', key: apiKey });
					const dRes = await fetch(`${PLACES}/details/json?${dParams}`, { signal: AbortSignal.timeout(10000) });
					const dData = await dRes.json() as { result?: { formatted_phone_number?: string } };
					c.phone = dData?.result?.formatted_phone_number ?? '';
				} catch { c.phone = ''; }
			}));
		}

		// Single bulk insert (was up to 100 sequential .insert().single() round-trips).
		const placeRows = collected.slice(0, 100).map((c) => ({
			user_id: user.id,
			source: 'places',
			source_url: `https://www.google.com/maps/place/?q=place_id:${c.placeId}`,
			source_query: c.searchType as string,
			raw_name: c.name as string,
			raw_phone: (c.phone as string) || null,
			raw_company: c.name as string,
			raw_title: c.address as string,
			confidence: 0.9,
			campaign_id: campaignId ?? null,
			call_list_id: callListId ?? null,
			notes: `${c.city as string}${c.rating ? ` · ★${c.rating}` : ''}`,
		}));
		const { data: saved } = await supabaseAdmin.from('scraped_contacts').insert(placeRows).select();

		return json({ found: saved?.length ?? 0, contacts: saved ?? [], scanned: collected.length });
	}

	// ── MODE: streamer ────────────────────────────────────────────────────────
	if (mode === 'streamer') {
		const { handle, platform, callListId } = body;
		if (!handle) throw error(400, 'handle required');

		const platformUrl = platform === 'YouTube'
			? `https://www.youtube.com/@${handle}`
			: platform === 'Kick'
			? `https://kick.com/${handle}`
			: `https://www.twitch.tv/${handle}`;

		let pageHtml = '';
		try {
			const res = await safeFetch(platformUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
			pageHtml = (await res.text()).slice(0, 40000);
		} catch { return json({ error: 'Could not fetch streamer page' }); }

		const prompt = `Extract streamer/creator info from this ${platform ?? 'Twitch'} page HTML.
Return ONLY this JSON:
{
  "name": "display name",
  "handle": "${handle}",
  "platform": "${platform ?? 'Twitch'}",
  "game": "main game/category",
  "followers": "follower count as string e.g. '2.1M'",
  "email": "business email if visible",
  "bio": "brief bio",
  "confidence": 0.8
}
HTML: ${pageHtml.slice(0, 30000)}`;

		const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
			body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
		});

		const cData = await claudeRes.json() as { content: Array<{type:string;text:string}> };
		let info: Record<string, unknown> = {};
		try {
			const match = cData.content[0]?.text?.match(/\{[\s\S]*\}/);
			info = match ? JSON.parse(match[0]) : {};
		} catch { info = { handle, platform }; }

		const { data: row } = await supabaseAdmin.from('scraped_contacts').insert({
			user_id: user.id,
			source: 'streamer',
			source_url: platformUrl,
			raw_name: (info.name as string) ?? handle,
			raw_email: (info.email as string) ?? null,
			raw_phone: null,
			raw_title: `${info.platform ?? platform} Streamer — ${info.game ?? ''}`,
			raw_company: `${info.followers ?? '?'} followers`,
			confidence: (info.confidence as number) ?? 0.8,
			call_list_id: callListId ?? null,
			notes: (info.bio as string) ?? null,
		}).select().single();

		return json({ info, saved: row });
	}

	// ── MODE: csv_preview ─────────────────────────────────────────────────────
	if (mode === 'csv_preview') {
		const { csvText } = body;
		if (!csvText) throw error(400, 'csvText required');

		const lines = (csvText as string).trim().split('\n').filter((l: string) => l.trim());
		if (lines.length < 2) return json({ headers: [], preview: [], totalRows: 0 });

		function parseRow(line: string): string[] {
			const result: string[] = [];
			let current = '';
			let inQuotes = false;
			for (const char of line) {
				if (char === '"') { inQuotes = !inQuotes; }
				else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
				else { current += char; }
			}
			result.push(current.trim());
			return result;
		}

		const headers = parseRow(lines[0]);
		const preview = lines.slice(1, 6).map((l: string) => {
			const vals = parseRow(l);
			return Object.fromEntries(headers.map((h: string, i: number) => [h, vals[i] ?? '']));
		});

		return json({ headers, preview, totalRows: lines.length - 1 });
	}

	// ── MODE: csv_import ──────────────────────────────────────────────────────
	if (mode === 'csv_import') {
		const { csvText, mapping, callListId, campaignId } = body;
		if (!csvText || !mapping) throw error(400, 'csvText and mapping required');

		function parseRow(line: string): string[] {
			const result: string[] = []; let current = ''; let inQuotes = false;
			for (const char of line) {
				if (char === '"') { inQuotes = !inQuotes; }
				else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
				else { current += char; }
			}
			result.push(current.trim()); return result;
		}

		const lines = (csvText as string).trim().split('\n').filter((l: string) => l.trim());
		if (lines.length < 2) return json({ imported: 0, skipped: 0 });

		const headers = parseRow(lines[0]);
		const rows = lines.slice(1);

		const records = [];
		for (const line of rows) {
			const vals = parseRow(line);
			const row_obj: Record<string, string> = Object.fromEntries(headers.map((h: string, i: number) => [h, vals[i] ?? '']));

			const name = mapping.name ? row_obj[mapping.name] : null;
			const phone = mapping.phone ? row_obj[mapping.phone] : null;
			const email = mapping.email ? row_obj[mapping.email] : null;
			const company = mapping.company ? row_obj[mapping.company] : null;
			const title = mapping.title ? row_obj[mapping.title] : null;

			if (!name && !phone && !email) continue;

			records.push({
				user_id: user.id,
				source: 'csv_import',
				raw_name: name || null,
				raw_phone: phone || null,
				raw_email: email || null,
				raw_company: company || null,
				raw_title: title || null,
				confidence: 1.0,
				campaign_id: campaignId ?? null,
				call_list_id: callListId ?? null,
			});
		}

		// Chunked bulk insert (was one .insert().single() round-trip per row).
		let imported = 0;
		const IMPORT_CHUNK = 500;
		for (let i = 0; i < records.length; i += IMPORT_CHUNK) {
			const { data, error: e } = await supabaseAdmin
				.from('scraped_contacts')
				.insert(records.slice(i, i + IMPORT_CHUNK))
				.select('id');
			if (e) { console.error('[scraper csv_import]', e.message); continue; }
			imported += data?.length ?? 0;
		}

		return json({ imported, skipped: rows.length - imported });
	}

	throw error(400, 'Invalid mode. Use: web | screenshot | enrich | search | places | streamer | csv_preview | csv_import');
};
