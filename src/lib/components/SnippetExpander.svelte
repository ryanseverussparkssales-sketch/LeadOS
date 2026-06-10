<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api';

	interface Snippet { id:string; trigger:string; title:string; content:string; }
	let snippets = $state<Snippet[]>([]);
	let dropdown = $state<{x:number;y:number;matches:Snippet[];query:string;targetEl:HTMLTextAreaElement|HTMLInputElement|null}>({ x:0, y:0, matches:[], query:'', targetEl:null });

	onMount(async () => {
		const res = await apiFetch('/api/snippets');
		if (res.ok) snippets = await res.json();
		document.addEventListener('input', handleInput);
		document.addEventListener('keydown', handleKeydown);
		return () => {
			document.removeEventListener('input', handleInput);
			document.removeEventListener('keydown', handleKeydown);
		};
	});

	function handleInput(e: Event) {
		const target = e.target as HTMLTextAreaElement | HTMLInputElement;
		if (target.tagName !== 'TEXTAREA' && target.tagName !== 'INPUT') return;

		const val = target.value;
		const pos = target.selectionStart ?? val.length;
		const textBefore = val.slice(0, pos);
		const match = textBefore.match(/\/(\w*)$/);

		if (!match) { closeDropdown(); return; }
		const query = match[0];
		const matches = snippets.filter(s => s.trigger.startsWith(query.toLowerCase())).slice(0, 6);
		if (!matches.length) { closeDropdown(); return; }

		// Position dropdown near cursor
		const rect = target.getBoundingClientRect();
		dropdown = { x: rect.left, y: rect.bottom + 4, matches, query, targetEl: target };
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!dropdown.matches.length) return;
		if (e.key === 'Escape') { closeDropdown(); }
		if (e.key === 'Tab' && dropdown.matches.length === 1) {
			e.preventDefault();
			insertSnippet(dropdown.matches[0]);
		}
	}

	function insertSnippet(snippet: Snippet) {
		const el = dropdown.targetEl;
		if (!el) return;
		const val = el.value;
		const pos = el.selectionStart ?? val.length;
		const before = val.slice(0, pos);
		const after = val.slice(pos);
		const query = dropdown.query;
		const newVal = before.slice(0, before.lastIndexOf(query)) + snippet.content + after;
		// Use native input event to trigger Svelte reactivity
		const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set ?? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
		nativeInputValueSetter?.call(el, newVal);
		el.dispatchEvent(new Event('input', { bubbles: true }));
		el.dispatchEvent(new Event('change', { bubbles: true }));
		closeDropdown();
	}

	function closeDropdown() {
		dropdown = { x:0, y:0, matches:[], query:'', targetEl:null };
	}
</script>

{#if dropdown.matches.length > 0}
	<div class="fixed z-[300] bg-[#111111] border border-[#2a2a2a] rounded-xl shadow-xl overflow-hidden"
		style="left:{dropdown.x}px; top:{dropdown.y}px; min-width:220px; max-width:320px">
		{#each dropdown.matches as snippet}
			<button onclick={() => insertSnippet(snippet)}
				class="w-full text-left px-4 py-2.5 hover:bg-white/10 transition-colors border-b border-[#1e1e1e] last:border-0">
				<div class="flex items-center gap-3">
					<code class="text-xs text-blue-400">{snippet.trigger}</code>
					<p class="text-sm text-white truncate">{snippet.title}</p>
				</div>
				<p class="text-xs text-[#7c7c7c] truncate mt-0.5">{snippet.content.slice(0, 60)}</p>
			</button>
		{/each}
		<p class="text-xs text-[#333] px-4 py-1.5 border-t border-[#1e1e1e]">Tab to insert · Esc to close</p>
	</div>
{/if}
