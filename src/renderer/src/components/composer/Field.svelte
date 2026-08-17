<script lang="ts">
  /** The composer's text field: the real textarea, and the mirror that draws
   *  its chips.
   *
   *  The two live in one file because they have one shared invariant — every
   *  metric that decides where a glyph lands must be identical, or the caret
   *  drifts away from the words. Keeping them apart meant that rule lived in
   *  two stylesheets and could be broken by editing either. */
  import Mirror from './Mirror.svelte'
  import type { Fold } from '$lib/paste'

  interface Props {
    value: string
    folds: readonly Fold[]
    element?: HTMLTextAreaElement | null
    placeholder: string
    onkeydown: (event: KeyboardEvent) => void
    onpaste: (event: ClipboardEvent) => void
    /** Any event that could have moved the caret or changed the text. */
    onmove: () => void
    oninput: () => void
    onfocus: () => void
    onblur: () => void
  }

  let {
    value = $bindable(),
    folds,
    element = $bindable(null),
    placeholder,
    onkeydown,
    onpaste,
    onmove,
    oninput,
    onfocus,
    onblur,
  }: Props = $props()

  /** The field scrolls; the mirror has to scroll with it or every chip is left
   *  on whatever words happen to sit at that height. */
  let scrolled = $state(0)
</script>

<div class="field">
  <Mirror text={value} {folds} scrollTop={scrolled} />
  <textarea
    bind:this={element}
    bind:value
    {placeholder}
    {onkeydown}
    {onpaste}
    {onfocus}
    {onblur}
    {oninput}
    onselect={onmove}
    onclick={onmove}
    onkeyup={onmove}
    onscroll={() => (scrolled = element?.scrollTop ?? 0)}
    rows="1"
  ></textarea>
</div>

<style>
  /* A stacking context, so the mirror sits exactly under the textarea's
     glyphs. */
  .field {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
  }

  /* Everything that decides where a glyph lands, in one place. The mirror
     carries `field-metrics` too — if the two ever disagree, the caret drifts
     away from the words it is standing in. */
  textarea,
  .field :global(.field-metrics) {
    font-family: var(--font-body);
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    padding: 0;
    margin: 0;
    border: none;
  }

  textarea {
    flex: 1;
    position: relative;
    background: transparent;
    outline: none;
    /* Transparent, not hidden: the caret and the selection are the browser's
       and have to stay visible over the mirror's chips. */
    color: transparent;
    caret-color: var(--accent);
    resize: none;
    overflow-y: auto;
    min-width: 0;
    scrollbar-width: thin;
    scrollbar-color: #2c2c33 transparent;
  }
  textarea::placeholder {
    color: var(--fg-dimmest);
  }
</style>
