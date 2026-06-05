/**
 * SSRF protection for server-side fetches of user-supplied URLs.
 *
 * Without this, an endpoint that fetches a URL from the request body can be
 * coerced into hitting internal services — cloud metadata (169.254.169.254),
 * localhost admin ports, or RFC1918 hosts. We allow only http/https to public
 * IPs: the hostname is resolved and every resolved address is checked against
 * private/reserved ranges, and redirects are followed manually so each hop is
 * re-validated (a public host can 302 to an internal one).
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { error } from '@sveltejs/kit';

function ipv4ToLong(ip: string): number | null {
	const parts = ip.split('.');
	if (parts.length !== 4) return null;
	let n = 0;
	for (const p of parts) {
		const o = Number(p);
		if (!Number.isInteger(o) || o < 0 || o > 255) return null;
		n = n * 256 + o;
	}
	return n >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
	const n = ipv4ToLong(ip);
	if (n === null) return true; // unparseable → treat as unsafe
	const inRange = (a: string, bits: number) => {
		const base = ipv4ToLong(a)!;
		const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
		return (n & mask) === (base & mask);
	};
	return (
		inRange('0.0.0.0', 8) ||        // "this" network
		inRange('10.0.0.0', 8) ||       // private
		inRange('100.64.0.0', 10) ||    // CGNAT
		inRange('127.0.0.0', 8) ||      // loopback
		inRange('169.254.0.0', 16) ||   // link-local + cloud metadata
		inRange('172.16.0.0', 12) ||    // private
		inRange('192.0.0.0', 24) ||     // IETF protocol assignments
		inRange('192.168.0.0', 16) ||   // private
		inRange('198.18.0.0', 15) ||    // benchmarking
		inRange('224.0.0.0', 4) ||      // multicast
		inRange('240.0.0.0', 4)         // reserved
	);
}

function isPrivateIPv6(ip: string): boolean {
	const addr = ip.toLowerCase().split('%')[0]; // strip zone id
	if (addr === '::1' || addr === '::') return true;
	if (addr.startsWith('fe80')) return true;                 // link-local
	if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique local fc00::/7
	// IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4
	const m = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (m) return isPrivateIPv4(m[1]);
	return false;
}

function isPrivateAddress(ip: string): boolean {
	const v = isIP(ip);
	if (v === 4) return isPrivateIPv4(ip);
	if (v === 6) return isPrivateIPv6(ip);
	return true; // not an IP → unsafe
}

/**
 * Validate a URL is safe to fetch: http(s) scheme, and the host resolves only to
 * public IP addresses. Throws 400 on any violation. Returns the parsed URL.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw error(400, 'Invalid URL');
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw error(400, 'Only http and https URLs are allowed');
	}

	const host = url.hostname.replace(/^\[|\]$/g, ''); // unwrap IPv6 literal
	if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(url.hostname)) {
		throw error(400, 'URL host is not allowed');
	}

	// If host is a literal IP, check it directly; otherwise resolve all addresses.
	if (isIP(host)) {
		if (isPrivateAddress(host)) throw error(400, 'URL resolves to a private address');
		return url;
	}

	let resolved: { address: string }[];
	try {
		resolved = await lookup(host, { all: true });
	} catch {
		throw error(400, 'Could not resolve URL host');
	}
	if (!resolved.length) throw error(400, 'Could not resolve URL host');
	for (const { address } of resolved) {
		if (isPrivateAddress(address)) throw error(400, 'URL resolves to a private address');
	}
	return url;
}

/**
 * Fetch a user-supplied URL with SSRF protection. Redirects are followed manually
 * (up to `maxRedirects`) and every hop is re-validated against private ranges.
 */
export async function safeFetch(
	rawUrl: string,
	init: RequestInit = {},
	opts: { maxRedirects?: number } = {}
): Promise<Response> {
	const maxRedirects = opts.maxRedirects ?? 3;
	let current = rawUrl;

	for (let i = 0; i <= maxRedirects; i++) {
		const url = await assertPublicUrl(current);
		const res = await fetch(url, { ...init, redirect: 'manual' });

		if (res.status >= 300 && res.status < 400) {
			const location = res.headers.get('location');
			if (!location) return res;
			current = new URL(location, url).href; // resolve relative redirects, re-validate next loop
			continue;
		}
		return res;
	}
	throw error(400, 'Too many redirects');
}
