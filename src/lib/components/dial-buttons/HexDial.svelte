<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  let { callState, onclick, size = 90 }: Props = $props();
  type Props = { callState: string; onclick: () => void; size?: number; }
  let canvas: HTMLCanvasElement;
  let raf: number;

  onMount(() => {
    const ctx = canvas.getContext('2d')!;

    function drawHex(x: number, y: number, r: number, fill: string, stroke: string, lineWidth: number) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const px = x + r * Math.cos(angle);
        const py = y + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
    }

    const draw = (ts: number) => {
      const t = ts / 1000;
      ctx.clearRect(0, 0, size, size);
      const mid = size / 2;
      const calling = callState === 'calling';
      const connected = callState === 'connected';
      const active = calling || connected;
      const waveSpeed = calling ? 3 : connected ? 1.5 : 0.5;

      // Background clip
      ctx.save();
      ctx.beginPath(); ctx.arc(mid, mid, mid - 1, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#000810';
      ctx.fillRect(0, 0, size, size);

      // Hex grid
      const hexR = size * 0.085;
      const hexW = hexR * Math.sqrt(3);
      const hexH = hexR * 2;
      const cols = 6, rows = 6;
      const gridW = cols * hexW;
      const gridH = rows * hexH * 0.75 + hexH * 0.25;
      const startX = mid - gridW / 2 + hexW / 2;
      const startY = mid - gridH / 2 + hexR;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = startX + col * hexW + (row % 2 === 1 ? hexW / 2 : 0);
          const y = startY + row * hexH * 0.75;

          // Distance from center for wave
          const dx = x - mid, dy = y - mid;
          const dist = Math.sqrt(dx * dx + dy * dy) / mid;

          // Wave phase based on distance from center
          const phase = dist * 4 - t * waveSpeed;
          const wave = (Math.sin(phase * Math.PI) * 0.5 + 0.5);
          const brightness = active ? wave : (0.05 + Math.sin(dist * 3 - t * 0.5) * 0.05 + 0.05);

          // Only draw if inside circle
          if (dist < 0.92) {
            const alpha = active ? (0.08 + brightness * 0.55) : (0.05 + brightness * 0.1);
            const cyanVal = connected ? 255 : calling ? 200 : 100;
            drawHex(x, y, hexR - 1,
              `rgba(0,${cyanVal},${connected?255:220},${alpha})`,
              `rgba(0,${cyanVal},${connected?255:220},${active ? 0.3 + brightness * 0.4 : 0.12})`,
              0.5
            );
          }
        }
      }

      // Outer ring
      ctx.strokeStyle = active ? (connected ? '#00ffff' : '#00aacc') : '#002233';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mid, mid, mid - 3, 0, Math.PI * 2); ctx.stroke();

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
  });
  onDestroy(() => cancelAnimationFrame(raf));
</script>
<canvas bind:this={canvas} width={size} height={size} {onclick} class="cursor-pointer rounded-full hover:scale-105 transition-transform duration-150" role="button" aria-label="Call button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && onclick()}></canvas>
