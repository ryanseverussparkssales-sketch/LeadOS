/**
 * Central widget registry for LeadOS dashboard.
 * To add a new widget: create the .svelte file and add one entry here.
 * The dashboard renders widgets dynamically — no if/else chain needed.
 */

// ─── Widget component imports ───────────────────────────────────────────────
import StatsWidget from '$lib/components/widgets/StatsWidget.svelte';
import CrossSellWidget from '$lib/components/widgets/CrossSellWidget.svelte';
import RecentCallsWidget from '$lib/components/widgets/RecentCallsWidget.svelte';
import TasksWidget from '$lib/components/widgets/TasksWidget.svelte';
import NewLeadsWidget from '$lib/components/widgets/NewLeadsWidget.svelte';
import PipelineWidget from '$lib/components/widgets/PipelineWidget.svelte';
import QuotaWidget from '$lib/components/widgets/QuotaWidget.svelte';
import LeaderboardWidget from '$lib/components/widgets/LeaderboardWidget.svelte';
import BestTimeWidget from '$lib/components/widgets/BestTimeWidget.svelte';
import RecentCallbacks from '$lib/components/widgets/TimerCallbacks.svelte';
import CampaignWidget from '$lib/components/widgets/CampaignWidget.svelte';
import QuickLinksWidget from '$lib/components/widgets/QuickLinksWidget.svelte';
import CalendarWidget from '$lib/components/widgets/CalendarWidget.svelte';
import GmailWidget from '$lib/components/widgets/GmailWidget.svelte';
import RssFeedWidget from '$lib/components/widgets/RssFeedWidget.svelte';
import ChatWidget from '$lib/components/widgets/ChatWidget.svelte';
import PhoneWidget from '$lib/components/widgets/PhoneWidget.svelte';
import CoachingWidget from '$lib/components/widgets/CoachingWidget.svelte';
import ScriptPanel from '$lib/components/widgets/ScriptPanel.svelte';
import SpotifyWidget from '$lib/components/widgets/SpotifyWidget.svelte';
import SpotifyBeats from '$lib/components/widgets/SpotifyBeats.svelte';
import SpotifyMini from '$lib/components/widgets/SpotifyMini.svelte';
import TimerWidget from '$lib/components/widgets/TimerWidget.svelte';
import TimerPomodoro from '$lib/components/widgets/TimerPomodoro.svelte';
import TimerSprint from '$lib/components/widgets/TimerSprint.svelte';
import ProjectTimer from '$lib/components/widgets/ProjectTimer.svelte';
import ChronoNexus from '$lib/components/widgets/ChronoNexus.svelte';
import TransmissionLog from '$lib/components/widgets/TransmissionLog.svelte';
import SignalArray from '$lib/components/widgets/SignalArray.svelte';
import NeuralGrid from '$lib/components/widgets/NeuralGrid.svelte';
import MatrixRain from '$lib/components/widgets/MatrixRain.svelte';
import HotLeadsWidget from '$lib/components/widgets/HotLeadsWidget.svelte';
import WinsFeedWidget from '$lib/components/widgets/WinsFeedWidget.svelte';
import DailyGoalsWidget from '$lib/components/widgets/DailyGoalsWidget.svelte';
import ScratchPadWidget from '$lib/components/widgets/ScratchPadWidget.svelte';
import WeatherWidget from '$lib/components/widgets/WeatherWidget.svelte';
import CalendlyWidget from '$lib/components/widgets/CalendlyWidget.svelte';
import DictationWidget from '$lib/components/widgets/DictationWidget.svelte';
import ClaudeWidget from '$lib/components/widgets/ClaudeWidget.svelte';

// ─── Registry types ──────────────────────────────────────────────────────────
export type WidgetCategory = 'productivity' | 'sales' | 'comms' | 'analytics' | 'flair' | 'tools';

