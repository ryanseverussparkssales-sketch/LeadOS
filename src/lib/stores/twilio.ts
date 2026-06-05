/**
 * Global Twilio Device store.
 * The device lives here so it persists across page navigation.
 * Dialer.svelte reads from this store instead of managing its own device.
 *
 * Handles:
 * - Device registration on app load
 * - Token refresh before expiry (via tokenWillExpire event)
 * - Incoming call events dispatched globally via window CustomEvent
 * - Active call tracking
 */

import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

// ── Types ─────────────────────────────────────────────────────────────────────
export type TwilioCallState = 'idle' | 'ringing' | 'calling' | 'processing' | 'postmortem';

export interface IncomingCallInfo {
	call: any; // Twilio Call object
	from: string; // Caller's number
	to: string; // Which of our numbers was called
	contactName: string | null;
	contactId: string | null;
	receivedAt: number;
}

// ── Stores ────────────────────────────────────────────────────────────────────
export const twilioDevice = writable<any>(null);
export const twilioReady = writable<boolean>(false);
export const twilioError = writable<string | null>(null);
export const incomingCall = writable<IncomingCallInfo | null>(null);
export const activeCall = writable<any>(null);

// ── Internal state ────────────────────────────────────────────────────────────
let tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let deviceInitialized = false;

// ── Token management ──────────────────────────────────────────────────────────
async function fetchToken(): Promise<string | null> {
	try {
		const { apiFetch } = await import('$lib/api');
		// Token endpoint requires POST (matches +server.ts handler)
		const res = await apiFetch('/api/twilio/token', { method: 'POST' });
		if (!res.ok) return null;
		const data = await res.json();
		return data.token ?? null;
	} catch {
		return null;
	}
}

function scheduleTokenRefresh(expiresInSeconds = 3600) {
	if (tokenRefreshTimer) clearTimeout(tokenRefreshTimer);
	// Refresh 5 minutes before expiry
	const refreshIn = Math.max((expiresInSeconds - 300) * 1000, 10_000);
	tokenRefreshTimer = setTimeout(async () => {
		const device = get(twilioDevice);
		if (!device) return;
		const newToken = await fetchToken();
		if (newToken) {
			try {
				device.updateToken(newToken);
				scheduleTokenRefresh(expiresInSeconds);
			} catch {
				/* ignore */
			}
		}
	}, refreshIn);
}

