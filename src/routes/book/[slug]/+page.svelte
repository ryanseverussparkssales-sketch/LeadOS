<script lang="ts">
	import { page } from '$app/stores';

	const slug = $derived($page.params.slug);

	interface LinkInfo { title: string; description: string | null; duration_minutes: number; timezone: string }
	interface DaySlots { date: string; slots: string[] }

	let loading = $state(true);
	let loadError = $state('');
	let link = $state<LinkInfo | null>(null);
	let days = $state<DaySlots[]>([]);

	let selectedDate = $state('');
	let selectedTime = $state('');

	let name = $state('');
	let email = $state('');
	let phone = $state('');
	let notes = $state('');

	let submitting = $state(false);
	let submitError = $state('');
	let slotTaken = $state(false);
	let confirmed = $state(false);

	const selectedDay = $derived(days.find((d) => d.date === selectedDate) ?? null);

	function fmtDate(dateStr: string): string {
		const [y, m, d] = dateStr.split('-').map(Number);
		return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
			weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
		});
	}

	function fmtTime(hhmm: string): string {
		const [h, m] = hhmm.split(':').map(Number);
		const ampm = h >= 12 ? 'PM' : 'AM';
		const h12 = h % 12 === 0 ? 12 : h % 12;
		return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
	}

	async function loadSlots() {
		loading = true;
		loadError = '';
		try {
			const res = await fetch(`/api/booking/${slug}/slots?days=60`);
			if (!res.ok) {
				const d = await res.json().catch(() => ({}));
				loadError = res.status === 404
					? 'This booking link doesn’t exist or is no longer active.'
					: (d.error ?? 'Could not load availability.');
				link = null;
				days = [];
			} else {
				const d = await res.json();
				link = d.link;
				days = d.days ?? [];
				if (selectedDate && !days.some((x) => x.date === selectedDate)) {
					selectedDate = '';
					selectedTime = '';
				}
			}
		} catch {
			loadError = 'Network error. Please try again.';
		}
		loading = false;
	}

	$effect(() => {
		if (slug) loadSlots();
	});

	function pickDay(date: string) {
		selectedDate = date;
		selectedTime = '';
		slotTaken = false;
	}

	function pickSlot(time: string) {
		selectedTime = time;
		slotTaken = false;
		submitError = '';
	}

	async function submitBooking(e: Event) {
		e.preventDefault();
		submitError = '';
		slotTaken = false;
		if (!name.trim()) { submitError = 'Please enter your name.'; return; }
		if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
			submitError = 'Please enter a valid email.';
			return;
		}
		submitting = true;
		try {
			const res = await fetch(`/api/booking/${slug}/book`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					date: selectedDate,
					time: selectedTime,
					name: name.trim(),
					email: email.trim(),
					phone: phone.trim() || undefined,
					notes: notes.trim() || undefined,
				}),
			});
			const d = await res.json().catch(() => ({}));
			if (res.ok && d.ok) {
				confirmed = true;
			} else if (res.status === 409) {
				slotTaken = true;
				selectedTime = '';
				await loadSlots();
			} else {
				submitError = d.message ?? d.error ?? 'Something went wrong. Please try again.';
			}
		} catch {
			submitError = 'Network error. Please try again.';
		}
		submitting = false;
	}
</script>

