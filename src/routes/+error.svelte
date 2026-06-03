<script lang="ts">
	import { page } from '$app/stores';
</script>

<div style="font-family:system-ui;background:#0a0a0a;color:#f5f5f5;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:2rem">
	<div>
		<p style="font-size:3rem;margin-bottom:1rem">⚠️</p>
		<h1 style="font-size:1.25rem;font-weight:600;margin-bottom:0.5rem">Something went wrong</h1>
		<p style="color:#666;font-size:0.875rem;margin-bottom:1.5rem">{$page.error?.message ?? 'Unexpected error'}</p>
		<a href="/" style="background:white;color:black;padding:0.5rem 1.5rem;border-radius:0.5rem;text-decoration:none;font-size:0.75rem;font-weight:600">Go Home</a>
	</div>
</div>
