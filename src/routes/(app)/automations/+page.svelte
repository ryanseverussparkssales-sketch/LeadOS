<script lang="ts">
	import { onMount } from 'svelte';
	import { titleFor } from '$lib/brand';
	import Icon from '$lib/components/Icon.svelte';
	import { apiFetch } from '$lib/api';
	import { toastSuccess, toastError } from '$lib/stores/toast';

	interface Condition { field:string; operator:string; value:string; }
	interface Action { type:string; params:Record<string,string>; }
	interface Rule { id:string; name:string; trigger_type:string; conditions:Condition[]; actions:Action[]; enabled:boolean; run_count:number; last_run_at:string|null; }

	let rules = $state<Rule[]>([]);
	let loading = $state(true);
	let showNew = $state(false);
	let saving = $state(false);
	let nName = $state(''); let nTrigger = $state('lead_arrived');
	let nConditions = $state<Condition[]>([{ field:'lead_source', operator:'equals', value:'' }]);
	let nActions = $state<Action[]>([{ type:'create_task', params:{ title:'Follow up with new lead' } }]);

	const TRIGGERS = [['lead_arrived','New Lead Arrived'],['call_completed','Call Completed'],['contact_updated','Contact Updated'],['task_overdue','Task Overdue']];
	const ACTIONS = [['create_task','Create Task'],['add_tag','Add Tag'],['send_sms','Send SMS'],['change_status','Change Status'],['add_to_list','Add to Call List']];
	const CONDITIONS = [['lead_source','Lead Source'],['contact_type','Contact Type'],['outcome','Call Outcome'],['tag','Has Tag']];
	const OPERATORS = [['equals','equals'],['not_equals','does not equal'],['contains','contains']];

	onMount(async () => {
		const res = await apiFetch('/api/automations');
		rules = res.ok ? await res.json() : [];
		loading = false;
	});

	async function createRule() {
		if (!nName.trim()) return;
		saving = true;
		const res = await apiFetch('/api/automations', { method:'POST', body: JSON.stringify({ name:nName, triggerType:nTrigger, conditions:nConditions, actions:nActions }) });
		if (res.ok) { rules = [await res.json(), ...rules]; showNew = false; nName = ''; toastSuccess('Rule created'); }
		else { toastError('Failed to create rule'); }
		saving = false;
	}

	async function toggleRule(rule: Rule) {
		const res = await apiFetch(`/api/automations/${rule.id}`, { method:'PATCH', body: JSON.stringify({ enabled: !rule.enabled }) });
		if (res.ok) rules = rules.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r);
		else toastError('Failed to update rule');
	}

	async function deleteRule(id: string) {
		const res = await apiFetch(`/api/automations/${id}`, { method:'DELETE' });
		if (res.ok) {
			rules = rules.filter(r => r.id !== id);
			toastSuccess('Rule deleted');
		} else {
			toastError('Failed to delete rule');
		}
	}
</script>

<svelte:head><title>{titleFor('Automations')}</title></svelte:head>

