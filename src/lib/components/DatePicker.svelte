<script lang="ts">
	import { browser } from '$app/environment';

	interface Props {
		value?: string;
		onchange?: (v: string) => void;
		placeholder?: string;
		min?: string;
		max?: string;
		class?: string;
		disabled?: boolean;
	}

	let {
		value = $bindable(''),
		onchange,
		placeholder = 'Select date',
		min = '',
		max = '',
		class: extraClass = '',
		disabled = false,
	}: Props = $props();

	let open = $state(false);
	let triggerEl: HTMLElement;
	let calendarEl: HTMLElement;

	// Current view month/year
	const today = new Date();
	let viewYear = $state(value ? new Date(value + 'T12:00').getFullYear() : today.getFullYear());
	let viewMonth = $state(value ? new Date(value + 'T12:00').getMonth() : today.getMonth());

	const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
	const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

	// Formatted display value
	const displayValue = $derived(
		value
			? new Date(value + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
			: ''
	);

	// Build calendar grid for current view month
	const calendarDays = $derived((() => {
		const firstDay = new Date(viewYear, viewMonth, 1).getDay();
		const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
		const days: (number | null)[] = [];
		for (let i = 0; i < firstDay; i++) days.push(null);
		for (let d = 1; d <= daysInMonth; d++) days.push(d);
		// Pad to complete last week
		while (days.length % 7 !== 0) days.push(null);
		return days;
	})());

	function selectDay(day: number) {
		const month = String(viewMonth + 1).padStart(2, '0');
		const d = String(day).padStart(2, '0');
		const iso = `${viewYear}-${month}-${d}`;
		if (min && iso < min) return;
		if (max && iso > max) return;
		value = iso;
		onchange?.(iso);
		open = false;
	}

	function isSelected(day: number) {
		if (!value) return false;
		const month = String(viewMonth + 1).padStart(2, '0');
		const d = String(day).padStart(2, '0');
		return value === `${viewYear}-${month}-${d}`;
	}

	function isToday(day: number) {
		return viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
	}

	function isDisabled(day: number) {
		const month = String(viewMonth + 1).padStart(2, '0');
		const d = String(day).padStart(2, '0');
		const iso = `${viewYear}-${month}-${d}`;
		return (min && iso < min) || (max && iso > max);
	}

	function prevMonth() {
		if (viewMonth === 0) { viewMonth = 11; viewYear--; } else viewMonth--;
	}

	function nextMonth() {
		if (viewMonth === 11) { viewMonth = 0; viewYear++; } else viewMonth++;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}

	function handleOutsideClick(e: MouseEvent) {
		if (!triggerEl?.contains(e.target as Node) && !calendarEl?.contains(e.target as Node)) {
			open = false;
		}
	}

	$effect(() => {
		if (!browser) return;
		if (open) {
			document.addEventListener('mousedown', handleOutsideClick);
			document.addEventListener('keydown', handleKeydown);
		} else {
			document.removeEventListener('mousedown', handleOutsideClick);
			document.removeEventListener('keydown', handleKeydown);
		}
		return () => {
			document.removeEventListener('mousedown', handleOutsideClick);
			document.removeEventListener('keydown', handleKeydown);
		};
	});

	// Sync view to value when value changes externally
	$effect(() => {
		if (value) {
			const d = new Date(value + 'T12:00');
			viewYear = d.getFullYear();
			viewMonth = d.getMonth();
		}
	});
</script>

<div class="dp-wrap" bind:this={triggerEl}>
	<!-- Trigger button -->
	<button
		type="button"
		onclick={() => { if (!disabled) { open = !open; } }}
		class="dp-trigger {extraClass}"
		class:dp-disabled={disabled}
		class:dp-open={open}
		aria-haspopup="true"
		aria-expanded={open}>
		<span class="dp-value" class:dp-placeholder={!displayValue}>
			{displayValue || placeholder}
		</span>
		<span class="dp-icon" aria-hidden="true">📅</span>
	</button>

	<!-- Calendar dropdown -->
	{#if open}
		<div class="dp-calendar" bind:this={calendarEl} role="dialog" aria-label="Choose date">
			<!-- Month/Year navigation -->
			<div class="dp-header">
				<button type="button" onclick={prevMonth} class="dp-nav" aria-label="Previous month">‹</button>
				<span class="dp-month-year">{MONTHS[viewMonth]} {viewYear}</span>
				<button type="button" onclick={nextMonth} class="dp-nav" aria-label="Next month">›</button>
			</div>

			<!-- Day headers -->
			<div class="dp-grid">
				{#each DAYS as day}
					<div class="dp-day-header">{day}</div>
				{/each}

				<!-- Calendar cells -->
				{#each calendarDays as day}
					{#if day === null}
						<div></div>
					{:else}
						<button
							type="button"
							onclick={() => selectDay(day)}
							disabled={isDisabled(day)}
							class="dp-day"
							class:dp-day-selected={isSelected(day)}
							class:dp-day-today={isToday(day)}
							class:dp-day-disabled={isDisabled(day)}>
							{day}
						</button>
					{/if}
				{/each}
			</div>

			<!-- Footer -->
			{#if value}
				<div class="dp-footer">
					<button type="button" onclick={() => { value = ''; onchange?.(''); open = false; }} class="dp-clear">
						Clear
					</button>
					<button type="button" onclick={() => { selectDay(today.getDate()); viewMonth = today.getMonth(); viewYear = today.getFullYear(); }} class="dp-today">
						Today
					</button>
				</div>
			{:else}
				<div class="dp-footer">
					<button type="button" onclick={() => { selectDay(today.getDate()); viewMonth = today.getMonth(); viewYear = today.getFullYear(); }} class="dp-today">
						Today
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
.dp-wrap { position: relative; display: inline-block; width: 100%; }

.dp-trigger {
	width: 100%;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	background: #1a1a1a;
	border: 1px solid #2a2a2a;
	border-radius: 8px;
	padding: 8px 12px;
	cursor: pointer;
	transition: border-color 0.15s;
	text-align: left;
}
.dp-trigger:hover:not(.dp-disabled) { border-color: #444; }
.dp-trigger.dp-open { border-color: #555; }
.dp-disabled { opacity: 0.5; cursor: not-allowed; }

.dp-value { font-size: 14px; color: #fff; flex: 1; }
.dp-placeholder { color: #444; }
.dp-icon { font-size: 14px; flex-shrink: 0; opacity: 0.5; }

.dp-calendar {
	position: absolute;
	top: calc(100% + 4px);
	left: 0;
	z-index: 100;
	background: #111;
	border: 1px solid #2a2a2a;
	border-radius: 10px;
	padding: 12px;
	width: 240px;
	box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}

.dp-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 10px;
}
.dp-nav {
	background: none;
	border: 1px solid #2a2a2a;
	color: #888;
	border-radius: 6px;
	width: 28px; height: 28px;
	font-size: 16px;
	cursor: pointer;
	display: flex; align-items: center; justify-content: center;
	transition: all 0.1s;
}
.dp-nav:hover { border-color: #555; color: #ccc; }
.dp-month-year { font-size: 13px; font-weight: 500; color: #fff; }

.dp-grid {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
	gap: 2px;
}
.dp-day-header {
	font-size: 10px;
	color: #444;
	text-align: center;
	padding: 3px 0 6px;
	letter-spacing: 0.5px;
}
.dp-day {
	aspect-ratio: 1;
	display: flex; align-items: center; justify-content: center;
	font-size: 12px;
	color: #888;
	background: none;
	border: 1px solid transparent;
	border-radius: 6px;
	cursor: pointer;
	transition: all 0.1s;
}
.dp-day:hover:not(.dp-day-disabled):not(.dp-day-selected) { background: #1a1a1a; border-color: #2a2a2a; color: #fff; }
.dp-day-today { color: #fff; border-color: #2a2a2a; font-weight: 600; }
.dp-day-selected { background: #fff; color: #000; border-color: #fff; font-weight: 600; }
.dp-day-selected:hover { background: #e5e5e5; }
.dp-day-disabled { opacity: 0.25; cursor: not-allowed; }

.dp-footer {
	display: flex;
	justify-content: flex-end;
	gap: 6px;
	margin-top: 8px;
	padding-top: 8px;
	border-top: 1px solid #1a1a1a;
}
.dp-clear { font-size: 11px; color: #555; background: none; border: none; cursor: pointer; padding: 2px 6px; }
.dp-clear:hover { color: #ef4444; }
.dp-today { font-size: 11px; color: #888; background: none; border: 1px solid #2a2a2a; border-radius: 5px; cursor: pointer; padding: 3px 10px; }
.dp-today:hover { border-color: #555; color: #ccc; }
</style>
