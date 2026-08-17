<script lang="ts">
  /** The chips the composer appears to contain.
   *
   *  A `<textarea>` cannot hold elements, so this draws the same string behind
   *  it and the textarea's own glyphs are painted transparent on top. The
   *  caret, the selection and every keystroke still belong to the real field.
   *
   *  **Decorate, never re-flow.** Every rule here is colour, `background` or
   *  `outline` — nothing that occupies space. A single pixel of padding on a
   *  chip would shift every glyph after it and the caret would sit in the wrong
   *  place for the rest of the message. The metrics live in one class shared
   *  with the textarea, so they cannot drift apart. */
  import { segment } from '$lib/composer-segments'
  import type { Fold } from '$lib/paste'

  const {
    text,
    folds,
    /** How far the real field has scrolled.
     *
     *  The mirror has to follow it exactly. A composer taller than its box
     *  scrolls, and a mirror that stayed put would leave every chip behind,
     *  attached to whatever words happened to be at that height. Measured in
     *  the harness before this existed: the field at 200, the mirror at 0. */
    scrollTop = 0,
  }: { text: string; folds: readonly Fold[]; scrollTop?: number } = $props()

  const parts = $derived(segment(text, folds))

  let box = $state<HTMLDivElement | null>(null)

  $effect(() => {
    if (box) box.scrollTop = scrollTop
  })
</script>

<!-- `aria-hidden`: the textarea above is the real control, and a screen reader
     meeting the same words twice would read the message twice. -->
<div bind:this={box} class="mirror field-metrics" aria-hidden="true">{#each parts as part, i (i)}{#if part.kind === 'plain'}{part.text}{:else}<span
        class={part.kind}>{part.text}</span
      >{/if}{/each}</div>

<style>
  /* The mirror paints every visible glyph; the textarea above it is painted
     transparent and keeps only the caret and the selection. */
  .mirror {
    position: absolute;
    inset: 0;
    pointer-events: none;
    color: var(--fg-body);
    overflow: hidden;
  }

  /* Colour and an outline only. Both paint outside the layout box, so the
     glyphs stay exactly where the textarea put them. */
  .mention {
    color: var(--accent);
    background: oklch(0.76 0.14 var(--accent-hue) / 0.1);
    outline: 1px solid oklch(0.76 0.14 var(--accent-hue) / 0.32);
  }
  .fold {
    color: var(--fg-dim);
    background: var(--bg-hover);
    outline: 1px solid var(--line-strong);
  }
</style>
