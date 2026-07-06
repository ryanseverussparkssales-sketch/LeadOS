/**
 * Wave C3 — typed form-validation foundation.
 *
 * Framework-agnostic zod schemas shared across the app. Import these on the
 * client (for pre-submit validation) or in any future server route (for
 * request-body validation) — they carry no Svelte/SvelteKit dependency.
 *
 * Pattern for client forms (SPA-style, `apiFetch` POST):
 *
 *   import { bookingLinkSchema } from '$lib/schemas';
 *   const parsed = bookingLinkSchema.safeParse(payload);
 *   if (!parsed.success) {
 *     fieldErrors = flattenErrors(parsed.error);
 *     return;
 *   }
 *   await apiFetch('/api/...', { method: 'POST', body: JSON.stringify(parsed.data) });
 */

import { z } from 'zod';

/** A single "HH:MM"–"HH:MM" availability window, as sent to the booking API. */
export const timeWindowTupleSchema = z
	.tuple([
		z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
		z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
	])
	.refine(([start, end]) => end > start, {
		message: 'End time must be after start time',
	});

/**
 * Weekly availability: a map of weekday key → list of [start, end] windows.
 * Only enabled days appear as keys. At least one day with one window is required.
 */
export const availabilitySchema = z
	.record(z.string(), z.array(timeWindowTupleSchema))
	.refine((av) => Object.values(av).some((wins) => wins.length > 0), {
		message: 'Enable at least one day with at least one time window',
	});

/** Booking-link create payload — mirrors POST /api/booking/links. */
export const bookingLinkSchema = z.object({
	title: z.string().trim().min(1, 'Title is required').max(120, 'Title is too long'),
	description: z.string().trim().max(500, 'Description is too long').optional(),
	duration_minutes: z
		.number({ invalid_type_error: 'Duration must be a number' })
		.int('Duration must be a whole number')
		.min(5, 'Duration must be at least 5 minutes')
		.max(480, 'Duration must be 480 minutes or less'),
	timezone: z.string().min(1, 'Timezone is required'),
	buffer_minutes: z
		.number({ invalid_type_error: 'Buffer must be a number' })
		.int('Buffer must be a whole number')
		.min(0, 'Buffer cannot be negative')
		.max(120, 'Buffer must be 120 minutes or less'),
	max_days_ahead: z
		.number({ invalid_type_error: 'Booking horizon must be a number' })
		.int('Booking horizon must be a whole number')
		.min(1, 'Must allow booking at least 1 day ahead')
		.max(60, 'Booking horizon must be 60 days or less'),
	availability: availabilitySchema,
});
export type BookingLinkInput = z.infer<typeof bookingLinkSchema>;

/** Deal pipeline stages (matches VALID_STAGES in the deals API). */
export const DEAL_STAGES = [
	'prospect',
	'qualified',
	'demo',
	'proposal',
	'negotiation',
	'won',
	'lost',
] as const;
export const dealStageSchema = z.enum(DEAL_STAGES);
export type DealStage = z.infer<typeof dealStageSchema>;

/** Deal create payload — mirrors POST /api/deals. */
export const dealSchema = z.object({
	title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long'),
	value: z
		.number({ invalid_type_error: 'Value must be a number' })
		.min(0, 'Value cannot be negative'),
	stage: dealStageSchema.optional(),
	probability: z.number().int().min(0).max(100).optional(),
	contactId: z.string().optional(),
	clientId: z.string().optional(),
	campaignId: z.string().optional(),
	expectedClose: z.string().optional(),
	notes: z.string().max(2000, 'Notes are too long').optional(),
});
export type DealInput = z.infer<typeof dealSchema>;

/**
 * Contact create payload — mirrors POST /api/contacts/create.
 * Name is required (1–120); email is optional but must be a valid address when
 * present; the remaining fields are free-form optional strings.
 */
export const contactSchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
	email: z
		.string()
		.trim()
		.max(200, 'Email is too long')
		.email('Enter a valid email address')
		.optional()
		.or(z.literal('')),
	phone: z.string().trim().max(40, 'Phone is too long').optional(),
	company: z.string().trim().max(200, 'Company is too long').optional(),
	title: z.string().trim().max(200, 'Title is too long').optional(),
	notes: z.string().trim().max(2000, 'Notes are too long').optional(),
});
export type ContactInput = z.infer<typeof contactSchema>;

/**
 * Flatten a ZodError into a flat `{ fieldName: firstMessage }` map suitable
 * for inline rendering next to inputs. Uses the top-level field name as key.
 */
export function flattenErrors(error: z.ZodError): Record<string, string> {
	const out: Record<string, string> = {};
	const { fieldErrors, formErrors } = error.flatten();
	for (const [field, msgs] of Object.entries(fieldErrors)) {
		if (msgs && msgs.length) out[field] = msgs[0];
	}
	if (formErrors.length && !out._form) out._form = formErrors[0];
	return out;
}
