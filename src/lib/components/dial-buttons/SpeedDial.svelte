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

      // Background clip
      ctx.save();
      ctx.beginPath(); ctx.arc(mid, mid, mid - 1, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#050005';
      ctx.fillRect(0, 0, size, size);

      // Outer ring
      ctx.strokeStyle = active ? '#ff44ff' : '#2a0030';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mid, mid, mid - 3, 0, Math.PI * 2); ctx.stroke();

      // Speed lines
      const lineCount = calling ? 22 : connected ? 16 : 8;
      const speed = calling ? 4.5 : connected ? 2.5 : 1;
      const maxLen = mid * 0.85;

      for (let i = 0; i < lineCount; i++) {
        const baseAngle = (i / lineCount) * Math.PI * 2;
        // Rotate over time — each line has slight offset for stagger
        const angle = baseAngle + t * speed * (1 + (i % 3) * 0.1);
        const hue = (i / lineCount) * 360 + t * (active ? 80 : 20);
        const lineLen = active
          ? maxLen * (0.3 + Math.abs(Math.sin(t * 3 + i * 0.7)) * 0.7)
          : maxLen * (0.1 + Math.abs(Math.sin(t * 0.5 + i * 0.5)) * 0.2);

        const alpha = active ? (0.4 + Math.abs(Math.sin(t * 2 + i)) * 0.5) : 0.2;

        ctx.beginPath();
        ctx.moveTo(mid, mid);
        ctx.lineTo(mid + Math.cos(angle) * lineLen, mid + Math.sin(angle) * lineLen);

        const lineGrad = ctx.createLinearGradient(
          mid, mid,
          mid + Math.cos(angle) * lineLen, mid + Math.sin(angle) * lineLen
        );
        lineGrad.addColorStop(0, `hsla(${hue % 360},100%,70%,0)`);
        lineGrad.addColorStop(0.3, `hsla(${hue % 360},100%,70%,${alpha * 0.5})`);
        lineGrad.addColorStop(1, `hsla(${hue % 360},100%,90%,${alpha})`);
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = active ? (0.8 + Math.abs(Math.sin(i)) * 1.2) : 0.5;
        ctx.stroke();
      }

      // Center burst
      if (active) {
        const burstPulse = Math.sin(t * (calling ? 8 : 4)) * 0.5 + 0.5;
        const burst = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid * 0.25);
        burst.addColorStop(0, `hsla(${(t * 120) % 360},100%,80%,${0.5 + burstPulse * 0.4})`);
        burst.addColorStop(0.5, `hsla(${(t * 120 + 60) % 360},100%,60%,${0.15 + burstPulse * 0.1})`);
        burst.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = burst;
        ctx.beginPath(); ctx.arc(mid, mid, mid * 0.25, 0, Math.PI * 2); ctx.fill();
      }

      // Center dot
      ctx.beginPath(); ctx.arc(mid, mid, active ? 3 : 2, 0, Math.PI * 2);
      ctx.fillStyle = active ? `hsl(${(t * 150) % 360},100%,80%)` : '#440044';
      ctx.fill();

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
  });
  onDestroy(() => cancelAnimationFrame(raf));
</script>
<canvas bind:this={canvas} width={size} height={size} {onclick} class="cursor-pointer rounded-full hover:scale-105 transition-transform duration-150" role="button" aria-label="Call button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && onclick()}></canvas>
