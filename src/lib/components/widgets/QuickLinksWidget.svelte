<script lang="ts">
	const links = [
		{ href: '/dialer',    label: 'Campaign Dialer', icon: '📞' },
		{ href: '/phone',     label: 'Phone',           icon: '☎️' },
		{ href: '/contacts',  label: 'Contacts',        icon: '👥' },
		{ href: '/campaigns', label: 'Campaigns',       icon: '📋' },
		{ href: '/reports',   label: 'Reports',         icon: '📄' },
		{ href: '/time',      label: 'Time',            icon: '⏱' },
	];
</script>

<div class="grid grid-cols-2 gap-2 h-full content-start">
	{#each links as link}
		<a href={link.href}
			class="flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5 hover:border-white/30 hover:bg-white/5 transition-colors">
			<span class="text-base">{link.icon}</span>
			<span class="text-xs text-white">{link.label}</span>
		</a>
	{/each}
</div>
