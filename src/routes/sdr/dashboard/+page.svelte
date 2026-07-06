<script lang="ts">
	import { BRAND } from '$lib/brand';
	import StatsWidget from '$lib/components/widgets/StatsWidget.svelte';
	import DailyGoalsWidget from '$lib/components/widgets/DailyGoalsWidget.svelte';
	import QuotaWidget from '$lib/components/widgets/QuotaWidget.svelte';
	import RecentCallsWidget from '$lib/components/widgets/RecentCallsWidget.svelte';
	import TasksWidget from '$lib/components/widgets/TasksWidget.svelte';
	import LeaderboardWidget from '$lib/components/widgets/LeaderboardWidget.svelte';
</script>

<svelte:head><title>Dashboard — {BRAND} SDR</title></svelte:head>

<div class="flex-1 overflow-y-auto p-6">
	<div class="max-w-5xl mx-auto">
		<h2 class="text-white text-lg font-semibold">Your Dashboard</h2>
		<p class="text-xs text-[#7c7c7c] mt-0.5 mb-6">Today's performance at a glance.</p>

		<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-min">
			<div class="md:col-span-2 xl:col-span-3"><StatsWidget /></div>
			<DailyGoalsWidget />
			<QuotaWidget />
			<RecentCallsWidget />
			<TasksWidget />
			<div class="md:col-span-2 xl:col-span-1"><LeaderboardWidget /></div>
		</div>
	</div>
</div>
