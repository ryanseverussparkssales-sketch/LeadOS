#!/usr/bin/env node
/**
 * Tenancy guard — catches the bug class behind the IDORs found in the 2026 audit.
 *
 * Because every query uses `supabaseAdmin` (service role, which BYPASSES RLS),
 * tenant isolation lives entirely in app code. The most dangerous mistake is a
 * mutation (UPDATE / DELETE) that targets rows with NO filter at all — it hits
 * every tenant's data. This scanner flags those.
 *
 * It is intentionally high-signal (only unfiltered update/delete), not a full
 * ownership prover. Suppress a verified-safe case with `// tenancy-safe: <reason>`
 * on the statement's first line or the line above it.
 *
 *   node scripts/check-tenancy.mjs        → exit 1 if any unsuppressed findings
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

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
const MUTATION = /\.(update|delete)\(/;

const findings = [];

for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');

  // Walk each `supabaseAdmin.from(` occurrence; capture until the terminating ';'.
  const re = /supabaseAdmin\s*\.\s*from\(\s*['"`]([a-z_]+)['"`]\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index;
    const end = src.indexOf(';', start);
    const stmt = src.slice(start, end === -1 ? src.length : end);
    if (!MUTATION.test(stmt)) continue;     // only update/delete are catastrophic unscoped
    if (FILTERS.test(stmt)) continue;       // has at least one row filter → ok here

    const lineNo = src.slice(0, start).split('\n').length;
    // suppression: `// tenancy-safe` on this line or the one above
    const ctx = (lines[lineNo - 1] ?? '') + '\n' + (lines[lineNo - 2] ?? '');
    if (/tenancy-safe/.test(ctx)) continue;

    const table = m[1];
    const op = /\.delete\(/.test(stmt) ? 'DELETE' : 'UPDATE';
    findings.push({ file: file.replace(/.*[\\/]src[\\/]/, 'src/'), lineNo, table, op });
  }
}

if (findings.length === 0) {
  console.log('✓ tenancy: no unscoped supabaseAdmin update/delete statements found');
  process.exit(0);
}

console.error(`✗ tenancy: ${findings.length} unscoped mutation(s) — each can hit EVERY tenant's rows:\n`);
for (const f of findings) {
  console.error(`  ${f.op} ${f.table}  ${f.file}:${f.lineNo}`);
}
console.error(`\nAdd a row filter (.eq('user_id', …) etc.) or, if genuinely global and verified,`);
console.error(`annotate the statement with  // tenancy-safe: <reason>`);
process.exit(1);