// ── Device initialization ─────────────────────────────────────────────────────
export async function initTwilioDevice(): Promise<void> {
	if (!browser || deviceInitialized) return;
	// Claim the slot SYNCHRONOUSLY (before any await) so a second concurrent caller —
	// e.g. the Dialer and the layout both calling on load — bails here instead of
	// building a second Device that knocks the first offline and rejects incoming calls.
	deviceInitialized = true;

	const token = await fetchToken();
	if (!token) {
		deviceInitialized = false;
		twilioError.set(
			'Could not get Twilio token — check TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, and TWILIO_APP_SID in Settings'
		);
		return;
	}

	try {
		// Best practice: request mic permission BEFORE creating device so errors surface early
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			stream.getTracks().forEach(t => t.stop()); // stop immediately — just checking permission
		} catch (micErr) {
			deviceInitialized = false;
			twilioError.set('Microphone access denied. Allow mic access in your browser and try again.');
			return;
		}

		const { Device } = await import('@twilio/voice-sdk');

		const device = new Device(token, {
			logLevel: 4, // ERROR only in production
			codecPreferences: ['opus', 'pcmu'] as any,
			// Prevent 10004 "multiple instances" error when already on a call
			allowIncomingWhileBusy: false,
			// Fire tokenWillExpire 30s before expiry (not the default 10s)
			tokenRefreshMs: 30000,
		});

		// ── Event handlers ────────────────────────────────────────────────────
		device.on('registered', () => {
			console.log('[edelhaus] ✅ device REGISTERED — ready to receive incoming');
			twilioReady.set(true);
			twilioError.set(null);
		});

		device.on('unregistered', () => {
			twilioReady.set(false);
			// Auto re-register — connection dropped or token expired
			setTimeout(async () => {
				const newToken = await fetchToken();
				if (newToken) {
					try { device.updateToken(newToken); await device.register(); } catch { /* ignore */ }
				}
			}, 3000);
		});

		device.on('error', (err: any) => {
			console.error('[twilio-store] device error:', err);

			if (err.code === 20104 || err.code === 20101) {
				// 20104 = AccessTokenExpired, 20101 = token invalid
				// Auto-recover silently — never show the error banner for token issues
				console.warn('[twilio-store] token issue (', err.code, ') — auto re-initialising in 1.5s');
				deviceInitialized = false;
				twilioDevice.set(null);
				twilioReady.set(false);
				if (tokenRefreshTimer) { clearTimeout(tokenRefreshTimer); tokenRefreshTimer = null; }
				setTimeout(() => initTwilioDevice(), 1500);
				return; // swallow — no error UI shown
			} else if (err.code === 31005) {
				twilioError.set(
					'Twilio: Connection error. Check your internet connection and microphone permissions.'
				);
			} else {
				twilioError.set(err.message ?? 'Twilio error');
			}
		});

		// Twilio fires this ~1 minute before token expiry
		device.on('tokenWillExpire', async () => {
			const newToken = await fetchToken();
			if (newToken) {
				try {
					device.updateToken(newToken);
				} catch {
					/* ignore */
				}
			}
		});

		// ── INCOMING CALL HANDLER ─────────────────────────────────────────────
		device.on('incoming', async (call: any) => {
			const from: string = call.parameters?.From ?? '';
			const to: string = call.parameters?.To ?? '';
			console.log('[edelhaus] 📞 INCOMING call reached the browser — from', from, 'to', to);

			// Try to match caller to a contact
			let contactName: string | null = null;
			let contactId: string | null = null;

			try {
				const { apiFetch } = await import('$lib/api');
				const r = await apiFetch(
					`/api/contacts/filtered?search=${encodeURIComponent(from)}&limit=1`
				);
				if (r.ok) {
					const d = await r.json();
					const match = d.data?.[0];
					if (match) {
						contactName = match.name;
						contactId = match.id;
					}
				}
			} catch {
				/* non-fatal — contactName stays null */
			}

			// Set incoming call info in the store
			incomingCall.set({ call, from, to, contactName, contactId, receivedAt: Date.now() });

			// Dispatch global event so any page/component can react without importing this store
			window.dispatchEvent(
				new CustomEvent('leados:incoming-call', {
					detail: { from, to, contactName, contactId }
				})
			);

			// Auto-cleanup if the caller hangs up before we answer
			const autoRejectTimer = setTimeout(() => {
				const current = get(incomingCall);
				if (current?.call === call) {
					incomingCall.set(null);
				}
			}, 30_000);

			call.on('cancel', () => {
				clearTimeout(autoRejectTimer);
				incomingCall.set(null);
				window.dispatchEvent(new CustomEvent('leados:call-cancelled'));
			});

			call.on('accept', () => {
				clearTimeout(autoRejectTimer);
				activeCall.set(call);
			});

			call.on('disconnect', () => {
				activeCall.set(null);
				incomingCall.set(null);
			});

			// Voice Insights — surface call quality warnings
			call.on('warning', (name: string) => {
				console.warn('[twilio] call quality warning:', name);
				window.dispatchEvent(new CustomEvent('leados:call-quality-warning', { detail: { warning: name } }));
			});
			call.on('warning-cleared', (name: string) => {
				window.dispatchEvent(new CustomEvent('leados:call-quality-cleared', { detail: { warning: name } }));
			});
		});

		try {
			await device.register();
		} catch (regErr) {
			deviceInitialized = false;
			const msg = regErr instanceof Error ? regErr.message : String(regErr);
			twilioError.set(
				`Twilio registration failed: ${msg}. Make sure your browser allows microphone access and WebRTC connections.`
			);
			return;
		}

		twilioDevice.set(device);
		deviceInitialized = true;
		scheduleTokenRefresh();
	} catch (err: any) {
		deviceInitialized = false;
		const msg = err instanceof Error ? err.message : String(err);
		console.error('[twilio-store] init failed:', err);
		if (msg.includes('microphone') || msg.includes('permission') || msg.includes('NotAllowed')) {
			twilioError.set('Microphone access denied. Allow microphone access in your browser settings and click Retry.');
		} else {
			twilioError.set(msg || 'Twilio initialization failed. Click Retry.');
		}
	}
}

export async function destroyDevice(): Promise<void> {
	const device = get(twilioDevice);
	if (device) {
		try { device.destroy(); } catch { /* ignore */ }
		twilioDevice.set(null);
		twilioReady.set(false);
		deviceInitialized = false;
		if (tokenRefreshTimer) { clearTimeout(tokenRefreshTimer); tokenRefreshTimer = null; }
	}
}

/** Answer the current incoming call */
export async function answerIncomingCall(): Promise<void> {
	const { get } = await import('svelte/store');
	const current = get(incomingCall);
	if (!current?.call) return;
	try {
		current.call.accept();
		activeCall.set(current.call);
		incomingCall.set(null);
	} catch (err) {
		console.error('[twilio] answerIncomingCall error:', err);
	}
}

/** Reject the current incoming call */
export async function rejectIncomingCall(): Promise<void> {
	const { get } = await import('svelte/store');
	const current = get(incomingCall);
	if (!current?.call) return;
	try {
		current.call.reject();
		incomingCall.set(null);
	} catch (err) {
		console.error('[twilio] rejectIncomingCall error:', err);
	}
}
