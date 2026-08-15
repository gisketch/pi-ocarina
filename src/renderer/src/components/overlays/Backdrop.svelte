<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    onclose: () => void
    /** Stacking order per the reference: switcher 50, keymap 55, palette 60. */
    z: number
    align?: 'center' | 'top'
    label: string
    children: Snippet
  }

  const { onclose, z, align = 'center', label, children }: Props = $props()
</script>

<!-- Backdrop click closes; the keyboard layer owns Escape. -->
<div
  class="backdrop {align}"
  style:z-index={z}
  role="dialog"
  aria-modal="true"
  aria-label={label}
  tabindex="-1"
  onclick={onclose}
  onkeydown={() => {}}
>
  <div
    class="panel"
    role="presentation"
    onclick={(event) => event.stopPropagation()}
  >
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(8, 8, 10, 0.6);
    backdrop-filter: blur(6px);
    display: flex;
    justify-content: center;
    animation: fade 0.15s ease;
  }
  .backdrop.center {
    align-items: center;
  }
  .backdrop.top {
    padding-top: 14vh;
    align-items: flex-start;
    background: rgba(8, 8, 10, 0.55);
    backdrop-filter: blur(5px);
  }

  .panel {
    height: fit-content;
  }
</style>
