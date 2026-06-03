<script lang="ts">
  import { browser } from '$app/environment';
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

  let { callState, onclick, size = 90 }: Props = $props();
  type Props = { callState: string; onclick: () => void; size?: number; }

  const MAP: Record<string, any> = {
    counter:  CounterDial,
    orb:      OrbDial,
    logo:     LogoDial,
    coin:     CoinDial,
    waveform: WaveformDial,
    radar:    RadarDial,
    plasma:   PlasmaDial,
    hex:      HexDial,
    neural:   NeuralDial,
    speed:    SpeedDial,
  };

  let selected = $state('orb');

  if (browser) {
    selected = localStorage.getItem('leados_dial_button') ?? 'orb';
  }

  const Component = $derived(MAP[selected] ?? OrbDial);
</script>

<Component {callState} {onclick} {size} />
