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

      // Background circle with clip
      ctx.save();
      ctx.beginPath(); ctx.arc(mid, mid, mid - 1, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#000d10';
      ctx.fillRect(0, 0, size, size);

      // Ring
      ctx.strokeStyle = active ? (connected ? '#00ffff' : '#00ccff') : '#003a44';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mid, mid, mid - 3, 0, Math.PI * 2); ctx.stroke();

      // Audio bars
      const barCount = 12;
      const maxBarH = size * 0.38;
      const barW = (size * 0.55) / barCount;
      const startX = mid - (barCount * barW) / 2;

      for (let i = 0; i < barCount; i++) {
        let barH: number;
        if (active) {
          // Reactive tall bars
          const freq = (i / barCount) * Math.PI * 2;
          const wave = Math.abs(Math.sin(freq * 2.5 + t * (calling ? 8 : 4)));
          const noise = Math.abs(Math.sin(i * 1.7 + t * (calling ? 12 : 6)));
          barH = maxBarH * (0.2 + wave * 0.5 + noise * 0.3);
        } else {
          // Ambient small bars
          const freq = (i / barCount) * Math.PI * 2;
          barH = maxBarH * (0.05 + Math.abs(Math.sin(freq + t * 1.5)) * 0.15);
        }

        const x = startX + i * barW;
        const barColor = connected ? '#00ffff' : calling ? '#00ccff' : '#006680';
        const alpha = active ? (0.5 + (barH / maxBarH) * 0.5) : 0.4;

        // Bar gradient
        const barGrad = ctx.createLinearGradient(x, mid + barH / 2, x, mid - barH / 2);
        barGrad.addColorStop(0, `rgba(0,${connected?255:180},${connected?255:220},0.1)`);
        barGrad.addColorStop(1, `rgba(0,${connected?255:180},${connected?255:220},${alpha})`);

        ctx.fillStyle = barGrad;
        ctx.fillRect(x + 1, mid - barH / 2, barW - 2, barH);

        // Top cap glow
        if (active) {
          ctx.fillStyle = barColor;
          ctx.globalAlpha = 0.9;
          ctx.fillRect(x + 1, mid - barH / 2 - 1, barW - 2, 2);
          ctx.globalAlpha = 1;
        }
      }

      // Label
      ctx.fillStyle = active ? (connected ? '#00ffff' : '#00ccff') : '#006680';
      ctx.font = `${size * 0.09}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(connected ? 'LIVE' : calling ? 'WAVE' : 'CALL', mid, mid + maxBarH / 2 + size * 0.1);

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
  });
  onDestroy(() => cancelAnimationFrame(raf));
</script>
<canvas bind:this={canvas} width={size} height={size} {onclick} class="cursor-pointer rounded-full hover:scale-105 transition-transform duration-150" role="button" aria-label="Call button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && onclick()}></canvas>
