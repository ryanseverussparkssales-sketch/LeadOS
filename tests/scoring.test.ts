/**
 * Initial lead scoring — src/lib/server/scoring.ts (pure).
 */
import { describe, it, expect } from 'vitest';
import { initialContactScore } from '$lib/server/scoring';

describe('initialContactScore', () => {
	it('bare lead with no data scores the 35 base', () => {
		expect(initialContactScore({})).toBe(35);
	});

	it('contact_type sets the base: prospect 55, customer 75', () => {
		expect(initialContactScore({ contact_type: 'prospect' })).toBe(55);
		expect(initialContactScore({ contact_type: 'customer' })).toBe(75);
		expect(initialContactScore({ contact_type: 'lead' })).toBe(35);
	});

	it('completeness bonuses: phone +15, email +8, company +5', () => {
		expect(initialContactScore({ phone: '555-1212' })).toBe(50);
		expect(initialContactScore({ email: 'a@b.com' })).toBe(43);
		expect(initialContactScore({ company: 'Acme' })).toBe(40);
		expect(initialContactScore({ phone: '5', email: 'a@b.c', company: 'A' })).toBe(63);
	});

	it('whitespace-only values earn no bonus', () => {
		expect(initialContactScore({ phone: '   ', email: '\t', company: ' ' })).toBe(35);
	});

	it('source bonuses: referral +10, website/linkedin +5, unknown +0', () => {
		expect(initialContactScore({ lead_source: 'referral' })).toBe(45);
		expect(initialContactScore({ lead_source: 'website' })).toBe(40);
		expect(initialContactScore({ lead_source: 'linkedin' })).toBe(40);
		expect(initialContactScore({ lead_source: 'cold_list' })).toBe(35);
	});

	it('caps at 100 (customer with everything = 113 raw)', () => {
		expect(
			initialContactScore({
				contact_type: 'customer',
				phone: '555',
				email: 'a@b.com',
				company: 'Acme',
				lead_source: 'referral',
			}),
		).toBe(100);
	});
});
