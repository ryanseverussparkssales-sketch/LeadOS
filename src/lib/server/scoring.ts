/**
 * Quick initial score for newly created contacts.
 * Full scoring (with call history, deals, outcomes) runs via /api/contacts/score or daily cron.
 */
export function initialContactScore(contact: {
	contact_type?: string | null;
	phone?: string | null;
	email?: string | null;
	company?: string | null;
	lead_source?: string | null;
}): number {
	let score = 35;

	// Contact type base
	if (contact.contact_type === 'prospect') score = 55;
	else if (contact.contact_type === 'customer') score = 75;

	// Contact completeness bonuses
	if (contact.phone?.trim()) score += 15;
	if (contact.email?.trim()) score += 8;
	if (contact.company?.trim()) score += 5;

	// Source bonuses (warm sources score higher)
	if (contact.lead_source === 'referral') score += 10;
	else if (contact.lead_source === 'website') score += 5;
	else if (contact.lead_source === 'linkedin') score += 5;

	return Math.min(score, 100);
}
