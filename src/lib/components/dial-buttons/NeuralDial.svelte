<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  let { callState, onclick, size = 90 }: Props = $props();
  type Props = { callState: string; onclick: () => void; size?: number; }
  let canvas: HTMLCanvasElement;
  let raf: number;

  onMount(() => {
    const ctx = canvas.getContext('2d')!;

    // Generate stable node positions
    const nodeCount = 9;
    const nodes: { x: number; y: number; phase: number }[] = [];
    const mid = size / 2;
    const r = mid * 0.7;

    // Center node
    nodes.push({ x: mid, y: mid, phase: 0 });
    // Ring nodes
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
      nodes.push({
        x: mid + Math.cos(angle) * r * 0.65,
        y: mid + Math.sin(angle) * r * 0.65,
        phase: i * 0.8
      });
    }
    // Outer nodes
    for (let i = 0; i < 2; i++) {
      const angle = (i / 2) * Math.PI * 2 + Math.PI / 6;
      nodes.push({
        x: mid + Math.cos(angle) * r * 0.9,
        y: mid + Math.sin(angle) * r * 0.9,
        phase: i * 1.5
      });
    }

    // Connections: center to all ring, some ring-to-ring
    const connections: [number, number][] = [
      [0,1],[0,2],[0,3],[0,4],[0,5],[0,6],
      [1,2],[2,3],[3,4],[4,5],[5,6],[6,1],
      [1,7],[4,8],[7,3],[8,5]
    ];

    const draw = (ts: number) => {
      const t = ts / 1000;
      ctx.clearRect(0, 0, size, size);
      const calling = callState === 'calling';
      const connected = callState === 'connected';
      const active = calling || connected;
      const pulseSpeed = calling ? 5 : connected ? 2.5 : 0.8;

      // Clip to circle
      ctx.save();
      ctx.beginPath(); ctx.arc(mid, mid, mid - 1, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#06000e';
      ctx.fillRect(0, 0, size, size);

      // Outer ring
      ctx.strokeStyle = active ? (connected ? '#aa44ff' : '#7700ff') : '#200040';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mid, mid, mid - 3, 0, Math.PI * 2); ctx.stroke();

      // Draw connections with pulse
      for (const [a, b] of connections) {
        const na = nodes[a], nb = nodes[b];
        const pulse = Math.sin(t * pulseSpeed + na.phase + nb.phase) * 0.5 + 0.5;
        const alpha = active ? (0.1 + pulse * 0.5) : (0.05 + pulse * 0.1);

        ctx.beginPath();
        ctx.moveTo(na.x, na.y); ctx.lineTo(nb.x, nb.y);
        ctx.strokeStyle = active
          ? `rgba(${connected ? '180,100,255' : '120,50,255'},${alpha})`
          : `rgba(80,30,120,${alpha})`;
        ctx.lineWidth = active ? (0.5 + pulse * 1) : 0.5;
        ctx.stroke();

        // Traveling signal dot
        if (active) {
          const progress = (t * (calling ? 1.5 : 0.8) + na.phase * 0.3) % 1;
          const sx = na.x + (nb.x - na.x) * progress;
          const sy = na.y + (nb.y - na.y) * progress;
          ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = connected ? `rgba(200,150,255,${pulse * 0.8})` : `rgba(150,80,255,${pulse * 0.6})`;
          ctx.fill();
        }
      }

      // Draw nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const pulse = Math.sin(t * pulseSpeed + n.phase) * 0.5 + 0.5;
        const r = active ? (2.5 + pulse * 2) : (1.5 + pulse * 0.5);

        // Glow
        if (active) {
          const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3);
          glow.addColorStop(0, `rgba(${connected ? '200,100,255' : '140,60,255'},${0.3 + pulse * 0.3})`);
          glow.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(n.x, n.y, r * 3, 0, Math.PI * 2); ctx.fill();
        }

        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = active
          ? (connected ? `rgba(220,150,255,${0.7 + pulse * 0.3})` : `rgba(160,80,255,${0.6 + pulse * 0.3})`)
          : `rgba(80,30,120,0.5)`;
        ctx.fill();
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
  });
  onDestroy(() => cancelAnimationFrame(raf));
</script>
<canvas bind:this={canvas} width={size} height={size} {onclick} class="cursor-pointer rounded-full hover:scale-105 transition-transform duration-150" role="button" aria-label="Call button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && onclick()}></canvas>
