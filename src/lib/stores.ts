import { writable } from 'svelte/store';
import type { User } from '@supabase/supabase-js';

export type CallState = 'idle' | 'ringing' | 'calling' | 'processing' | 'postmortem';

export interface Contact {
	id: string;
	name: string;
	phone: string;
	phone_normalized?: string;
	company: string;
	title: string;
	email?: string;
	status: string;
	call_count: number;
	last_called_at?: string;
	tags?: Tag[];
	// Extended fields from DB
	contact_type?: string;
	is_business?: boolean;
	contact_score?: number | null;
	lead_source?: string | null;
	notes?: string | null;
	created_at?: string;
	deleted_at?: string | null;
	user_id?: string;
}

export interface Tag {
	id: string;
	name: string;
	color: string;
}

export interface Filters {
	status?: string;
	company?: string;
	tags?: string[];
	sortBy?: string;
	sortDir?: 'asc' | 'desc';
	contactType?: string;
	leadSource?: string;
	isBusinessOnly?: boolean;
}

export const currentUser = writable<User | null>(null);
export const currentContact = writable<Contact | null>(null);
export const callState = writable<CallState>('idle');
export const filters = writable<Filters>({});

// Global client context — null = "Agency" (own business), string = client ID
export const activeClientId = writable<string | null>(null);
export const activeClientName = writable<string | null>(null);
