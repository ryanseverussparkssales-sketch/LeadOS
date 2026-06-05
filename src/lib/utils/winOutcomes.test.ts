import { describe, it, expect } from 'vitest';
import { isWin, isPayableWin, WIN_OUTCOMES, PAYABLE_WIN_OUTCOMES } from './winOutcomes';

describe('winOutcomes', () => {
	it('classifies wins', () => {
		expect(isWin('appointment_set')).toBe(true);
		expect(isWin('callback')).toBe(true);
		expect(isWin('not_interested')).toBe(false);
		expect(isWin(null)).toBe(false);
		expect(isWin(undefined)).toBe(false);
	});

	it('treats payable wins as a strict subset of all wins', () => {
		for (const o of PAYABLE_WIN_OUTCOMES) expect(WIN_OUTCOMES.has(o)).toBe(true);
		expect(isPayableWin('appointment_set')).toBe(true);
		expect(isPayableWin('callback')).toBe(false); // a win, but not payable
	});
});
