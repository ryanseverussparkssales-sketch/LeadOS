import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface SpotifyState {
    connected: boolean;
    playing: boolean;
    track: { name: string; artist: string; album: string; image: string | null; id: string } | null;
    bpm: number;
    energy: number;
    progress_ms: number;
    duration_ms: number;
    error?: string;
}

const defaultState: SpotifyState = {
    connected: false, playing: false, track: null,
    bpm: 120, energy: 0.5, progress_ms: 0, duration_ms: 1
};

export const spotifyState = writable<SpotifyState>(defaultState);
export const spotifyLoading = writable(false);

let pollInterval: ReturnType<typeof setInterval> | null = null;
let subscribers = 0;

async function fetchSpotify() {
    if (!browser) return;
    try {
        const { apiFetch } = await import('$lib/api');
        const r = await apiFetch('/api/spotify/now-playing');
        if (r.ok) {
            const d = await r.json();
            spotifyState.set({
                connected: d.connected ?? false,
                playing: d.playing ?? false,
                track: d.track ?? null,
                bpm: d.bpm ?? 120,
                energy: d.energy ?? 0.5,
                progress_ms: d.progress_ms ?? 0,
                duration_ms: d.duration_ms ?? 1,
            });
        }
    } catch (e) {
        console.error('[spotify store] fetch error:', e);
    }
}

// Subscribe/unsubscribe pattern — only polls when at least one widget is mounted
export function useSpotify() {
    subscribers++;
    if (subscribers === 1 && browser) {
        fetchSpotify(); // immediate fetch
        pollInterval = setInterval(fetchSpotify, 5000); // single shared poll
    }
    return () => {
        subscribers--;
        if (subscribers === 0 && pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    };
}