<div class="flex flex-col flex-1 h-full overflow-y-auto">
	<div class="border-b border-[#1e1e1e] px-8 py-4 flex items-center justify-between">
		<div>
			<h2 style="font-family:var(--font-display);font-weight:300;font-size:20px;letter-spacing:-.01em;color:#fff">Workflow Automations</h2>
			<p class="text-xs text-[#7c7c7c] mt-0.5">Auto-trigger actions when events occur</p>
		</div>
		<button onclick={() => showNew = !showNew} class="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#e5e5e5] transition-colors">+ New Rule</button>
	</div>

	{#if loading}
		<div class="flex-1 p-8 space-y-3">
			{#each [1,2,3,4,5] as _}
				<div class="h-14 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl animate-pulse"></div>
			{/each}
		</div>
	{:else}

	{#if showNew}
		<div class="border-b border-[#1e1e1e] bg-[#0d0d0d] p-6">
			<div class="max-w-2xl space-y-4">
				<input bind:value={nName} placeholder="Rule name (e.g. Auto-task new leads)" class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-[#444] focus:border-white focus:outline-none" />

				<div>
					<label class="text-xs text-[#7c7c7c] uppercase tracking-widest block mb-2">When</label>
					<select bind:value={nTrigger} class="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white focus:outline-none">
						{#each TRIGGERS as [v, l]}<option value={v}>{l}</option>{/each}
					</select>
				</div>

				<div>
					<label class="text-xs text-[#7c7c7c] uppercase tracking-widest block mb-2">If (conditions)</label>
					{#each nConditions as cond, i}
						<div class="flex gap-2 mb-2">
							<select bind:value={cond.field} class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:border-white focus:outline-none">
								{#each CONDITIONS as [v, l]}<option value={v}>{l}</option>{/each}
							</select>
							<select bind:value={cond.operator} class="w-28 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:border-white focus:outline-none">
								{#each OPERATORS as [v, l]}<option value={v}>{l}</option>{/each}
							</select>
							<input bind:value={cond.value} placeholder="value" class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" />
							<button onclick={() => nConditions = nConditions.filter((_,idx)=>idx!==i)} class="text-xs text-red-700 hover:text-red-400 px-1"><Icon name="x" size={14} /></button>
						</div>
					{/each}
					<button onclick={() => nConditions = [...nConditions, {field:'lead_source',operator:'equals',value:''}]} class="text-xs text-[#7c7c7c] hover:text-white">+ Add condition</button>
				</div>

				<div>
					<label class="text-xs text-[#7c7c7c] uppercase tracking-widest block mb-2">Then (actions)</label>
					{#each nActions as action, i}
						<div class="flex gap-2 mb-2">
							<select bind:value={action.type} class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:border-white focus:outline-none">
								{#each ACTIONS as [v, l]}<option value={v}>{l}</option>{/each}
							</select>
							{#if action.type === 'create_task'}
								<input bind:value={action.params.title} placeholder="Task title" class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" />
							{:else if action.type === 'add_tag'}
								<input bind:value={action.params.tag} placeholder="Tag name" class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" />
							{:else if action.type === 'change_status'}
								<select bind:value={action.params.status} class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white focus:border-white focus:outline-none">
									<option value="active">Active</option>
									<option value="do_not_call">Do Not Call</option>
									<option value="archived">Archived</option>
								</select>
							{:else}
								<input bind:value={action.params.value} placeholder="Value" class="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-xs text-white placeholder-[#444] focus:border-white focus:outline-none" />
							{/if}
							<button onclick={() => nActions = nActions.filter((_,idx)=>idx!==i)} class="text-xs text-red-700 hover:text-red-400 px-1"><Icon name="x" size={14} /></button>
						</div>
					{/each}
					<button onclick={() => nActions = [...nActions, {type:'create_task',params:{title:''}}]} class="text-xs text-[#7c7c7c] hover:text-white">+ Add action</button>
				</div>

				<div class="flex gap-3">
					<button onclick={createRule} disabled={saving || !nName.trim()} class="rounded-lg bg-white px-5 py-2 text-xs font-semibold text-black disabled:opacity-40 hover:bg-[#e5e5e5]">{saving ? 'Saving...' : 'Create Rule'}</button>
					<button onclick={() => showNew = false} class="text-xs text-[#7c7c7c] hover:text-white px-3">Cancel</button>
				</div>
			</div>
		</div>
	{/if}

	<div class="p-8 space-y-3 max-w-3xl">
		{#if rules.length === 0}
			<div class="rounded-xl border border-dashed border-[#2a2a2a] p-10 text-center">
				<p class="text-[#6e6e6e] text-sm">No automation rules yet</p>
				<p class="text-[#333] text-xs mt-1">Rules run automatically when their trigger event fires</p>
			</div>
		{:else}
			{#each rules as rule}
				<div class="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 flex items-start gap-4 hover:border-[#262626] hover:bg-[#0f0f0f] transition-colors">
					<button onclick={() => toggleRule(rule)}
						class="w-10 h-6 rounded-full shrink-0 mt-0.5 transition-colors {rule.enabled ? 'bg-[var(--accent)]' : 'bg-[#2a2a2a]'} relative">
						<span class="absolute top-1 w-4 h-4 rounded-full bg-white transition-all {rule.enabled ? 'left-5' : 'left-1'}"></span>
					</button>
					<div class="flex-1">
						<p class="text-white text-sm font-medium">{rule.name}</p>
						<p class="text-xs text-[#7c7c7c] mt-0.5">
							When: {TRIGGERS.find(t=>t[0]===rule.trigger_type)?.[1] ?? rule.trigger_type} ·
							{rule.actions.length} action{rule.actions.length !== 1 ? 's' : ''} ·
							Ran {rule.run_count} times
						</p>
						<div class="flex flex-wrap gap-2 mt-2">
							{#each rule.actions as action}
								<span class="text-xs bg-white/5 text-[#888] px-2 py-0.5 rounded capitalize">{action.type.replace(/_/g,' ')}{action.params.title ? `: ${action.params.title}` : action.params.tag ? `: ${action.params.tag}` : ''}</span>
							{/each}
						</div>
					</div>
					<button onclick={() => window.confirm('Delete this automation rule?') && deleteRule(rule.id)} class="text-xs text-red-700 hover:text-red-400 shrink-0">Delete</button>
				</div>
			{/each}
		{/if}
	</div>
{/if}
</div>
