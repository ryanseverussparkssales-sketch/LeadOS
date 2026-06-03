import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
	auth: {
		// Automatically refresh the JWT before it expires. This is the default
		// but we make it explicit so the intent is clear.
		autoRefreshToken: true,
		persistSession: true,
		detectSessionInUrl: true,
	},
});

export async function signUp(email: string, password: string) {
	const { data, error } = await supabase.auth.signUp({ email, password });
	if (error) throw error;
	return data;
}

export async function signIn(email: string, password: string) {
	const { data, error } = await supabase.auth.signInWithPassword({ email, password });
	if (error) throw error;
	return data;
}

export async function signOut() {
	// Never throw on sign-out — if the network is down we still want to clear
	// local state and send the user back to the login screen.
	try {
		await supabase.auth.signOut();
	} catch {
		// Swallow — the local session will be cleared regardless.
	}
}

export async function getSession() {
	try {
		const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
		if (!refreshError && refreshData.session) return refreshData.session;
		const { data, error } = await supabase.auth.getSession();
		if (error) { console.warn('[auth] getSession error:', error.message); return null; }
		return data.session;
	} catch (err) {
		console.warn('[auth] getSession threw:', err);
		return null;
	}
}

export async function getUser() {
	try {
		const { data } = await supabase.auth.getUser();
		return data.user;
	} catch {
		return null;
	}
}
