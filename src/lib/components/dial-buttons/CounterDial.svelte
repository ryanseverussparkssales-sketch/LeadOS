<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  let { callState, onclick, size = 90 }: Props = $props();
  type Props = { callState: string; onclick: () => void; size?: number; }
  let canvas: HTMLCanvasElement;
  let raf: number; let t = 0;
  onMount(() => {
    const ctx = canvas.getContext('2d')!;
    const draw = (ts: number) => {
      t = ts/1000; ctx.clearRect(0,0,size,size);
      const calling = callState === 'calling', connected = callState === 'connected';
      const mid = size/2, r = size/2-2;
      ctx.fillStyle='#020a04'; ctx.beginPath(); ctx.arc(mid,mid,r,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=connected?'#00ff44':calling?'#00cc33':'#1a3010'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(mid,mid,r-4,0,Math.PI*2); ctx.stroke();
      const n = connected ? Math.floor(t%60) : Math.floor(t*(calling?8:3))%100;
      ctx.fillStyle=calling||connected?'#00ff44':'#0a4';
      ctx.font=`bold ${size*0.25}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(String(n).padStart(2,'0'), mid, mid*0.92);
      ctx.font=`${size*0.1}px monospace`; ctx.fillStyle='#0a3';
      ctx.fillText(connected?'LIVE':calling?'RING':'DIAL', mid, mid*1.35);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
  });
  onDestroy(() => cancelAnimationFrame(raf));
</script>
<canvas bind:this={canvas} width={size} height={size} {onclick} class="cursor-pointer rounded-full hover:scale-105 transition-transform duration-150" role="button" aria-label="Call button" tabindex="0" onkeydown={(e)=>e.key==='Enter'&&onclick()}></canvas>
