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
  import { iconSvg, type IconName } from '$lib/icons'
  import type { Fold } from '$lib/paste'

  /** An icon as a CSS mask. The chip's mark is painted with `background-color:
   *  currentColor` through this, so it takes the chip's own colour and needs
   *  no second copy per theme. */
  const mask = (name: IconName): string =>
    `url("data:image/svg+xml,${encodeURIComponent(iconSvg(name))}")`

  const MARKS = {
    '--mark-file': mask('file'),
    '--mark-skill': mask('tool-skill'),
    '--mark-fold': mask('tool-write'),
  }

  const {
    text,
    folds,
    /** Names of files staged for this message. Each occurrence in the text is
     *  drawn as a chip — the file *is* where the reader typed it, so it does
     *  not need a row of its own above the composer. */
    files = [],
    /** Names of skills this workspace loaded. A `/name` in the text is a chip
     *  only when a skill answers to it — otherwise it is a path. */
    skills = [],
    /** How far the real field has scrolled.
     *
     *  The mirror has to follow it exactly. A composer taller than its box
     *  scrolls, and a mirror that stayed put would leave every chip behind,
     *  attached to whatever words happened to be at that height. Measured in
     *  the harness before this existed: the field at 200, the mirror at 0. */
    scrollTop = 0,
  }: {
    text: string
    folds: readonly Fold[]
    files?: readonly string[]
    skills?: readonly string[]
    scrollTop?: number
  } = $props()

  const parts = $derived(segment(text, folds, files, skills))

  let box = $state<HTMLDivElement | null>(null)

  $effect(() => {
    if (box) box.scrollTop = scrollTop
  })
</script>

<!-- `aria-hidden`: the textarea above is the real control, and a screen reader
     meeting the same words twice would read the message twice. -->
<div
  bind:this={box}
  class="mirror field-metrics"
  aria-hidden="true"
  style:--mark-file={MARKS['--mark-file']}
  style:--mark-skill={MARKS['--mark-skill']}
  style:--mark-fold={MARKS['--mark-fold']}
>{#each parts as part, i (i)}{#if part.kind === 'plain'}{part.text}{:else}<span
        class={part.kind}><span class="lead">{part.text.slice(0, part.lead)}</span>{part.text.slice(
          part.lead,
        )}</span
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

  /* Every chip is one class, and none of it occupies space — the contract this
     whole file rests on, since a single pixel of padding would shift every
     glyph after it and take the caret with it.
     So the padding is a *character*: the whitespace in front of the chip is
     inside it, tinted with it, and the mark stands on it. Nothing paints
     outside the box, which is what stops two chips side by side from
     overlapping: they share an edge instead. */
  .file,
  .mention,
  .fold,
  .skill {
    position: relative;
    border-radius: 3px;
  }

  /* A staged file, and a path the reader named. The same thing to a reader:
     a file this message is about. */
  .file,
  .mention {
    color: var(--accent);
    background: oklch(0.76 0.14 var(--accent-hue) / 0.13);
    outline: 1px solid oklch(0.76 0.14 var(--accent-hue) / 0.3);
    outline-offset: -1px;
  }
  .fold {
    color: var(--fg-dim);
    background: var(--bg-hover);
    outline: 1px solid var(--line-strong);
    outline-offset: -1px;
  }

  /* A skill. Its own colour rather than the accent, because it is a different
     kind of thing: a file is what the message is *about*, a skill is how the
     agent should go about it. */
  .skill {
    color: var(--warn);
    background: oklch(0.84 0.12 85 / 0.13);
    outline: 1px solid oklch(0.84 0.12 85 / 0.32);
    outline-offset: -1px;
  }

  /* The mark stands on the chip's own first characters — the space in front of
     it, and the `@` or `/` that was already saying "this is a reference".
     Those cells keep their place in the flow and give up only their ink, which
     is the only way a mirror that may not occupy space can carry a mark.

     Anchored to the *lead* rather than to the chip, so it gets exactly as many
     cells as that chip claimed: two for a skill, and the second is the gap
     before the name. Sized in pixels and aligned left, so nothing is squeezed
     into a cell narrower than the mark. */
  .lead {
    position: relative;
    color: transparent;
  }
  .lead::before {
    content: '';
    position: absolute;
    left: 3px;
    top: 50%;
    width: 11px;
    height: 11px;
    transform: translateY(-50%);
    background-color: currentColor;
    mask-size: 11px 11px;
    mask-position: center;
    mask-repeat: no-repeat;
    -webkit-mask-size: 11px 11px;
    -webkit-mask-position: center;
    -webkit-mask-repeat: no-repeat;
  }
  .mention > .lead::before,
  .file > .lead::before {
    mask-image: var(--mark-file);
    -webkit-mask-image: var(--mark-file);
  }
  .skill > .lead::before {
    mask-image: var(--mark-skill);
    -webkit-mask-image: var(--mark-skill);
  }

  .fold > .lead::before {
    mask-image: var(--mark-fold);
    -webkit-mask-image: var(--mark-fold);
  }


</style>
