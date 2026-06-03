<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  let { callState, onclick, size = 90 }: Props = $props();
  type Props = { callState: string; onclick: () => void; size?: number; }
  let canvas: HTMLCanvasElement;
  let raf: number;

  onMount(() => {
    const ctx = canvas.getContext('2d')!;
    const draw = (ts: number) => {
      const t = ts / 1000;
      ctx.clearRect(0, 0, size, size);
      const mid = size / 2;
      const calling = callState === 'calling';
      const connected = callState === 'connected';
      const active = calling || connected;

      // Background circle
      ctx.fillStyle = '#0a0800';
      ctx.beginPath(); ctx.arc(mid, mid, mid - 1, 0, Math.PI * 2); ctx.fill();

      // Outer ring
      ctx.strokeStyle = active ? (connected ? '#ffcc00' : '#ff9900') : '#2a2000';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mid, mid, mid - 3, 0, Math.PI * 2); ctx.stroke();

      // Rotating orbit dots
      const dotCount = 6;
      const orbitR = mid - 10;
      const speed = calling ? 2.5 : connected ? 1.2 : 0.4;
      for (let i = 0; i < dotCount; i++) {
        const angle = (i / dotCount) * Math.PI * 2 + t * speed;
        const dx = mid + Math.cos(angle) * orbitR;
        const dy = mid + Math.sin(angle) * orbitR;
        const brightness = (Math.sin(angle - t * speed) * 0.5 + 0.5);
        ctx.beginPath();
        ctx.arc(dx, dy, active ? 2.5 : 1.5, 0, Math.PI * 2);
        ctx.fillStyle = active
          ? `rgba(255, ${connected ? 200 : 140}, 0, ${0.3 + brightness * 0.7})`
          : `rgba(100, 70, 0, ${0.3 + brightness * 0.4})`;
        ctx.fill();
      }

      // S-spark logo in center
      const pulse = active ? (Math.sin(t * (calling ? 6 : 2)) * 0.5 + 0.5) : 0.5;
      const logoColor = active
        ? (connected ? `rgba(255,220,0,${0.8 + pulse * 0.2})` : `rgba(255,160,0,${0.7 + pulse * 0.3})`)
        : 'rgba(120,90,0,0.8)';

      const s = size * 0.22;
      const lx = mid - s * 0.5;
      const ly = mid - s * 0.7;

      ctx.strokeStyle = logoColor;
      ctx.lineWidth = size * 0.05;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Draw S shape with bezier curves
      ctx.beginPath();
      ctx.moveTo(lx + s * 0.8, ly);
      ctx.bezierCurveTo(lx + s * 0.8, ly, lx, ly, lx, ly + s * 0.5);
      ctx.bezierCurveTo(lx, ly + s, lx + s * 0.8, ly + s, lx + s * 0.8, ly + s * 1.5);
      ctx.bezierCurveTo(lx + s * 0.8, ly + s * 2, lx, ly + s * 2, lx, ly + s * 2);
      ctx.stroke();

      // Spark accent lines
      if (active) {
        ctx.strokeStyle = logoColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4 + pulse * 0.5;
        const sparkCount = 3;
        for (let i = 0; i < sparkCount; i++) {
          const angle = (i / sparkCount) * Math.PI + t * 3;
          ctx.beginPath();
          ctx.moveTo(mid, mid);
          ctx.lineTo(mid + Math.cos(angle) * s * 1.2, mid + Math.sin(angle) * s * 1.2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
  });
  onDestroy(() => cancelAnimationFrame(raf));
</script>
<canvas bind:this={canvas} width={size} height={size} {onclick} class="cursor-pointer rounded-full hover:scale-105 transition-transform duration-150" role="button" aria-label="Call button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && onclick()}></canvas>
