<script lang="ts">
  import OrbDial from './dial-buttons/OrbDial.svelte';
  import CoinDial from './dial-buttons/CoinDial.svelte';
  import MandalaDial from './dial-buttons/MandalaDial.svelte';
  import LotusDial from './dial-buttons/LotusDial.svelte';
  import FleurDial from './dial-buttons/FleurDial.svelte';
  import OnyxDial from './dial-buttons/OnyxDial.svelte';
  import SilverDial from './dial-buttons/SilverDial.svelte';

  let { selected, onselect }: Props = $props();
  type Props = { selected: string; onselect: (id: string) => void; }

  const BUTTONS = [
    { id: 'mandala', label: 'Mandala',      component: MandalaDial },
    { id: 'lotus',   label: 'Lotus',        component: LotusDial },
    { id: 'fleur',   label: 'Fleur-de-lis', component: FleurDial },
    { id: 'onyx',    label: 'Onyx',         component: OnyxDial },
    { id: 'silver',  label: 'Platinum',     component: SilverDial },
    { id: 'orb',     label: 'Orb',          component: OrbDial },
    { id: 'coin',    label: 'Coin',         component: CoinDial },
  ];
</script>

<div class="grid grid-cols-5 gap-4">
  {#each BUTTONS as btn}
    <div class="flex flex-col items-center gap-2">
      <div class="relative cursor-pointer" onclick={() => onselect(btn.id)}>
        <svelte:component this={btn.component} callState="idle" onclick={() => onselect(btn.id)} size={70} />
        {#if selected === btn.id}
          <div class="absolute -top-1 -right-1 w-4 h-4 bg-[var(--call)] rounded-full flex items-center justify-center shadow-lg">
            <span class="text-[var(--call-ink)] text-[10px] font-bold leading-none">✓</span>
          </div>
        {/if}
      </div>
      <span class="text-[10px] text-[#555] text-center leading-tight">{btn.label}</span>
    </div>
  {/each}
</div>
