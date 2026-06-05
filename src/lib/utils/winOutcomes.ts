/**
 * Single source of truth for "what counts as a win".
 *
 * Replaces the duplicated/diverging Set literals defined inline across ~16 files
 * (dialer, payouts, agency, reports, calls/[id], etc.), which let "what counts as
 * a win" drift between the UI and the payout/reporting logic.
 */

/** All win outcomes (used for campaign win-count + reporting). */
export const WIN_OUTCOMES = new Set<string>([
	'appointment_set', 'demo_scheduled', 'meeting_confirmed', 'signed_up',
	'callback', 'follow_up_agreed', 'referral', 'proposal_requested',
]);

/** The subset that triggers client notifications / Discord / celebrations. */
export const PAYABLE_WIN_OUTCOMES = new Set<string>([
	'appointment_set', 'demo_scheduled', 'meeting_confirmed', 'signed_up',
]);

export function isWin(outcome: string | null | undefined): boolean {
	return !!outcome && WIN_OUTCOMES.has(outcome);
}

export function isPayableWin(outcome: string | null | undefined): boolean {
	return !!outcome && PAYABLE_WIN_OUTCOMES.has(outcome);
}
