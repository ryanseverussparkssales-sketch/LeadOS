/**
 * Normalize a phone number to E.164-ish (`+<digits>`), US-defaulted.
 * Pure / dependency-free so it's unit-testable (the server copy in
 * $lib/server/supabase re-exports this).
 */
export function normalizePhone(phone: string): string {
	const digits = (phone ?? '').replace(/\D/g, '');
	if (digits.length === 10) return `+1${digits}`;
	if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
	return `+${digits}`;
}