<svelte:head>
	<title>{link ? `Book: ${link.title}` : 'Book a time'}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="min-h-screen bg-black text-neutral-200" style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
	<div class="mx-auto w-full max-w-xl px-4 py-12">
		{#if loading}
			<div class="rounded-xl border border-[#1a1a1a] bg-[#0f0f0f] p-8 text-center text-sm text-neutral-500">
				Loading availability…
			</div>
		{:else if loadError}
			<div class="rounded-xl border border-[#1a1a1a] bg-[#0f0f0f] p-8 text-center">
				<p class="text-lg font-semibold text-neutral-100 mb-2">Unavailable</p>
				<p class="text-sm text-neutral-500">{loadError}</p>
			</div>
		{:else if confirmed && link}
			<div class="rounded-xl border border-[#1a1a1a] bg-[#0f0f0f] p-8 text-center">
				<p class="text-3xl mb-3">✓</p>
				<p class="text-lg font-semibold text-neutral-100 mb-1">You're booked!</p>
				<p class="text-sm text-neutral-400 mb-4">{link.title}</p>
				<div class="rounded-lg border border-[#262626] bg-[#141414] p-4 text-sm text-neutral-300 inline-block">
					<p class="font-medium">{fmtDate(selectedDate)} at {fmtTime(selectedTime)}</p>
					<p class="text-neutral-500 mt-1">{link.duration_minutes} min · {link.timezone}</p>
				</div>
				<p class="text-xs text-neutral-500 mt-5">A confirmation email with a calendar invite is on its way to {email}.</p>
			</div>
		{:else if link}
			<div class="rounded-xl border border-[#1a1a1a] bg-[#0f0f0f] p-6 sm:p-8">
				<h1 class="text-xl font-semibold text-neutral-100">{link.title}</h1>
				{#if link.description}
					<p class="text-sm text-neutral-400 mt-1">{link.description}</p>
				{/if}
				<p class="text-xs text-neutral-500 mt-2 uppercase tracking-wider">
					{link.duration_minutes} min · times shown in {link.timezone}
				</p>

				{#if slotTaken}
					<div class="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
						That time was just taken — please pick another slot.
					</div>
				{/if}

				{#if days.length === 0}
					<div class="mt-6 rounded-lg border border-[#262626] bg-[#141414] p-6 text-center text-sm text-neutral-500">
						No open times right now. Please check back later.
					</div>
				{:else}
					<!-- Day picker -->
					<div class="mt-6">
						<p class="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">Pick a day</p>
						<div class="flex flex-wrap gap-2">
							{#each days as day (day.date)}
								<button
									type="button"
									onclick={() => pickDay(day.date)}
									class="rounded-lg border px-3 py-2 text-sm transition-colors {selectedDate === day.date
										? 'border-white bg-white text-black font-semibold'
										: 'border-[#262626] bg-[#141414] text-neutral-300 hover:border-neutral-500'}"
								>
									{fmtDate(day.date)}
								</button>
							{/each}
						</div>
					</div>

					<!-- Slot grid -->
					{#if selectedDay}
						<div class="mt-5">
							<p class="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">Pick a time</p>
							<div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
								{#each selectedDay.slots as slot (slot)}
									<button
										type="button"
										onclick={() => pickSlot(slot)}
										class="rounded-lg border px-2 py-2 text-sm transition-colors {selectedTime === slot
											? 'border-white bg-white text-black font-semibold'
											: 'border-[#262626] bg-[#141414] text-neutral-300 hover:border-neutral-500'}"
									>
										{fmtTime(slot)}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Details form -->
					{#if selectedDate && selectedTime}
						<form onsubmit={submitBooking} class="mt-6 space-y-4 border-t border-[#1a1a1a] pt-6">
							<p class="text-sm text-neutral-300">
								Booking <span class="font-semibold text-neutral-100">{fmtDate(selectedDate)} at {fmtTime(selectedTime)}</span>
							</p>
							<div>
								<label for="bk-name" class="block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">Name *</label>
								<input id="bk-name" bind:value={name} placeholder="Your name" required
									class="w-full rounded-lg border border-[#262626] bg-[#141414] px-3.5 py-2.5 text-sm text-neutral-100 outline-none focus:border-neutral-500" />
							</div>
							<div>
								<label for="bk-email" class="block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">Email *</label>
								<input id="bk-email" bind:value={email} type="email" placeholder="you@company.com" required
									class="w-full rounded-lg border border-[#262626] bg-[#141414] px-3.5 py-2.5 text-sm text-neutral-100 outline-none focus:border-neutral-500" />
							</div>
							<div>
								<label for="bk-phone" class="block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">Phone</label>
								<input id="bk-phone" bind:value={phone} type="tel" placeholder="+1 555 000 0000"
									class="w-full rounded-lg border border-[#262626] bg-[#141414] px-3.5 py-2.5 text-sm text-neutral-100 outline-none focus:border-neutral-500" />
							</div>
							<div>
								<label for="bk-notes" class="block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">Notes</label>
								<textarea id="bk-notes" bind:value={notes} rows="3" placeholder="Anything we should know?"
									class="w-full rounded-lg border border-[#262626] bg-[#141414] px-3.5 py-2.5 text-sm text-neutral-100 outline-none focus:border-neutral-500 resize-none"></textarea>
							</div>

							{#if submitError}
								<p class="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{submitError}</p>
							{/if}

							<button type="submit" disabled={submitting}
								class="w-full rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-60">
								{submitting ? 'Booking…' : 'Confirm booking'}
							</button>
						</form>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>
