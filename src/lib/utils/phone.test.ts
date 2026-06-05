import { describe, it, expect } from 'vitest';
import { normalizePhone } from './phone';

describe('normalizePhone', () => {
	it('prefixes +1 to a bare 10-digit US number', () => {
		expect(normalizePhone('6125550123')).toBe('+16125550123');
	});

	it('handles a formatted 10-digit number', () => {
		expect(normalizePhone('(612) 555-0123')).toBe('+16125550123');
	});

	it('keeps an 11-digit number starting with 1', () => {
		expect(normalizePhone('16125550123')).toBe('+16125550123');
	});

	it('preserves an already-E.164 number (strips non-digits, re-adds +)', () => {
		expect(normalizePhone('+1 612 555 0123')).toBe('+16125550123');
	});

	it('falls back to +<digits> for non-US lengths', () => {
		expect(normalizePhone('447911123456')).toBe('+447911123456');
	});

	it('handles empty / junk input without throwing', () => {
		expect(normalizePhone('')).toBe('+');
		expect(normalizePhone('abc')).toBe('+');
	});
});
