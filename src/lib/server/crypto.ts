/**
 * AES-256-GCM vault encryption.
 * Stored format: base64(iv):base64(authTag):base64(ciphertext)
 *
 * Setup: add to .env.local →
 *   VAULT_ENCRYPTION_KEY=<64 hex chars = 32 bytes>
 *   Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { VAULT_ENCRYPTION_KEY } from '$env/static/private';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;   // 96-bit IV (GCM recommended)

function getKey(): Buffer {
	const rawKey = VAULT_ENCRYPTION_KEY ?? '';
	if (!rawKey || rawKey.length < 64) {
		throw new Error('VAULT_ENCRYPTION_KEY must be a 64-character hex string. Set it in your environment variables.');
	}
	return Buffer.from(rawKey.slice(0, 64), 'hex');
}

export function encryptValue(plaintext: string): string {
	const key = getKey();
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGO, key, iv);

	const encrypted = Buffer.concat([
		cipher.update(plaintext, 'utf8'),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();

	return [
		iv.toString('base64'),
		authTag.toString('base64'),
		encrypted.toString('base64'),
	].join(':');
}

export function decryptValue(stored: string): string {
	if (!stored || !stored.includes(':')) return stored; // legacy plaintext

	const parts = stored.split(':');
	if (parts.length !== 3) return stored;

	try {
		const key = getKey();
		const iv      = Buffer.from(parts[0], 'base64');
		const authTag = Buffer.from(parts[1], 'base64');
		const cipher  = Buffer.from(parts[2], 'base64');

		const decipher = createDecipheriv(ALGO, key, iv);
		decipher.setAuthTag(authTag);

		return Buffer.concat([
			decipher.update(cipher),
			decipher.final(),
		]).toString('utf8');
	} catch {
		// Decryption failed — treat as legacy plaintext
		return stored;
	}
}
