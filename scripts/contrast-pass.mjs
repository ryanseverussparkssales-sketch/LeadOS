#!/usr/bin/env node
/**
 * One-time accessibility pass: lift the pervasive dim text-color literals to
 * WCAG-AA-friendly shades on the near-black UI. ONLY rewrites `text-[#xxx]`
 * Tailwind utilities (never bg-/border-/placeholder-/inline styles), so it's a
 * pure text-contrast change with no layout or logic impact. Hierarchy preserved.
 *
 *   node scripts/contrast-pass.mjs          (apply)
 *   node scripts/contrast-pass.mjs --dry    (report only)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const DRY = process.argv.includes('--dry');

// old shade (contrast on black) → new shade (≈AA). Keeps the visual ordering.
const MAP = {
	'444': '6e6e6e', '444444': '6e6e6e', // ~2.0:1 → ~3.6:1 (tiny/tertiary)
	'555': '7c7c7c', '555555': '7c7c7c', // ~2.8:1 → ~4.9:1 ✓ AA
	'666': '8a8a8a', '666666': '8a8a8a', // ~3.6:1 → ~6.0:1 ✓
	'777': '9a9a9a', '777777': '9a9a9a', // ✓
};

function walk(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		statSync(p).isDirectory() ? walk(p, out) : /\.(svelte|ts)$/.test(name) && out.push(p);
	}
	return out;
}

let filesChanged = 0;
let total = 0;
for (const file of walk(ROOT)) {
	let src = readFileSync(file, 'utf8');
	const before = src;
	// Only the text-[#hex] form. Case-insensitive hex.
	src = src.replace(/text-\[#([0-9a-fA-F]{3,6})\]/g, (m, hex) => {
		const key = hex.toLowerCase();
		if (MAP[key]) {
			total++;
			return `text-[#${MAP[key]}]`;
		}
		return m;
	});
	if (src !== before) {
		filesChanged++;
		if (!DRY) writeFileSync(file, src);
	}
}

console.log(`${DRY ? '[dry] ' : ''}contrast pass: ${total} text-color literals lifted across ${filesChanged} files`);
