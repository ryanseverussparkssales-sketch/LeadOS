<script lang="ts">
	import { apiFetch } from '$lib/api';
	import { titleFor } from '$lib/brand';
	import { bookingLinkSchema, flattenErrors } from '$lib/schemas';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	interface BookingLink {
		id: string;
		slug: string;
		title: string;
		description: string | null;
		duration_minutes: number;
		timezone: string;
		availability: Record<string, [string, string][]>;
		buffer_minutes: number | null;
		max_days_ahead: number | null;
		active: boolean;
		created_at: string;
	}

	const WEEKDAYS: { key: string; label: string }[] = [
		{ key: 'mon', label: 'Mon' },
		{ key: 'tue', label: 'Tue' },
		{ key: 'wed', label: 'Wed' },
		{ key: 'thu', label: 'Thu' },
		{ key: 'fri', label: 'Fri' },
		{ key: 'sat', label: 'Sat' },
		{ key: 'sun', label: 'Sun' },
	];

	const TIMEZONES = [
		'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
		'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
		'Europe/London', 'Europe/Berlin', 'Australia/Sydney', 'UTC',
	];

	let links = $state<BookingLink[]>([]);
	let loading = $state(true);
	let listError = $state('');

	// Create form
	let showCreate = $state(false);
	let title = $state('');
	let description = $state('');
	let duration = $state(30);
	let timezone = $state('America/New_York');
	let bufferMinutes = $state(15);
	let maxDaysAhead = $state(14);
	let dayEnabled = $state<Record<string, boolean>>({ mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false });
	const MAX_WINDOWS = 4;
	interface TimeWindow { start: string; end: string; }
	function defaultWindows(): Record<string, TimeWindow[]> {
		const out: Record<string, TimeWindow[]> = {};
		for (const d of WEEKDAYS) out[d.key] = [{ start: '09:00', end: '17:00' }];
		return out;
	}
	let dayWindows = $state<Record<string, TimeWindow[]>>(defaultWindows());
	let saving = $state(false);
	let formError = $state('');
	// Typed, per-field validation errors from the shared zod schema.
	let fieldErrors = $state<Record<string, string>>({});

	function addWindow(day: string) {
		const wins = dayWindows[day];
		if (wins.length >= MAX_WINDOWS) return;
		const last = wins[wins.length - 1];
		dayWindows[day] = [...wins, { start: last?.end || '09:00', end: '17:00' }];
	}

	function removeWindow(day: string, idx: number) {
		dayWindows[day] = dayWindows[day].filter((_, i) => i !== idx);
	}

	/** Returns an error string for a day's windows, or '' if valid. */
	function dayError(label: string, wins: TimeWindow[]): string {
		for (const w of wins) {
			if (!w.start || !w.end) return `${label}: fill in both start and end times.`;
			if (w.end <= w.start) return `${label}: end time must be after start time (${w.start}–${w.end}).`;
		}
		const sorted = [...wins].sort((a, b) => a.start.localeCompare(b.start));
		for (let i = 1; i < sorted.length; i++) {
			if (sorted[i].start < sorted[i - 1].end) {
				return `${label}: windows ${sorted[i - 1].start}–${sorted[i - 1].end} and ${sorted[i].start}–${sorted[i].end} overlap.`;
			}
		}
		return '';
	}

	const availabilityError = $derived.by(() => {
		for (const d of WEEKDAYS) {
			if (!dayEnabled[d.key]) continue;
			const wins = dayWindows[d.key] ?? [];
			if (wins.length === 0) continue;
			const err = dayError(d.label, wins);
			if (err) return err;
		}
		return '';
	});

	let copiedId = $state('');
	let busyId = $state('');

	function publicUrl(slug: string): string {
		const origin = typeof window !== 'undefined' ? window.location.origin : '';
		return `${origin}/book/${slug}`;
	}

	async function loadLinks() {
		loading = true;
		listError = '';
		try {
			const res = await apiFetch('/api/booking/links');
			if (res.ok) {
				links = await res.json();
			} else {
				const d = await res.json().catch(() => ({}));
				listError = d.message ?? 'Failed to load booking links.';
			}
		} catch {
			listError = 'Network error loading booking links.';
		}
		loading = false;
	}

	$effect(() => {
		loadLinks();
	});

	async function createLink(e: Event) {
		e.preventDefault();
		formError = '';
		fieldErrors = {};
		const availability: Record<string, [string, string][]> = {};
		for (const d of WEEKDAYS) {
			if (!dayEnabled[d.key]) continue;
			const wins = dayWindows[d.key] ?? [];
			if (wins.length === 0) continue;
			const err = dayError(d.label, wins);
			if (err) {
				formError = err;
				return;
			}
			availability[d.key] = [...wins]
				.sort((a, b) => a.start.localeCompare(b.start))
				.map((w) => [w.start, w.end] as [string, string]);
		}
		// Typed, schema-driven validation before hitting the API. Shape and
		// payload are unchanged — this is a pre-submit gate on top of the
		// existing per-day window checks above.
		const parsed = bookingLinkSchema.safeParse({
			title: title.trim(),
			description: description.trim() || undefined,
			duration_minutes: duration,
			timezone,
			buffer_minutes: bufferMinutes,
			max_days_ahead: maxDaysAhead,
			availability,
		});
		if (!parsed.success) {
			fieldErrors = flattenErrors(parsed.error);
			formError = fieldErrors._form ?? 'Please fix the highlighted fields.';
			return;
		}
		saving = true;
		try {
			const res = await apiFetch('/api/booking/links', {
				method: 'POST',
				body: JSON.stringify(parsed.data),
			});
			if (res.ok) {
				title = '';
				description = '';
				fieldErrors = {};
				showCreate = false;
				await loadLinks();
			} else {
				const d = await res.json().catch(() => ({}));
				formError = d.message ?? 'Failed to create booking link.';
			}
		} catch {
			formError = 'Network error.';
		}
		saving = false;
	}

	async function toggleActive(link: BookingLink) {
		busyId = link.id;
		try {
			const res = await apiFetch(`/api/booking/links/${link.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ active: !link.active }),
			});
			if (res.ok) {
				const updated = await res.json();
				links = links.map((l) => (l.id === link.id ? updated : l));
			}
		} catch { /* leave state as-is */ }
		busyId = '';
	}

	// In-app delete confirmation (replaces window.confirm). Booking-link delete is
	// a hard delete with no restore, so we confirm up front — no Undo afterward.
	let confirmDeleteOpen = $state(false);
	let pendingDelete = $state<BookingLink | null>(null);

	function requestDelete(link: BookingLink) {
		pendingDelete = link;
		confirmDeleteOpen = true;
	}

	async function performDelete() {
		const link = pendingDelete;
		pendingDelete = null;
		if (!link) return;
		busyId = link.id;
		try {
			const res = await apiFetch(`/api/booking/links/${link.id}`, { method: 'DELETE' });
			if (res.ok) {
				links = links.filter((l) => l.id !== link.id);
				toastSuccess('Booking link deleted');
			} else {
				toastError('Failed to delete booking link.');
			}
		} catch {
			toastError('Network error deleting booking link.');
		}
		busyId = '';
	}

	async function copyUrl(link: BookingLink) {
		try {
			await navigator.clipboard.writeText(publicUrl(link.slug));
			copiedId = link.id;
			setTimeout(() => { if (copiedId === link.id) copiedId = ''; }, 2000);
		} catch { /* clipboard unavailable */ }
	}

	function summarizeAvailability(av: Record<string, [string, string][]>): string {
		const parts: string[] = [];
		for (const d of WEEKDAYS) {
			const w = av?.[d.key];
			if (Array.isArray(w) && w.length) {
				parts.push(`${d.label} ${w.map((win) => `${win[0]}–${win[1]}`).join(', ')}`);
			}
		}
		return parts.join(' · ') || 'No availability set';
	}
</script>

<svelte:head>
	<title>{titleFor('Booking Links')}</title>
</svelte:head>

<PageHeader
	title="Booking Links"
	subtitle="Public scheduling pages — share a link, prospects book straight onto your calendar."
>
	{#snippet actions()}
		<button
			type="button"
			onclick={() => { showCreate = !showCreate; formError = ''; }}
			class="rounded-lg bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-black hover:bg-[var(--c-accent-hover)]"
		>
			{showCreate ? 'Cancel' : '+ New link'}
		</button>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-4xl px-6 py-8">

	{#if showCreate}
		<form onsubmit={createLink} class="mb-8 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] p-6 space-y-4">
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="bl-title" class="block text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-muted)] mb-1.5">Title *</label>
					<input id="bl-title" bind:value={title} placeholder="Intro call"
						class="w-full rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-input)] px-3 py-2 text-sm text-[var(--c-text-primary)] outline-none focus:border-[var(--c-border-focus)]" />
					{#if fieldErrors.title}
						<p class="mt-1 text-xs text-red-400">{fieldErrors.title}</p>
					{/if}
				</div>
				<div>
					<label for="bl-duration" class="block text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-muted)] mb-1.5">Duration</label>
					<select id="bl-duration" bind:value={duration}
						class="w-full rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-input)] px-3 py-2 text-sm text-[var(--c-text-primary)] outline-none">
						<option value={15}>15 minutes</option>
						<option value={30}>30 minutes</option>
						<option value={45}>45 minutes</option>
						<option value={60}>60 minutes</option>
					</select>
				</div>
			</div>
			<div>
				<label for="bl-desc" class="block text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-muted)] mb-1.5">Description</label>
				<input id="bl-desc" bind:value={description} placeholder="Quick intro to see if we're a fit"
					class="w-full rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-input)] px-3 py-2 text-sm text-[var(--c-text-primary)] outline-none focus:border-[var(--c-border-focus)]" />
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<div>
					<label for="bl-tz" class="block text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-muted)] mb-1.5">Timezone</label>
					<select id="bl-tz" bind:value={timezone}
						class="w-full rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-input)] px-3 py-2 text-sm text-[var(--c-text-primary)] outline-none">
						{#each TIMEZONES as tz (tz)}
							<option value={tz}>{tz}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="bl-buffer" class="block text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-muted)] mb-1.5">Buffer (min)</label>
					<input id="bl-buffer" type="number" min="0" max="240" bind:value={bufferMinutes}
						class="w-full rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-input)] px-3 py-2 text-sm text-[var(--c-text-primary)] outline-none" />
					{#if fieldErrors.buffer_minutes}
						<p class="mt-1 text-xs text-red-400">{fieldErrors.buffer_minutes}</p>
					{/if}
				</div>
				<div>
					<label for="bl-maxdays" class="block text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-muted)] mb-1.5">Book up to (days ahead)</label>
					<input id="bl-maxdays" type="number" min="1" max="60" bind:value={maxDaysAhead}
						class="w-full rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-input)] px-3 py-2 text-sm text-[var(--c-text-primary)] outline-none" />
					{#if fieldErrors.max_days_ahead}
						<p class="mt-1 text-xs text-red-400">{fieldErrors.max_days_ahead}</p>
					{/if}
				</div>
			</div>

			<div>
				<p class="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-muted)] mb-2">Weekly availability</p>
				<div class="space-y-2">
					{#each WEEKDAYS as d (d.key)}
						<div class="flex items-start gap-3">
							<label class="flex items-center gap-2 w-16 text-sm text-[var(--c-text-secondary)] pt-1.5">
								<input type="checkbox" bind:checked={dayEnabled[d.key]} class="accent-white" />
								{d.label}
							</label>
							{#if dayEnabled[d.key]}
								<div class="flex-1 space-y-1.5">
									{#each dayWindows[d.key] as w, i (i)}
										<div class="flex items-center gap-2">
											<input type="time" bind:value={w.start}
												class="rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-input)] px-2 py-1.5 text-sm text-[var(--c-text-primary)] outline-none" />
											<span class="text-[var(--c-text-muted)] text-sm">to</span>
											<input type="time" bind:value={w.end}
												class="rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-input)] px-2 py-1.5 text-sm text-[var(--c-text-primary)] outline-none" />
											{#if dayWindows[d.key].length > 1}
												<button type="button" onclick={() => removeWindow(d.key, i)}
													aria-label="Remove window"
													class="rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-input)] px-2 py-1 text-xs text-[var(--c-text-muted)] hover:text-red-400 hover:border-red-500/40">
													✕
												</button>
											{/if}
										</div>
									{/each}
									{#if dayWindows[d.key].length < MAX_WINDOWS}
										<button type="button" onclick={() => addWindow(d.key)}
											class="text-xs text-[var(--c-text-muted)] hover:text-[var(--c-text-secondary)]">
											+ window
										</button>
									{/if}
								</div>
							{:else}
								<span class="text-sm text-[var(--c-text-muted)] pt-1.5">Unavailable</span>
							{/if}
						</div>
					{/each}
				</div>
				{#if availabilityError}
					<p class="mt-2 text-xs text-red-400">{availabilityError}</p>
				{/if}
			</div>

			{#if formError}
				<p class="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{formError}</p>
			{/if}

			<button type="submit" disabled={saving || !!availabilityError}
				class="rounded-lg bg-[var(--c-accent)] px-5 py-2.5 text-sm font-semibold text-black hover:bg-[var(--c-accent-hover)] disabled:opacity-60 disabled:cursor-not-allowed">
				{saving ? 'Creating…' : 'Create booking link'}
			</button>
		</form>
	{/if}

	{#if loading}
		<div class="rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] p-8 text-center text-sm text-[var(--c-text-muted)]">Loading…</div>
	{:else if listError}
		<div class="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-400">{listError}</div>
	{:else if links.length === 0}
		<div class="rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] p-10 text-center">
			<p class="text-[var(--c-text-secondary)] font-medium mb-1">No booking links yet</p>
			<p class="text-sm text-[var(--c-text-muted)]">Create one and share the URL — bookings land as appointments automatically.</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each links as link (link.id)}
				<div class="rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] p-5">
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<p class="font-semibold text-[var(--c-text-primary)] truncate">{link.title}</p>
								<span class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider {link.active
									? 'bg-emerald-500/15 text-emerald-400'
									: 'bg-[var(--c-input)] text-[var(--c-text-muted)]'}">
									{link.active ? 'Active' : 'Off'}
								</span>
							</div>
							<p class="text-xs text-[var(--c-text-muted)] mt-1 truncate">
								{link.duration_minutes} min · {link.timezone} · {summarizeAvailability(link.availability)}
							</p>
							<p class="text-xs text-[var(--c-text-secondary)] mt-1.5 font-mono truncate">{publicUrl(link.slug)}</p>
						</div>
						<div class="flex items-center gap-2 shrink-0">
							<button type="button" onclick={() => copyUrl(link)}
								class="rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-input)] px-3 py-1.5 text-xs text-[var(--c-text-secondary)] hover:border-[var(--c-border-focus)]">
								{copiedId === link.id ? 'Copied!' : 'Copy URL'}
							</button>
							<button type="button" onclick={() => toggleActive(link)} disabled={busyId === link.id}
								class="rounded-lg border border-[var(--c-border-subtle)] bg-[var(--c-input)] px-3 py-1.5 text-xs text-[var(--c-text-secondary)] hover:border-[var(--c-border-focus)] disabled:opacity-50">
								{link.active ? 'Deactivate' : 'Activate'}
							</button>
							<button type="button" onclick={() => requestDelete(link)} disabled={busyId === link.id}
								class="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:border-red-500/60 disabled:opacity-50">
								Delete
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<ConfirmDialog
	bind:open={confirmDeleteOpen}
	title="Delete booking link?"
	message={pendingDelete
		? `Delete "${pendingDelete.title}"? Its public URL will stop working immediately and this can't be undone.`
		: ''}
	confirmLabel="Delete"
	danger
	onConfirm={performDelete}
	onCancel={() => { pendingDelete = null; }}
/>
