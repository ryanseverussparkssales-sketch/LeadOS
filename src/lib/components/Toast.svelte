<script lang="ts">
    import { toasts, dismiss, type Toast } from '$lib/stores/toast';
    import Icon from '$lib/components/Icon.svelte';

    const ICONS: Record<string, string> = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ',
    };
    const COLORS: Record<string, { border: string; bg: string; text: string; bar: string }> = {
        success: { border: '#22c55e', bg: '#052e16', text: '#4ade80', bar: '#22c55e' },
        error:   { border: '#ef4444', bg: '#2d0000', text: '#f87171', bar: '#ef4444' },
        warning: { border: '#f59e0b', bg: '#2d1a00', text: '#fbbf24', bar: '#f59e0b' },
        info:    { border: '#3b82f6', bg: '#001b3d', text: '#60a5fa', bar: '#3b82f6' },
    };
</script>

<div class="toast-container" aria-live="polite" aria-atomic="false">
    {#each $toasts as t (t.id)}
        <div
            class="toast"
            style="--border:{COLORS[t.type].border};--bg:{COLORS[t.type].bg};--text:{COLORS[t.type].text};--bar:{COLORS[t.type].bar}"
            role="alert"
        >
            <span class="toast-icon">{ICONS[t.type]}</span>
            <span class="toast-msg">{t.message}</span>
            {#if t.action}
                <button class="toast-action" onclick={() => { t.action?.run(); dismiss(t.id); }}>{t.action.label}</button>
            {/if}
            <button class="toast-close" onclick={() => dismiss(t.id)} aria-label="Dismiss"><Icon name="x" size={14} /></button>
            {#if t.duration && t.duration > 0}
                <div class="toast-bar" style="animation-duration:{t.duration}ms"></div>
            {/if}
        </div>
    {/each}
</div>

<style>
.toast-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
    max-width: 360px;
}
.toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    pointer-events: all;
    position: relative;
    overflow: hidden;
    animation: slideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}
@keyframes slideIn {
    from { transform: translateX(120%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}
.toast-icon {
    font-size: 13px;
    color: var(--text);
    flex-shrink: 0;
    font-weight: 600;
}
.toast-msg {
    font-size: 12px;
    color: #ccc;
    flex: 1;
    line-height: 1.4;
}
.toast-action {
    font-size: 11px;
    font-weight: 600;
    color: var(--accent, #c8a24a);
    background: none;
    border: 1px solid var(--accent, #c8a24a);
    cursor: pointer;
    padding: 3px 10px;
    border-radius: 6px;
    flex-shrink: 0;
    letter-spacing: 0.02em;
    transition: background 0.15s, color 0.15s;
}
.toast-action:hover {
    background: var(--accent, #c8a24a);
    color: var(--accent-ink, #1a1408);
}
.toast-close {
    font-size: 10px;
    color: #555;
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    flex-shrink: 0;
    transition: color 0.15s;
}
.toast-close:hover { color: #ccc; }
.toast-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    width: 100%;
    background: var(--bar);
    animation: shrink linear forwards;
    transform-origin: left;
}
@keyframes shrink {
    from { transform: scaleX(1); }
    to { transform: scaleX(0); }
}
</style>
