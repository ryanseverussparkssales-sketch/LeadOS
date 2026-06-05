import { writable } from 'svelte/store';

/** True when the logged-in user is a platform super-admin (set from /api/admin/status). */
export const superAdmin = writable<boolean>(false);
