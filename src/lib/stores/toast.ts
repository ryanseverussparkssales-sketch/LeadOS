import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration?: number; // ms, default 3500
}

const { subscribe, update } = writable<Toast[]>([]);

export const toasts = { subscribe };

export function toast(message: string, type: ToastType = 'info', duration = 6000) {
    const id = Math.random().toString(36).slice(2);
    update(all => [...all, { id, type, message, duration }]);
    // setTimeout fires at module level — safe regardless of component lifecycle.
    // dismiss() is a no-op if the toast was already manually dismissed.
    if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
    }
    return id;
}

export function dismiss(id: string) {
    update(all => all.filter(t => t.id !== id));
}

// Convenience helpers
export const toastSuccess = (msg: string, d?: number) => toast(msg, 'success', d ?? 6000);
export const toastError   = (msg: string, d?: number) => toast(msg, 'error',   d ?? 8000);
export const toastWarning = (msg: string, d?: number) => toast(msg, 'warning', d ?? 6000);
export const toastInfo    = (msg: string, d?: number) => toast(msg, 'info',    d ?? 5000);
