/**
 * Inbound lead webhook — src/routes/api/webhook/[token]/+server.ts
 *
 * getPath, flattenFieldData, and the name-extraction cascade are module-private,
 * so they are exercised through the exported POST handler with supabase /
 * rateLimit / webhooks / routingRules mocked. `$lib/server/db` (logWrite) and
 * `$lib/server/scoring` run for real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/supabase', async () => {
	const { createSupabaseMock } = await import('./helpers/supabaseMock');
	const mock = createSupabaseMock();
	return {
		supabaseAdmin: mock.supabaseAdmin,
		// digits-only stand-in; the route only threads the value through
		normalizePhone: (p: string) => {
			const d = String(p).replace(/\D/g, '');
			return d || null;
		},
		__mock: mock,
	};
});
vi.mock('$lib/server/rateLimit', () => ({
	rateLimit: vi.fn(() => ({ ok: true })),
}));
vi.mock('$lib/server/webhooks', () => ({
	deliverWebhooks: vi.fn(async () => {}),
}));
vi.mock('$lib/server/routingRules', () => ({
	applyRoutingRules: vi.fn(async () => {}),
}));

import { POST } from '../src/routes/api/webhook/[token]/+server';
import { rateLimit } from '$lib/server/rateLimit';
import { deliverWebhooks } from '$lib/server/webhooks';
import { applyRoutingRules } from '$lib/server/routingRules';
import type { SupabaseMock } from './helpers/supabaseMock';

const sb = ((await import('$lib/server/supabase')) as any).__mock as SupabaseMock;

const SOURCE = {
	id: 'src-1',
	user_id: 'owner-1',
	webhook_token: 'tok-1',
	status: 'active',
	field_mapping: null as unknown,
	default_contact_type: null as string | null,
};

function post(payload: unknown, token = 'tok-1') {
	const request = new Request(`http://localhost/api/webhook/${token}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload),
	});
	return POST({ request, params: { token }, getClientAddress: () => '9.9.9.9' } as any);
}

const insertPayload = () => sb.opArgs('contacts', 'insert')?.[0];
const updatePayload = () => sb.opArgs('contacts', 'update')?.[0];

beforeEach(() => {
	sb.reset();
	vi.mocked(rateLimit).mockClear();
	vi.mocked(rateLimit).mockReturnValue({ ok: true });
	vi.mocked(deliverWebhooks).mockClear();
	vi.mocked(applyRoutingRules).mockClear();
});

describe('auth + rate limiting', () => {
	it('401s on an unknown or inactive token', async () => {
		sb.queue('lead_sources', { data: null });
		const res = await post({ email: 'a@b.com' }, 'bad-token');
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: 'Invalid webhook token' });
	});

	it('429s with Retry-After when the fixed-window limiter blocks', async () => {
		vi.mocked(rateLimit).mockReturnValueOnce({ ok: false, retryAfterSeconds: 42 });
		const res = await post({ email: 'a@b.com' });
		expect(res.status).toBe(429);
		expect(res.headers.get('Retry-After')).toBe('42');
		// blocked before any DB access
		expect(sb.supabaseAdmin.from).not.toHaveBeenCalled();
	});

	it('keys the limiter per token + client IP', async () => {
		sb.queue('lead_sources', { data: SOURCE });
		sb.queue('contacts', { data: null }); // email dedupe
		sb.queue('contacts', { data: { id: 'c-1' } }); // insert
		await post({ email: 'a@b.com' });
		expect(rateLimit).toHaveBeenCalledWith('wh:tok-1:9.9.9.9', 120, 60_000);
	});
});

describe('flattenFieldData (Meta Lead Ads shapes)', () => {
	it('flattens top-level field_data arrays into contact fields', async () => {
		sb.queue('lead_sources', { data: SOURCE });
		sb.queue('contacts', { data: null }); // phone dedupe
		sb.queue('contacts', { data: null }); // email dedupe
		sb.queue('contacts', { data: { id: 'c-1' } }); // insert

		const res = await post({
			field_data: [
				{ name: 'full_name', values: ['Jane Doe'] },
				{ name: 'email', values: ['jane@example.com'] },
				{ name: 'phone_number', values: ['(555) 111-2222'] },
			],
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, contact_id: 'c-1', action: 'created' });
		expect(insertPayload()).toMatchObject({
			user_id: 'owner-1',
			name: 'Jane Doe',
			email: 'jane@example.com',
			phone: '(555) 111-2222',
			phone_normalized: '5551112222',
			lead_source_id: 'src-1',
			contact_type: 'lead',
			status: 'new',
		});
	});

	it('flattens the entry[0].changes[0].value.field_data Meta webhook envelope', async () => {
		sb.queue('lead_sources', { data: SOURCE });
		sb.queue('contacts', { data: null }); // email dedupe (no phone)
		sb.queue('contacts', { data: { id: 'c-2' } });

		const res = await post({
			entry: [{ changes: [{ value: { field_data: [
				{ name: 'email', values: ['nested@example.com'] },
				{ name: 'first_name', values: ['Nes'] },
				{ name: 'last_name', values: ['Ted'] },
			] } }] }],
		});

		expect(res.status).toBe(200);
		expect(insertPayload()).toMatchObject({ email: 'nested@example.com', name: 'Nes Ted' });
	});
});

describe('getPath via per-source field_mapping (dot paths + array indices)', () => {
	it('resolves nested dot-paths with numeric array indices and overrides heuristics', async () => {
		sb.queue('lead_sources', {
			data: {
				...SOURCE,
				field_mapping: {
					email: 'payload.leads.0.contact.email',
					name: 'payload.leads.0.contact.name',
					company: 'payload.leads.0.org.name',
					utm_source: 'payload.tracking.source',
				},
			},
		});
		sb.queue('contacts', { data: null }); // email dedupe
		sb.queue('contacts', { data: { id: 'c-3' } });

		const res = await post({
			email: 'decoy@wrong.com', // heuristic value the mapping must beat
			payload: {
				leads: [{ contact: { email: 'mapped@example.com', name: 'Mapped Name' }, org: { name: 'Acme Inc' } }],
				tracking: { source: 'facebook' },
			},
		});

		expect(res.status).toBe(200);
		expect(insertPayload()).toMatchObject({
			email: 'mapped@example.com',
			name: 'Mapped Name',
			company: 'Acme Inc',
			utm_source: 'facebook',
		});
	});

	it('falls back to heuristics when a mapped path resolves to nothing', async () => {
		sb.queue('lead_sources', { data: { ...SOURCE, field_mapping: { email: 'does.not.exist' } } });
		sb.queue('contacts', { data: null });
		sb.queue('contacts', { data: { id: 'c-4' } });

		await post({ email: 'fallback@example.com' });
		expect(insertPayload()).toMatchObject({ email: 'fallback@example.com' });
	});
});

describe('name extraction cascade', () => {
	const newContact = () => {
		sb.queue('lead_sources', { data: SOURCE });
		sb.queue('contacts', { data: null }); // dedupe
		sb.queue('contacts', { data: { id: 'c-n' } }); // insert
	};

	it('composes first_name + last_name when no explicit name', async () => {
		newContact();
		await post({ first_name: 'John', last_name: 'Smith', email: 'j@s.com' });
		expect(insertPayload()).toMatchObject({ name: 'John Smith' });
	});

	it('explicit name wins over the composed first/last pair', async () => {
		newContact();
		await post({ name: 'Explicit Name', first_name: 'J', last_name: 'S', email: 'j@s.com' });
		expect(insertPayload()).toMatchObject({ name: 'Explicit Name' });
	});

	it('full_name is accepted as an alias for name', async () => {
		newContact();
		await post({ full_name: 'Full Name', email: 'f@n.com' });
		expect(insertPayload()).toMatchObject({ name: 'Full Name' });
	});

	it('first_name alone still composes without a stray trailing space', async () => {
		newContact();
		await post({ first_name: 'Solo', email: 's@x.com' });
		expect(insertPayload()).toMatchObject({ name: 'Solo' });
	});

	it('falls back to "Unknown" when only an email is provided', async () => {
		newContact();
		await post({ email: 'only@e.com' });
		expect(insertPayload()).toMatchObject({ name: 'Unknown' });
	});
});

describe('dedupe + UTM merge on existing contacts', () => {
	it('updates instead of inserting on a phone match, never overwriting existing UTMs', async () => {
		sb.queue('lead_sources', { data: SOURCE });
		sb.queue('contacts', {
			data: {
				id: 'c-9',
				utm_source: 'google', // already attributed — must be preserved
				utm_medium: null,
				utm_campaign: null,
				lead_source_id: 'src-0',
				lead_metadata: { original: true },
			},
		}); // phone dedupe hit
		sb.queue('contacts', { data: { id: 'c-9' } }); // update result

		const res = await post({
			phone: '555-111-2222',
			utm_source: 'facebook', // attempted re-attribution
			utm_campaign: 'spring',
			custom_field: 'xyz',
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, contact_id: 'c-9', action: 'updated' });
		const upd = updatePayload();
		expect(upd).not.toHaveProperty('utm_source'); // first-touch preserved
		expect(upd).toMatchObject({ utm_campaign: 'spring' }); // empty slot filled
		expect(upd.lead_metadata).toEqual({ original: true, custom_field: 'xyz' }); // merged
		expect(applyRoutingRules).not.toHaveBeenCalled(); // routing only for new contacts
	});
});

describe('new-contact side effects', () => {
	it('captures unknown payload fields as lead_metadata and scores the lead', async () => {
		sb.queue('lead_sources', { data: SOURCE });
		sb.queue('contacts', { data: null });
		sb.queue('contacts', { data: null });
		sb.queue('contacts', { data: { id: 'c-5' } });

		await post({
			email: 'meta@example.com',
			phone: '5551112222',
			company: 'Acme',
			budget: '10k', // unknown → metadata
			interested_in: 'pro plan', // unknown → metadata
			utm_source: 'google', // known → column, not metadata
			empty: '', // empty → dropped
		});

		const ins = insertPayload();
		expect(ins.lead_metadata).toEqual({ budget: '10k', interested_in: 'pro plan' });
		expect(ins.utm_source).toBe('google');
		// real initialContactScore: 35 base + 15 phone + 8 email + 5 company = 63
		expect(ins.lead_score).toBe(63);
	});

	it('fires routing rules and outbound webhooks for the created contact', async () => {
		sb.queue('lead_sources', { data: SOURCE });
		sb.queue('contacts', { data: null });
		sb.queue('contacts', { data: { id: 'c-6', name: 'X' } });

		await post({ email: 'x@y.com' });
		expect(applyRoutingRules).toHaveBeenCalledWith({ id: 'c-6', name: 'X' }, 'owner-1');
		expect(deliverWebhooks).toHaveBeenCalledWith('owner-1', 'contact.created', { id: 'c-6', name: 'X' });
	});

	it('500s when the insert write fails (logWrite passthrough leaves data null)', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		sb.queue('lead_sources', { data: SOURCE });
		sb.queue('contacts', { data: null });
		sb.queue('contacts', { data: null, error: { message: 'insert exploded' } });

		const res = await post({ email: 'boom@x.com' });
		expect(res.status).toBe(500);
		expect(err).toHaveBeenCalledWith('[db] webhook contact insert failed:', 'insert exploded');
		err.mockRestore();
	});
});
