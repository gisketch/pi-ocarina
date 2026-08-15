<script lang="ts">
  import { identicon } from '$lib/identicon'

  interface Props {
    name: string
    hue: number
    size: number
  }

  const { name, hue, size }: Props = $props()
  const cells = $derived(identicon(name, hue))
</script>

<span class="sigil" style:width="{size}px" style:height="{size}px" aria-hidden="true">
  {#each cells as bg, i (i)}
    <span style:background={bg}></span>
  {/each}
</span>

<style>
  .sigil {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    grid-template-rows: repeat(5, 1fr);
    flex: none;
  }
</style>
