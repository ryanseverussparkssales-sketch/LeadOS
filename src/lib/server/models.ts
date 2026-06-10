/**
 * Central Claude model IDs. Use these constants instead of scattering string
 * literals across call sites — a wrong/outdated string only fails at runtime,
 * and one place makes upgrades a one-line change.
 *
 * Verified against Anthropic's current (2026) lineup:
 *   Opus 4.8, Sonnet 4.6, Haiku 4.5. The codebase previously used
 *   `claude-opus-4-6` in the scraper vision call — corrected to current Opus here.
 */
export const MODELS = {
	/** High-volume, low-cost: summaries, scoring, drafts, the dashboard assistant. */
	haiku: 'claude-haiku-4-5-20251001',
	/** Heavier generation: reports, longer drafts. */
	sonnet: 'claude-sonnet-4-6',
	/** Most capable: vision extraction, hardest reasoning. */
	opus: 'claude-opus-4-8',
} as const;

export type ClaudeModel = (typeof MODELS)[keyof typeof MODELS];
