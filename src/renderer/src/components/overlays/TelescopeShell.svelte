<!-- The frame every telescopic dialog wears: backdrop, one box, two panes.
     Pixels only — behavior stays with the screen inside. The thread picker,
     the file search and the diff viewer all draw through this, so the three
     read as one family (spec D6). -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import Backdrop from './Backdrop.svelte'

  interface Props {
    onclose: () => void
    label: string
    /** Stacking order, per the reference in Backdrop. */
    z?: number
    /** The diff viewer's cut: a bigger box, a narrower list pane. */
    wide?: boolean
    /** The left pane: the list, and whatever caret or header drives it. */
    left: Snippet
    /** The right pane: the preview, or the diff. */
    right: Snippet
  }

  const { onclose, label, z = 50, wide = false, left, right }: Props = $props()
</script>

<Backdrop {onclose} {z} {label}>
  <div class="scope" class:wide>
    <div class="side">
      {@render left()}
    </div>
    <div class="main">
      {@render right()}
    </div>
  </div>
</Backdrop>

<style>
  .scope {
    display: flex;
    width: min(920px, 82vw);
    height: min(560px, 72vh);
    background: var(--bg-panel, #101014);
  }
  .scope.wide {
    width: min(1240px, 92vw);
    height: min(700px, 84vh);
  }

  /* The list is a step down from the pane beside it — that step is the only
     thing separating the two. */
  .side {
    display: flex;
    flex-direction: column;
    width: 42%;
    min-width: 0;
    background: rgba(255, 255, 255, 0.02);
  }
  .wide .side {
    width: clamp(200px, 26%, 320px);
    flex: none;
  }

  .main {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
