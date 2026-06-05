<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  let { callState, onclick, size = 90 }: Props = $props();
  type Props = { callState: string; onclick: () => void; size?: number; }
  let canvas: HTMLCanvasElement;
  let raf: number;
  let pingAge = 0;
  let pingX = 0, pingY = 0;

  onMount(() => {
    const ctx = canvas.getContext('2d')!;
    let lastPing = 0;

    const draw = (ts: number) => {
      const t = ts / 1000;
      ctx.clearRect(0, 0, size, size);
      const mid = size / 2;
      const calling = callState === 'calling';
      const connected = callState === 'connected';
      const active = calling || connected;
      const sweepSpeed = calling ? 3.5 : connected ? 2 : 0.8;

      // Background clip
      ctx.save();
      ctx.beginPath(); ctx.arc(mid, mid, mid - 1, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#0a0702';
      ctx.fillRect(0, 0, size, size);

      // Concentric rings
      const ringColor = active ? '#3a2c10' : '#1f1708';
      for (let i = 1; i <= 3; i++) {
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(mid, mid, (mid - 4) * (i / 3), 0, Math.PI * 2); ctx.stroke();
      }

      // Cross hairs
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(4, mid); ctx.lineTo(size-4, mid); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mid, 4); ctx.lineTo(mid, size-4); ctx.stroke();

      // Outer ring
      ctx.strokeStyle = active ? '#c8a24a' : '#3a2c10';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mid, mid, mid - 3, 0, Math.PI * 2); ctx.stroke();

      // Radar sweep
      const sweepAngle = (t * sweepSpeed * Math.PI * 2) % (Math.PI * 2);
      const sweepR = mid - 4;

      // Sweep trail (gradient fade)
      const trailLen = Math.PI * 0.6;
      for (let i = 0; i < 24; i++) {
        const trailAngle = sweepAngle - (i / 24) * trailLen;
        const alpha = (1 - i / 24) * (active ? 0.35 : 0.12);
        ctx.beginPath();
        ctx.moveTo(mid, mid);
        ctx.arc(mid, mid, sweepR, trailAngle, trailAngle + trailLen / 24);
        ctx.closePath();
        ctx.fillStyle = active ? `rgba(212,175,55,${alpha})` : `rgba(168,132,47,${alpha})`;
        ctx.fill();
      }

      // Sweep line
      ctx.strokeStyle = active ? '#d4af37' : '#8a6a2a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mid, mid);
      ctx.lineTo(mid + Math.cos(sweepAngle) * sweepR, mid + Math.sin(sweepAngle) * sweepR);
      ctx.stroke();

      // Ping dot when connected
      if (connected) {
        if (ts - lastPing > 1800) {
          lastPing = ts;
          pingAge = 0;
          const pingAngle = Math.random() * Math.PI * 2;
          const pingDist = (Math.random() * 0.5 + 0.3) * sweepR;
          pingX = mid + Math.cos(pingAngle) * pingDist;
          pingY = mid + Math.sin(pingAngle) * pingDist;
        }
        pingAge += 0.016;
        const pingAlpha = Math.max(0, 1 - pingAge * 0.6);
        if (pingAlpha > 0) {
          ctx.beginPath(); ctx.arc(pingX, pingY, 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(212,175,55,${pingAlpha})`;
          ctx.fill();
          ctx.beginPath(); ctx.arc(pingX, pingY, 3 + pingAge * 4, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(212,175,55,${pingAlpha * 0.4})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // Center dot
      ctx.beginPath(); ctx.arc(mid, mid, 2, 0, Math.PI * 2);
      ctx.fillStyle = active ? '#d4af37' : '#8a6a2a';
      ctx.fill();

      // Label
      ctx.fillStyle = active ? '#c8a24a' : '#4a3812';
      ctx.font = `${size * 0.09}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(connected ? 'PING' : calling ? 'SCAN' : 'RADAR', mid, size - 7);

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
  });
  onDestroy(() => cancelAnimationFrame(raf));
</script>
<canvas bind:this={canvas} width={size} height={size} {onclick} class="cursor-pointer rounded-full hover:scale-105 transition-transform duration-150" role="button" aria-label="Call button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && onclick()}></canvas>
