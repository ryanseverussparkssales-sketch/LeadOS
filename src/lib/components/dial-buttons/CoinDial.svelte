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

      // Outer circle bg
      ctx.fillStyle = '#080600';
      ctx.beginPath(); ctx.arc(mid, mid, mid - 1, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = calling ? '#ffaa00' : connected ? '#ffd700' : '#2a1e00';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mid, mid, mid - 3, 0, Math.PI * 2); ctx.stroke();

      // Coin flip speed
      const flipSpeed = calling ? 4 : connected ? 1 : 0.8;
      const flipAngle = t * flipSpeed * Math.PI * 2;
      const scaleX = Math.cos(flipAngle); // -1 to 1 (coin flip)
      const coinR = size * 0.3;

      ctx.save();
      ctx.translate(mid, mid);
      ctx.scale(scaleX, 1);

      // Coin face
      const isFront = scaleX >= 0;
      const coinGrad = ctx.createRadialGradient(-coinR * 0.3, -coinR * 0.3, 0, 0, 0, coinR);
      if (isFront) {
        coinGrad.addColorStop(0, '#fff5b0');
        coinGrad.addColorStop(0.4, '#ffd700');
        coinGrad.addColorStop(1, '#b8860b');
      } else {
        coinGrad.addColorStop(0, '#d4af37');
        coinGrad.addColorStop(0.5, '#996515');
        coinGrad.addColorStop(1, '#5a3e00');
      }

      ctx.fillStyle = coinGrad;
      ctx.beginPath(); ctx.arc(0, 0, coinR, 0, Math.PI * 2); ctx.fill();

      // Coin rim
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, coinR, 0, Math.PI * 2); ctx.stroke();

      if (isFront) {
        // $ sign
        ctx.fillStyle = '#8B6914';
        ctx.font = `bold ${size * 0.25}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 0);
      } else {
        // Circle pattern on back
        ctx.strokeStyle = '#8B6914';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(0, 0, coinR * 0.6, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, coinR * 0.3, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.restore();

      // Shine streaks
      if (calling || connected) {
        const shine = (Math.abs(scaleX) > 0.8) ? (1 - Math.abs(scaleX)) * 5 : 0;
        if (shine > 0) {
          ctx.save();
          ctx.translate(mid, mid);
          ctx.globalAlpha = shine * 0.6;
          const shineGrad = ctx.createLinearGradient(-coinR, -coinR, coinR, coinR);
          shineGrad.addColorStop(0, 'rgba(255,255,255,0)');
          shineGrad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
          shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = shineGrad;
          ctx.beginPath(); ctx.arc(0, 0, coinR, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }

      // Label
      ctx.fillStyle = calling ? '#ffaa00' : connected ? '#ffd700' : '#5a4200';
      ctx.font = `${size * 0.09}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(connected ? 'CASH' : calling ? 'FLIP' : 'DIAL', mid, mid + coinR + size * 0.1);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
  });
  onDestroy(() => cancelAnimationFrame(raf));
</script>
<canvas bind:this={canvas} width={size} height={size} {onclick} class="cursor-pointer rounded-full hover:scale-105 transition-transform duration-150" role="button" aria-label="Call button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && onclick()}></canvas>
