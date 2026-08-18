<script lang="ts">
  /** One mark, at one size, in the current colour.
   *
   *  Every icon in the app comes through here, so size and optical alignment
   *  are decided once. Components name what they mean — `chevron-right`,
   *  `branch` — and never import a pack: the registry is the only place that
   *  knows which pack an icon came from.
   *
   *  The SVG is inlined with `{@html}`. What it inlines is a build-time
   *  constant from the registry — never anything a message, a tool, or a page
   *  put there — so there is nothing here for a string to smuggle in. */
  import { iconSvg, type IconName } from '$lib/icons'

  interface Props {
    name: IconName
    /** Falls back to the row's font size, so an icon in a 10px chrome label is
     *  smaller than one in a 12px row without either being told. */
    size?: number
    /** Read by assistive tech. Absent means decorative — the text beside it
     *  already says what it is, which is the common case. */
    label?: string
  }

  const { name, size, label }: Props = $props()
</script>

<span
  class="icon"
  style={size === undefined ? undefined : `--icon: ${size}px`}
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : true}>{@html iconSvg(name)}</span
>

<style>
  /* `1em` by default, so an icon is the size of the text it sits in. The
     -0.12em nudge is the optical baseline: an SVG box sits on the baseline
     while a glyph's mass sits above it, and without this every icon rides low
     against the words beside it. */
  .icon {
    display: inline-flex;
    width: var(--icon, 1em);
    height: var(--icon, 1em);
    flex: none;
    vertical-align: -0.12em;
  }
  .icon :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
    /* Codicons say this on the element; the brand marks do not, and an SVG
       with no fill is black. Saying it here covers both packs. */
    fill: currentColor;
  }
</style>
