<script lang="ts">
  import CounterDial from './dial-buttons/CounterDial.svelte';
  import OrbDial from './dial-buttons/OrbDial.svelte';
  import LogoDial from './dial-buttons/LogoDial.svelte';
  import CoinDial from './dial-buttons/CoinDial.svelte';
  import WaveformDial from './dial-buttons/WaveformDial.svelte';
  import RadarDial from './dial-buttons/RadarDial.svelte';
  import PlasmaDial from './dial-buttons/PlasmaDial.svelte';
  import HexDial from './dial-buttons/HexDial.svelte';
  import NeuralDial from './dial-buttons/NeuralDial.svelte';
  import SpeedDial from './dial-buttons/SpeedDial.svelte';

  let { selected, onselect }: Props = $props();
  type Props = { selected: string; onselect: (id: string) => void; }

  const BUTTONS = [
    { id: 'counter',  label: 'Counter',  component: CounterDial },
    { id: 'orb',      label: 'Orb',      component: OrbDial },
    { id: 'logo',     label: 'Logo',     component: LogoDial },
    { id: 'coin',     label: 'Coin',     component: CoinDial },
    { id: 'waveform', label: 'Waveform', component: WaveformDial },
    { id: 'radar',    label: 'Radar',    component: RadarDial },
    { id: 'plasma',   label: 'Plasma',   component: PlasmaDial },
    { id: 'hex',      label: 'Hex',      component: HexDial },
    { id: 'neural',   label: 'Neural',   component: NeuralDial },
    { id: 'speed',    label: 'Speed',    component: SpeedDial },
  ];
</script>

<div class="grid grid-cols-5 gap-4">
  {#each BUTTONS as btn}
    <div class="flex flex-col items-center gap-2">
      <div class="relative cursor-pointer" onclick={() => onselect(btn.id)}>
        <svelte:component this={btn.component} callState="idle" onclick={() => onselect(btn.id)} size={70} />
        {#if selected === btn.id}
          <div class="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
            <span class="text-white text-[10px] font-bold leading-none">✓</span>
          </div>
        {/if}
      </div>
      <span class="text-[10px] text-[#555] text-center leading-tight">{btn.label}</span>
    </div>
  {/each}
</div>