export interface WidgetDefinition {
	/** Unique type key — used in saved layouts */
	type: string;
	/** Display name in the picker */
	label: string;
	/** Short description for the picker */
	description: string;
	/** The Svelte component to render */
	component: unknown;
	/** Default grid column span: 1=third, 2=two-thirds, 3=full */
	defaultCols: 1 | 2 | 3;
	/** Default height preset */
	defaultRows: 'sm' | 'md' | 'lg' | 'xl';
	/** Category for the picker's filter tabs */
	category: WidgetCategory;
	/** Emoji icon for the picker */
	icon: string;
	/** Allow multiple instances of this widget */
	multiInstance?: boolean;
	/** Can appear in the top ambient band */
	topBandEligible?: boolean;
	/** Minimum tier required: undefined = free, 'pro' = Pro+, 'agency' = Agency only */
	minTier?: 'pro' | 'agency';
}

// ─── THE REGISTRY ────────────────────────────────────────────────────────────
export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {

	// ── SALES ──────────────────────────────────────────────────────────────
	'stats': {
		type: 'stats', label: "Today's Stats", icon: '📊',
		description: 'Calls made, connect rate, and key metrics for today',
		component: StatsWidget, defaultCols: 2, defaultRows: 'sm',
		category: 'sales',
	},
	'quota': {
		type: 'quota', label: 'Quota Progress', icon: '🎯',
		description: 'Track progress toward your monthly quota',
		component: QuotaWidget, defaultCols: 1, defaultRows: 'md',
		category: 'sales',
	},
	'campaign-tracker': {
		type: 'campaign-tracker', label: 'Campaign Tracker', icon: '📣',
		description: 'Live campaign call counts and win progress',
		component: CampaignWidget, defaultCols: 2, defaultRows: 'md',
		category: 'sales',
		minTier: 'pro', multiInstance: true,
	},
	'pipeline': {
		type: 'pipeline', label: 'Pipeline', icon: '🔄',
		description: 'Open deals and their pipeline stages',
		component: PipelineWidget, defaultCols: 2, defaultRows: 'lg',
		category: 'sales',
		minTier: 'pro',
	},
	'leaderboard': {
		type: 'leaderboard', label: 'Leaderboard', icon: '🏆',
		description: 'Team call activity and performance rankings',
		component: LeaderboardWidget, defaultCols: 1, defaultRows: 'lg',
		category: 'sales',
		minTier: 'pro',
	},
	'best-time': {
		type: 'best-time', label: 'Best Time to Call', icon: '⏰',
		description: 'Optimal calling windows based on your history',
		component: BestTimeWidget, defaultCols: 1, defaultRows: 'md',
		category: 'sales',
		minTier: 'pro',
	},
	'coaching': {
		type: 'coaching', label: 'Coaching Card', icon: '🎓',
		description: 'Weekly AI performance insights and drills',
		component: CoachingWidget, defaultCols: 2, defaultRows: 'lg',
		category: 'sales',
		minTier: 'pro',
	},
	'new-leads': {
		type: 'new-leads', label: 'New Leads', icon: '🔍',
		description: 'Recently arrived leads from your sources',
		component: NewLeadsWidget, defaultCols: 1, defaultRows: 'md',
		category: 'sales',
	},
	'cross-sell': {
		type: 'cross-sell', label: 'Cross-Sell Leads', icon: '🔀',
		description: 'Contacts with signals for Windows, Doors, Switches & Smart Home upsell',
		component: CrossSellWidget, defaultCols: 1, defaultRows: 'lg',
		category: 'sales',
	},

	// ── PRODUCTIVITY ────────────────────────────────────────────────────────
	'tasks': {
		type: 'tasks', label: 'Tasks', icon: '✅',
		description: 'Pending tasks and follow-ups',
		component: TasksWidget, defaultCols: 1, defaultRows: 'md',
		category: 'productivity',
	},
	'callbacks': {
		type: 'callbacks', label: 'Callback Queue', icon: '📞',
		description: 'Scheduled callbacks and follow-up calls',
		component: RecentCallbacks, defaultCols: 1, defaultRows: 'md',
		category: 'productivity',
	},
	'recent-calls': {
		type: 'recent-calls', label: 'Recent Calls', icon: '📋',
		description: 'Last 10 calls with outcomes',
		component: RecentCallsWidget, defaultCols: 1, defaultRows: 'md',
		category: 'productivity',
	},
	'quick-links': {
		type: 'quick-links', label: 'Quick Links', icon: '🔗',
		description: 'Bookmarks to your most-used resources',
		component: QuickLinksWidget, defaultCols: 1, defaultRows: 'sm',
		category: 'productivity', multiInstance: true,
	},
	'script-panel': {
		type: 'script-panel', label: 'Script Panel', icon: '📝',
		description: 'Quick-access call scripts for your campaigns',
		component: ScriptPanel, defaultCols: 1, defaultRows: 'lg',
		category: 'productivity',
	},
	'timer': {
		type: 'timer', label: 'Timer', icon: '⏱',
		description: 'Simple countdown or stopwatch',
		component: TimerWidget, defaultCols: 1, defaultRows: 'sm',
		category: 'productivity',
	},
	'pomodoro': {
		type: 'pomodoro', label: 'Pomodoro', icon: '🍅',
		description: '25/5 focus sessions for deep work',
		component: TimerPomodoro, defaultCols: 1, defaultRows: 'md',
		category: 'productivity',
	},
	'sprint-timer': {
		type: 'sprint-timer', label: 'Sprint Timer', icon: '⚡',
		description: 'Power dialing sprint with session tracking',
		component: TimerSprint, defaultCols: 1, defaultRows: 'md',
		category: 'productivity',
	},
	'project-timer': {
		type: 'project-timer', label: 'Project Timer', icon: '🗂',
		description: 'Track billable hours per project',
		component: ProjectTimer, defaultCols: 1, defaultRows: 'md',
		category: 'productivity',
	},
	'phone': {
		type: 'phone', label: 'Phone', icon: '☎️',
		description: 'Quick-dial phone widget',
		component: PhoneWidget, defaultCols: 1, defaultRows: 'lg',
		category: 'productivity',
	},

	// ── COMMS ───────────────────────────────────────────────────────────────
	'calendar': {
		type: 'calendar', label: 'Calendar', icon: '📅',
		description: 'Upcoming events and meeting schedule',
		component: CalendarWidget, defaultCols: 2, defaultRows: 'md',
		category: 'comms',
		minTier: 'pro',
	},
	'gmail': {
		type: 'gmail', label: 'Gmail', icon: '✉️',
		description: 'Recent inbox messages',
		component: GmailWidget, defaultCols: 2, defaultRows: 'lg',
		category: 'comms',
		minTier: 'pro',
	},

	// ── TOOLS ───────────────────────────────────────────────────────────────
	'chat': {
		type: 'chat', label: 'AI Assistant', icon: '✦',
		description: 'Ask LeadOS AI anything about your data',
		component: ChatWidget, defaultCols: 1, defaultRows: 'lg',
		category: 'tools',
	},
	'rss': {
		type: 'rss', label: 'News Feed', icon: '📰',
		description: 'Industry news from custom RSS feeds',
		component: RssFeedWidget, defaultCols: 1, defaultRows: 'md',
		category: 'tools', multiInstance: true,
	},
	'spotify': {
		type: 'spotify', label: 'Spotify', icon: '🎵',
		description: 'Now playing and music controls',
		component: SpotifyWidget, defaultCols: 1, defaultRows: 'md',
		category: 'tools',
		minTier: 'pro',
	},

	// ── FLAIR ───────────────────────────────────────────────────────────────
	'spotify-beats': {
		type: 'spotify-beats', label: 'Spotify Beats', icon: '🎧',
		description: 'Animated music visualizer',
		component: SpotifyBeats, defaultCols: 3, defaultRows: 'sm',
		category: 'flair', topBandEligible: true,
	},
	'spotify-mini': {
		type: 'spotify-mini', label: 'Spotify Mini', icon: '🎶',
		description: 'Minimal now-playing strip',
		component: SpotifyMini, defaultCols: 3, defaultRows: 'sm',
		category: 'flair', topBandEligible: true,
	},
	'chrono-nexus': {
		type: 'chrono-nexus', label: 'Chrono Nexus', icon: '🌀',
		description: 'Orbital clock with live time display',
		component: ChronoNexus, defaultCols: 1, defaultRows: 'md',
		category: 'flair', topBandEligible: true,
	},
	'transmission': {
		type: 'transmission', label: 'Transmission Log', icon: '📡',
		description: 'Live activity feed in terminal style',
		component: TransmissionLog, defaultCols: 2, defaultRows: 'sm',
		category: 'flair', topBandEligible: true,
	},
	'signal-array': {
		type: 'signal-array', label: 'Signal Array', icon: '⚡',
		description: 'Animated signal visualization',
		component: SignalArray, defaultCols: 1, defaultRows: 'sm',
		category: 'flair',
		minTier: 'pro', topBandEligible: true,
	},
	'neural-grid': {
		type: 'neural-grid', label: 'Neural Grid', icon: '🧠',
		description: 'Neural network animation overlay',
		component: NeuralGrid, defaultCols: 1, defaultRows: 'sm',
		category: 'flair',
		minTier: 'pro', topBandEligible: true,
	},
	'matrix-rain': {
		type: 'matrix-rain', label: 'Matrix Rain', icon: '💻',
		description: 'The Matrix falling code effect',
		component: MatrixRain, defaultCols: 3, defaultRows: 'xl',
		category: 'flair',
		minTier: 'pro', topBandEligible: true,
	},

	// ── NEW SALES WIDGETS ───────────────────────────────────────────────────
	'hot-leads': {
		type: 'hot-leads', label: 'Hot Leads', icon: '🔥',
		description: 'Inbound leads with high intent scores — act fast',
		component: HotLeadsWidget, defaultCols: 1, defaultRows: 'md',
		category: 'sales',
	},
	'wins-feed': {
		type: 'wins-feed', label: 'Wins Feed', icon: '🏅',
		description: 'Live team win announcements and closed deals',
		component: WinsFeedWidget, defaultCols: 1, defaultRows: 'md',
		category: 'sales',
		minTier: 'pro',
	},
	'daily-goals': {
		type: 'daily-goals', label: 'Daily Goals', icon: '🎯',
		description: 'Track daily call, connect, and meeting targets',
		component: DailyGoalsWidget, defaultCols: 1, defaultRows: 'md',
		category: 'sales',
	},

	// ── TOOLS (continued) ───────────────────────────────────────────────────
	'scratchpad': {
		type: 'scratchpad', label: 'Scratch Pad', icon: '📋',
		description: 'Quick freeform notes that persist across sessions',
		component: ScratchPadWidget, defaultCols: 1, defaultRows: 'md',
		category: 'tools',
	},
	'weather': {
		type: 'weather', label: 'Weather', icon: '🌤',
		description: 'Current conditions at your location',
		component: WeatherWidget, defaultCols: 1, defaultRows: 'sm',
		category: 'tools',
	},
	'calendly': {
		type: 'calendly', label: 'Calendly', icon: '📆',
		description: 'Embed your Calendly booking page inline',
		component: CalendlyWidget, defaultCols: 2, defaultRows: 'xl',
		category: 'tools',
	},
	'dictation': {
		type: 'dictation', label: 'Dictation', icon: '🎙️',
		description: 'Speak your thoughts — AI turns them into action items',
		component: DictationWidget, defaultCols: 1, defaultRows: 'lg',
		category: 'productivity',
		minTier: 'pro',
	},
	'claude': {
		type: 'claude', label: 'Claude Chat', icon: '✦',
		description: 'General-purpose Claude — writing, research, brainstorming, anything',
		component: ClaudeWidget, defaultCols: 2, defaultRows: 'xl',
		category: 'tools',
		minTier: 'pro',
	},
};

// ─── Helpers ───────────────────────────────────────────────────────

/** Flat array of all registered widgets */
export const ALL_WIDGETS = Object.values(WIDGET_REGISTRY);

/** Widgets available on the free tier */
export const FREE_WIDGET_TYPES = new Set([
	'stats', 'recent-calls', 'tasks', 'quick-links', 'timer',
]);

/** Filter widget list by tier */
export function widgetsForTier(tier: 'free' | 'pro' | 'agency') {
	if (tier === 'free') return ALL_WIDGETS.filter(w => !w.minTier);
	if (tier === 'pro')  return ALL_WIDGETS.filter(w => w.minTier !== 'agency');
	return ALL_WIDGETS; // agency gets all
}

/** All unique categories in the registry */
export const WIDGET_CATEGORIES = [
	...new Set(Object.values(WIDGET_REGISTRY).map(w => w.category))
];
