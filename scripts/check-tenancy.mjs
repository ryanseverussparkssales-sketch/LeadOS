#!/usr/bin/env node
/**
 * Tenancy guard — catches the bug class behind the IDORs found in the 2026 audit.
 *
 * Because every query uses `supabaseAdmin` (service role, which BYPASSES RLS),
 * tenant isolation lives entirely in app code. Two levels of finding:
 *
 *  FAIL — a supabaseAdmin UPDATE/DELETE with NO row filter at all. Hits every
 *         tenant's rows. Scanned across ALL of src/. Always exits 1.
 *
 *  WARN — a supabaseAdmin .update( / .delete( / .upsert( chain that HAS row
 *         filters, but none on an owner column (user_id / owner_user_id /
 *         owner_id / reviewer_user_id), AND no ownership evidence in the
 *         ~50 lines above it. Id-only filters (`.eq('id', params.id)`) cross
 *         tenants because the service role bypasses RLS — this is exactly the
 *         bug class behind the two real IDORs this level was added for.
 *         Scanned in HTTP entry points only (src/routes/** + src/hooks.server.ts);
 *         src/lib helpers receive ids from callers, so ownership is enforced at
 *         the route boundary (the FAIL level still covers lib).
 *
 *         Ownership evidence accepted in the lookback window:
 *           - an ownership helper call: verify*Owner* / require*Owned* / etc.
 *             (verifyCampaignOwner, verifyCallListOwner, verifyListOwner,
 *              verifyProjectOwner, requireOwnedStep, ...)
 *           - a webhook signature assertion (assertTwilioSignature /
 *             verifyTwilioSignature) — rows are then keyed by provider sids
 *             from a signed payload, not caller-chosen ids
 *           - an owner-column filter on a nearby read/mutation:
 *             `.eq('user_id', …)`, `.match({ user_id … })`, …
 *           - an owner-column equality check on a fetched row:
 *             `row.user_id !== ownerId`
 *           - an owner column in a nearby insert/upsert payload:
 *             `user_id: ownerId` (row ids created in-request under the owner)
 *
 * Exit codes / usage:
 *   node scripts/check-tenancy.mjs            → FAILs exit 1; WARNs are printed
 *                                               but exit 0 (informational)
 *   node scripts/check-tenancy.mjs --strict   → WARNs also exit 1 (CI ratchet:
 *                                               turn on once the WARN list is 0)
 *
 * Suppression:
 *   - `// tenancy-safe: <reason>` on the statement's first line or the line
 *     above it (works for both FAIL and WARN — existing convention, unchanged).
 *   - ALLOWLIST below for whole-route cases (cron sweeps, signed webhooks).
 *     Keep it SHORT and justified — prefer an owner filter at the call site.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const STRICT = process.argv.includes('--strict');

/**
 * ALLOWLIST — routes whose mutations legitimately carry no owner-column filter.
 * Entry: { file: <path prefix from src/>, pattern: <regex vs "OP table">, reason }.
 * Every entry below was verified by hand on 2026-07-04.
 */
const ALLOWLIST = [
	{
		// Cron sweeps run for ALL owners by design (daily counter resets etc.).
		// Auth: `Bearer ${CRON_SECRET}` checked at the top of every cron handler.
		// Rows are selected by system state, never by caller-supplied ids.
		file: 'src/routes/api/cron/',
		pattern: /.*/,
		reason: 'cron sweep: iterates all owners by design; CRON_SECRET-gated',
	},
	{
		// Twilio webhooks answered in the hook BEFORE resolve() (voice / recording /
		// status / phone/incoming...). X-Twilio-Signature is verified at the top of
		// handle() for every path in TWILIO_WEBHOOK_PATHS; mutations are keyed by
		// our own CallSid/CallId taken from the signed payload.
		file: 'src/hooks.server.ts',
		pattern: /.*/,
		reason: 'Twilio webhook fast-path: signature verified at top of handle(); rows keyed by our own call sid',
	},
	{
		// Twilio inbound-SMS webhook. assertTwilioSignature() runs before any row
		// is touched; the tenant is derived from the tenant-owned receiving
		// phone_numbers row, and message/thread rows are keyed by provider data.
		file: 'src/routes/api/sms/incoming/',
		pattern: /.*/,
		reason: 'Twilio SMS webhook: signature-verified; owner derived from receiving number row',
	},
	{
		// Stripe Connect webhook. Signature verified; the team_members row is
		// keyed by stripe_connect_account_id from the signed event payload.
		file: 'src/routes/api/stripe/webhook/',
		pattern: /.*/,
		reason: 'Stripe webhook: signature-verified; rows keyed by stripe ids from the event',
	},
];

function walk(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		const s = statSync(p);
		if (s.isDirectory()) walk(p, out);
		else if (/\.(ts|svelte)$/.test(name)) out.push(p);
	}
	return out;
}

