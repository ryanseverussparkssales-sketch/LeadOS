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

      // Pulse calculation
      let pulse = 0;
      if (calling) {
        pulse = (Math.sin(t * Math.PI * 4) * 0.5 + 0.5);
      } else if (connected) {
        pulse = (Math.sin(t * Math.PI * 1.2) * 0.5 + 0.5) * 0.4 + 0.6;
      } else {
        pulse = (Math.sin(t * Math.PI * 0.7) * 0.5 + 0.5) * 0.3 + 0.35;
      }

      const orbR = (size * 0.28) * (1 + pulse * 0.18);

      // Outer glow ring
      const glowColor = connected ? '#00ff88' : calling ? '#00ff44' : '#00cc44';
      const outerGlow = ctx.createRadialGradient(mid, mid, orbR * 0.5, mid, mid, orbR * 2.2);
      outerGlow.addColorStop(0, connected ? 'rgba(0,255,136,0.18)' : calling ? 'rgba(0,255,68,0.22)' : 'rgba(0,204,68,0.06)');
      outerGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = outerGlow;
      ctx.beginPath(); ctx.arc(mid, mid, orbR * 2.2, 0, Math.PI * 2); ctx.fill();

      // Orb sphere gradient
      const grad = ctx.createRadialGradient(mid - orbR * 0.3, mid - orbR * 0.3, orbR * 0.05, mid, mid, orbR);
      if (connected) {
        grad.addColorStop(0, `rgba(180,255,220,${0.7 + pulse * 0.3})`);
        grad.addColorStop(0.4, `rgba(0,255,136,${0.6 + pulse * 0.2})`);
        grad.addColorStop(1, 'rgba(0,60,30,0.95)');
      } else if (calling) {
        grad.addColorStop(0, `rgba(160,255,200,${0.6 + pulse * 0.35})`);
        grad.addColorStop(0.4, `rgba(0,230,80,${0.55 + pulse * 0.3})`);
        grad.addColorStop(1, 'rgba(0,40,15,0.95)');
      } else {
        grad.addColorStop(0, `rgba(80,200,120,${0.25 + pulse * 0.15})`);
        grad.addColorStop(0.5, `rgba(0,130,50,${0.2 + pulse * 0.1})`);
        grad.addColorStop(1, 'rgba(0,20,8,0.95)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(mid, mid, orbR, 0, Math.PI * 2); ctx.fill();

      // Specular highlight
      const spec = ctx.createRadialGradient(mid - orbR*0.35, mid - orbR*0.35, 0, mid - orbR*0.2, mid - orbR*0.2, orbR * 0.55);
      spec.addColorStop(0, `rgba(255,255,255,${0.35 + pulse * 0.2})`);
      spec.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = spec;
      ctx.beginPath(); ctx.arc(mid, mid, orbR, 0, Math.PI * 2); ctx.fill();

      // Ring
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = calling ? 2 : 1.5;
      ctx.globalAlpha = 0.4 + pulse * 0.5;
      ctx.beginPath(); ctx.arc(mid, mid, mid - 3, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;

      // Label
      ctx.fillStyle = connected ? '#00ff88' : calling ? '#00ff44' : '#1a6630';
      ctx.font = `${size * 0.09}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(connected ? 'LIVE' : calling ? 'RING' : 'CALL', mid, mid + orbR + size * 0.1);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
  });
  onDestroy(() => cancelAnimationFrame(raf));
</script>
<canvas bind:this={canvas} width={size} height={size} {onclick} class="cursor-pointer rounded-full hover:scale-105 transition-transform duration-150" role="button" aria-label="Call button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && onclick()}></canvas>
