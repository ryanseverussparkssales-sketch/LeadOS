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
      const speed = calling ? 3 : connected ? 1.8 : 0.6;

      // Background
      ctx.save();
      ctx.beginPath(); ctx.arc(mid, mid, mid - 1, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#060008';
      ctx.fillRect(0, 0, size, size);

      // Outer ring
      ctx.strokeStyle = active ? '#8800ff' : '#220033';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mid, mid, mid - 3, 0, Math.PI * 2); ctx.stroke();

      // Plasma ring segments — inner ring (CW)
      const segCount = 8;
      const innerR = mid * 0.55;
      const outerR = mid * 0.8;
      const segGap = 0.08;

      for (let i = 0; i < segCount; i++) {
        const startAngle = (i / segCount) * Math.PI * 2 + t * speed;
        const endAngle = startAngle + (Math.PI * 2 / segCount) - segGap;
        const hue = (i / segCount) * 360 + t * (active ? 60 : 20);
        const saturation = active ? 100 : 60;
        const lightness = active ? (40 + Math.sin(t * 4 + i) * 15) : 20;
        const alpha = active ? (0.6 + Math.sin(t * 3 + i * 0.8) * 0.3) : 0.3;

        ctx.beginPath();
        ctx.arc(mid, mid, outerR, startAngle, endAngle);
        ctx.arc(mid, mid, innerR, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = `hsla(${hue % 360},${saturation}%,${lightness}%,${alpha})`;
        ctx.fill();
      }

      // Plasma ring segments — outer ring (CCW)
      const outerSegCount = 6;
      const outerInnerR = mid * 0.83;
      const outerOuterR = mid * 0.94;

      for (let i = 0; i < outerSegCount; i++) {
        const startAngle = (i / outerSegCount) * Math.PI * 2 - t * speed * 0.7;
        const endAngle = startAngle + (Math.PI * 2 / outerSegCount) - segGap;
        const hue = ((i / outerSegCount) * 360 + 180 + t * (active ? -40 : -10)) % 360;
        const alpha = active ? (0.5 + Math.sin(t * 2 + i) * 0.3) : 0.2;

        ctx.beginPath();
        ctx.arc(mid, mid, outerOuterR, startAngle, endAngle);
        ctx.arc(mid, mid, outerInnerR, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = `hsla(${hue},100%,${active ? 50 : 25}%,${alpha})`;
        ctx.fill();
      }

      // Center plasma glow
      if (active) {
        const glowPulse = Math.sin(t * (calling ? 8 : 4)) * 0.5 + 0.5;
        const centerGrad = ctx.createRadialGradient(mid, mid, 0, mid, mid, innerR);
        centerGrad.addColorStop(0, `hsla(${(t * 80) % 360},100%,70%,${0.4 + glowPulse * 0.3})`);
        centerGrad.addColorStop(0.5, `hsla(${(t * 80 + 120) % 360},100%,50%,${0.15 + glowPulse * 0.1})`);
        centerGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = centerGrad;
        ctx.beginPath(); ctx.arc(mid, mid, innerR, 0, Math.PI * 2); ctx.fill();
      }

      // Center dot
      ctx.beginPath(); ctx.arc(mid, mid, 3, 0, Math.PI * 2);
      ctx.fillStyle = active ? `hsl(${(t * 100) % 360},100%,70%)` : '#440055';
      ctx.fill();

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
  });
  onDestroy(() => cancelAnimationFrame(raf));
</script>
<canvas bind:this={canvas} width={size} height={size} {onclick} class="cursor-pointer rounded-full hover:scale-105 transition-transform duration-150" role="button" aria-label="Call button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && onclick()}></canvas>