// Filter methods that scope a statement to specific rows.
const FILTERS = /\.(eq|neq|in|or|match|gt|gte|lt|lte|like|ilike|contains|filter|textSearch|overlaps|rangeGt|rangeLt|cs|cd)\(/;
const MUTATION = /\.(update|delete)\(/;                 // FAIL level (unfiltered = catastrophic)
const MUTATION_WARN = /\.(update|delete|upsert)\(/;     // WARN level (filtered but not owner-scoped)

// Owner columns that scope a row to a tenant (substring match also covers
// owner_user_id / reviewer_user_id / sdr_user_id — intended).
const OWNER_COLS = /user_id|owner_user_id|owner_id|reviewer_user_id/;
// Ownership / signature helpers used across the API routes.
const OWNERSHIP_HELPER = /\b(?:(?:verify|assert|require)\w*Own\w*|(?:assert|verify)TwilioSignature)\s*\(/;
// Owner column used inside a supabase filter: .eq('user_id', …) / .match({ user_id … })
const OWNER_FILTER = /\.(?:eq|neq|in|match|filter)\(\s*[{'"`]?\s*['"`]?\w*?(?:user_id|owner_id)\b/;
// Owner-column equality check on a fetched row: `existing.user_id !== user.id`
const OWNER_COMPARE = /\.\w*(?:user_id|owner_id)\s*[!=]==?/;
// Owner column in an insert/upsert payload: `user_id: ownerId`
const OWNER_PAYLOAD = /\w*(?:user_id|owner_id)\s*:/;
const LOOKBACK_LINES = 50;

const failures = [];
const warnings = [];
const allowlisted = [];

for (const file of walk(ROOT)) {
	const src = readFileSync(file, 'utf8');
	const lines = src.split('\n');
	const relFile = file.replace(/.*[\\/]src[\\/]/, 'src/').replace(/\\/g, '/');
	// WARN level only applies to HTTP entry points (routes + hooks); lib helpers
	// get their ids from callers that own the request context.
	const warnScope = relFile.startsWith('src/routes/') || relFile === 'src/hooks.server.ts';

	// Walk each `supabaseAdmin.from(` occurrence; capture until the terminating ';'.
	const re = /supabaseAdmin\s*\.\s*from\(\s*['"`]([a-z_]+)['"`]\s*\)/g;
	let m;
	while ((m = re.exec(src))) {
		const start = m.index;
		const end = src.indexOf(';', start);
		const stmt = src.slice(start, end === -1 ? src.length : end);
		if (!MUTATION_WARN.test(stmt)) continue;

		const lineNo = src.slice(0, start).split('\n').length;
		// suppression: `// tenancy-safe` on this line or the one above
		const ctx = (lines[lineNo - 1] ?? '') + '\n' + (lines[lineNo - 2] ?? '');
		if (/tenancy-safe/.test(ctx)) continue;

		const table = m[1];
		const op = /\.delete\(/.test(stmt) ? 'DELETE' : /\.upsert\(/.test(stmt) ? 'UPSERT' : 'UPDATE';
		const hasFilters = FILTERS.test(stmt);

		// ---- FAIL: unfiltered update/delete (unchanged from the original check)
		if (MUTATION.test(stmt) && !hasFilters) {
			failures.push({ file: relFile, lineNo, table, op });
			continue;
		}

		// ---- WARN: filtered, but no owner column anywhere in the chain
		if (!warnScope) continue;
		if (!hasFilters) continue;               // upsert with no filters: insert-like, out of scope
		if (OWNER_COLS.test(stmt)) continue;     // owner-scoped (filter or payload) → ok

		// Lookback: ownership evidence within ~LOOKBACK_LINES above the statement.
		const winStart = Math.max(0, lineNo - 1 - LOOKBACK_LINES);
		const window = lines.slice(winStart, lineNo - 1).join('\n');
		const verified =
			OWNERSHIP_HELPER.test(window) ||
			OWNER_FILTER.test(window) ||
			OWNER_COMPARE.test(window) ||
			OWNER_PAYLOAD.test(window);
		if (verified) continue;

		const finding = { file: relFile, lineNo, table, op };
		const allow = ALLOWLIST.find(
			(a) => relFile.startsWith(a.file) && a.pattern.test(`${op} ${table}`)
		);
		if (allow) allowlisted.push({ ...finding, reason: allow.reason });
		else warnings.push(finding);
	}
}

// ---- Report ---------------------------------------------------------------
let exitCode = 0;

if (failures.length === 0) {
	console.log('✓ tenancy: no unscoped supabaseAdmin update/delete statements found');
} else {
	console.error(`✗ tenancy: ${failures.length} unscoped mutation(s) — each can hit EVERY tenant's rows:\n`);
	for (const f of failures) {
		console.error(`  ${f.op} ${f.table}  ${f.file}:${f.lineNo}`);
	}
	console.error(`\nAdd a row filter (.eq('user_id', …) etc.) or, if genuinely global and verified,`);
	console.error(`annotate the statement with  // tenancy-safe: <reason>`);
	exitCode = 1;
}

if (warnings.length === 0) {
	console.log('✓ tenancy: all filtered mutations are owner-scoped, ownership-verified, or allowlisted');
} else {
	console.error(`\n⚠ tenancy: ${warnings.length} WARN — mutation(s) filtered without an owner column (id-only filters cross tenants):\n`);
	for (const f of warnings) {
		console.error(`  WARN ${f.op} ${f.table}  ${f.file}:${f.lineNo}`);
	}
	console.error(`\nScope with .eq('user_id', …), verify ownership within ~${LOOKBACK_LINES} lines above`);
	console.error(`(verify*Owner helper / owner-scoped read), annotate // tenancy-safe: <reason>,`);
	console.error(`or add a justified ALLOWLIST entry in scripts/check-tenancy.mjs.`);
	if (STRICT) exitCode = exitCode || 1;
	else console.error(`(warnings do not fail the build — pass --strict to enforce)`);
}

if (allowlisted.length > 0) {
	console.log(`\ni tenancy: ${allowlisted.length} allowlisted mutation(s) (see ALLOWLIST in scripts/check-tenancy.mjs):`);
	for (const f of allowlisted) {
		console.log(`  ALLOW ${f.op} ${f.table}  ${f.file}:${f.lineNo} — ${f.reason}`);
	}
}

process.exit(exitCode);
