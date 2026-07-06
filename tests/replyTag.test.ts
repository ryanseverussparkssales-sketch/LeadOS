/**
 * Reply-To campaign tagging — src/lib/server/replyTag.ts (pure).
 * Routing inbound replies to the right campaign is a money path: a broken
 * decode drops the reply on the floor.
 */
import { describe, it, expect } from 'vitest';
import {
	encodeReplyTag,
	decodeReplyTag,
	buildReplyToAddress,
	isReplyRoutingAddress,
	type ReplyContext,
} from '$lib/server/replyTag';

const FULL: ReplyContext = { uid: 'user-1', cid: 'camp-2', pid: 'proj-3', lid: 'client-4', aid: 'acct-5' };

describe('encode/decode round trip', () => {
	it('round-trips a full context (decode requires the reply+ local-part shape)', () => {
		expect(decodeReplyTag(`reply+${encodeReplyTag(FULL)}`)).toEqual(FULL);
	});

	it('round-trips a uid-only context (optional fields undefined)', () => {
		const decoded = decodeReplyTag(`reply+${encodeReplyTag({ uid: 'solo' })}`);
		expect(decoded).toEqual({ uid: 'solo', cid: undefined, pid: undefined, lid: undefined, aid: undefined });
	});

	it('omits undefined fields from the payload to keep tags short', () => {
		const json = Buffer.from(encodeReplyTag({ uid: 'u', cid: 'c' }), 'base64url').toString('utf-8');
		expect(JSON.parse(json)).toEqual({ uid: 'u', cid: 'c' });
	});
});

describe('buildReplyToAddress', () => {
	it('builds reply+<tag>@<domain> and decodes from the full address', () => {
		const addr = buildReplyToAddress(FULL, 'mail.sparks.agency');
		expect(addr).toMatch(/^reply\+[A-Za-z0-9_-]+@mail\.sparks\.agency$/);
		expect(decodeReplyTag(addr)).toEqual(FULL);
	});

	it('decodes from just the local part too', () => {
		const addr = buildReplyToAddress(FULL, 'mail.sparks.agency');
		expect(decodeReplyTag(addr.split('@')[0])).toEqual(FULL);
	});
});

describe('decodeReplyTag rejects garbage', () => {
	it('returns null when there is no + subaddress', () => {
		expect(decodeReplyTag('reply@mail.sparks.agency')).toBeNull();
	});

	it('returns null for an empty tag', () => {
		expect(decodeReplyTag('reply+@mail.sparks.agency')).toBeNull();
	});

	it('returns null for non-JSON base64 payloads', () => {
		expect(decodeReplyTag('reply+not-valid-base64-json@mail.sparks.agency')).toBeNull();
	});

	it('returns null when uid is missing or not a string', () => {
		const noUid = Buffer.from(JSON.stringify({ cid: 'c' })).toString('base64url');
		expect(decodeReplyTag(`reply+${noUid}`)).toBeNull();
		const numUid = Buffer.from(JSON.stringify({ uid: 7 })).toString('base64url');
		expect(decodeReplyTag(`reply+${numUid}`)).toBeNull();
	});

	it('drops non-string optional fields but keeps a valid uid', () => {
		const mixed = Buffer.from(JSON.stringify({ uid: 'u', cid: 99 })).toString('base64url');
		expect(decodeReplyTag(`reply+${mixed}`)).toEqual({
			uid: 'u', cid: undefined, pid: undefined, lid: undefined, aid: undefined,
		});
	});
});

describe('isReplyRoutingAddress', () => {
	it('matches our reply+ addresses on the inbound domain, case-insensitively', () => {
		expect(isReplyRoutingAddress('reply+abc@mail.sparks.agency', 'mail.sparks.agency')).toBe(true);
		expect(isReplyRoutingAddress('Reply+ABC@MAIL.SPARKS.AGENCY', 'mail.sparks.agency')).toBe(true);
	});

	it('rejects other senders and other domains', () => {
		expect(isReplyRoutingAddress('reply+abc@gmail.com', 'mail.sparks.agency')).toBe(false);
		expect(isReplyRoutingAddress('noreply@mail.sparks.agency', 'mail.sparks.agency')).toBe(false);
	});
});
