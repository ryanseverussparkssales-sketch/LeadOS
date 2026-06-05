<script lang="ts">
  import { browser } from '$app/environment';
  import OrbDial from './dial-buttons/OrbDial.svelte';
  import CoinDial from './dial-buttons/CoinDial.svelte';
  import MandalaDial from './dial-buttons/MandalaDial.svelte';
  import LotusDial from './dial-buttons/LotusDial.svelte';
  import FleurDial from './dial-buttons/FleurDial.svelte';
  import OnyxDial from './dial-buttons/OnyxDial.svelte';
  import SilverDial from './dial-buttons/SilverDial.svelte';

  let { callState, onclick, size = 90 }: Props = $props();
  type Props = { callState: string; onclick: () => void; size?: number; }

  // Curated elegant gallery (metals, stone + symbol crests). Older garish skins retired.
  const MAP: Record<string, any> = {
    mandala: MandalaDial,
    lotus:   LotusDial,
    fleur:   FleurDial,
    onyx:    OnyxDial,
    silver:  SilverDial,
    orb:     OrbDial,
    coin:    CoinDial,
  };

  let selected = $state('mandala');

  if (browser) {
    selected = localStorage.getItem('rogueos_dial_button') ?? 'mandala';
  }

  const Component = $derived(MAP[selected] ?? MandalaDial);
</script>

<Component {callState} {onclick} {size} />
