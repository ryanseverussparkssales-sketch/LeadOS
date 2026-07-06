/**
 * Single source of truth for product branding.
 * The platform brand is RogueOS; the managed-service brand is RogueLeads.
 * (Historical strings "Edelhaus" / "rogueos-mvp" / "leadosuite" predate this.)
 */
export const BRAND = 'RogueOS';
export const AGENCY_BRAND = 'RogueLeads';
/** Used in <title> tags: `${pageName} — ${BRAND}` */
export const titleFor = (page: string) => `${page} — ${BRAND}`;
/** ICS PRODID / email footers */
export const PRODID = `-//${BRAND}//EN`;
