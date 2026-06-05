/**
 * Canonical quote-aware CSV parser.
 *
 * Replaces the ~5 divergent ad-hoc parsers across the app (naive `split(',')`
 * versions silently corrupt rows with quoted commas / newlines). Handles
 * quoted fields, escaped quotes (`""`), and CRLF.
 */
export function parseCsvLine(line: string): string[] {
	const out: string[] = [];
	let cur = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '"') {
			if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
			else inQuotes = !inQuotes;
		} else if (c === ',' && !inQuotes) {
			out.push(cur);
			cur = '';
		} else {
			cur += c;
		}
	}
	out.push(cur);
	return out;
}

/** Parse a full CSV document into rows of cells (header row included). */
export function parseCsv(text: string): string[][] {
	return text
		.replace(/\r\n/g, '\n')
		.split('\n')
		.filter((l) => l.length > 0)
		.map(parseCsvLine);
}
