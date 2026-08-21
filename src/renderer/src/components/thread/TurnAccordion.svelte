<script lang="ts">
  /** One row per turn's work: `worked for 1m39s ›`.
   *
   *  The header of the turn accordion (spec 2026-08-21). While the turn runs
   *  it ticks — the role `TurnFooter` used to play — and stays open above the
   *  streaming work; resolution collapses the work behind it, however the
   *  turn resolved. The row is bare on purpose: no digest, no counts.
   *
   *  Only the header lives here. What it hides is rendered by `ThreadView`,
   *  because the members must draw exactly as they always did — the accordion
   *  is a visibility toggle, not a layout. */
  import Icon from '../Icon.svelte'
  import Identicon from '../Identicon.svelte'
  import BlockMenu from './BlockMenu.svelte'
  import { chevron } from '$lib/ledger'
  import { elapsed } from '$lib/elapsed'
  import { accordionLabel, accordionNavId } from '$lib/turn-accordion'
  import { clock } from '$lib/state/clock.svelte'
  import { navTarget, revealBlock } from '$lib/state/block-focus.svelte'
  import { blockMenu } from '$lib/state/block-menu.svelte'
  import { toolOpen } from '$lib/state/tool-open.svelte'
  import type { TurnSpan } from '$lib/thread'

  const {
    turnId,
    threadId,
    span,
    resolved,
    open,
    focusedNav,
    workspaceName,
    hue,
  }: {
    turnId: string
    threadId: string
    /** The turn's clock, when this session timed it. A replayed turn has
     *  none, and its row says only `worked`. */
    span: TurnSpan | undefined
    resolved: boolean
    open: boolean
    focusedNav: string | null
    /** The header is the turn's whole byline — there is no `PI` label above
     *  it — so it wears the workspace's own sigil instead of a dot. */
    workspaceName: string
    hue: number
  } = $props()

  const navId = $derived(accordionNavId(turnId))
  const menuOn = $derived(
    blockMenu.open && blockMenu.threadId === threadId && blockMenu.block?.id === navId,
  )

  // Only an unresolved header watches the clock — same discipline as the
  // footer it replaces: a thread full of finished turns holds nothing ticking.
  $effect(() => {
    if (resolved) return
    return clock.watch()
  })

  /** A click expands like `l` does: opening rides the header to the top of
   *  the view, so the revealed work unfolds below the row that names it. */
  function toggle(): void {
    toolOpen.toggle(threadId, navId, !resolved)
    if (!open) revealBlock(threadId, navId, 'start')
  }

  const took = $derived(span ? elapsed((span.endedAt ?? clock.now) - span.startedAt) : null)
  const label = $derived(
    !resolved && span === undefined
      ? 'working'
      : accordionLabel(took, resolved ? (span?.outcome ?? 'done') : 'running'),
  )
</script>

<div
  class="accordion"
  class:lit={focusedNav === navId}
  class:hosting={menuOn}
  use:navTarget={{ threadId, navId }}
>
  {#if menuOn}
    <BlockMenu />
  {/if}
  <button class="row" onclick={toggle}>
    <span class="sigil" class:running={!resolved}>
      <Identicon name={workspaceName} {hue} size={11} />
    </span>
    <span class="label">{label}</span>
    <span class="chev"><Icon name={chevron(open)} /></span>
  </button>
</div>

<style>
  .accordion {
    position: relative;
    contain: layout style;
  }
  /* Containment clips descendants; the menu is taller than the row. */
  .accordion.hosting {
    content-visibility: visible;
    contain: none;
    z-index: 5;
  }

  /* No left padding: the sigil sits on the same left edge as the messages
     and the prose around it — six pixels of button padding read as the one
     row in the column that drifted. */
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 6px 4px 0;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    color: inherit;
  }
  .row:hover {
    background: var(--bg-hover);
  }

  .sigil {
    display: inline-flex;
    flex: none;
  }
  .sigil.running {
    animation: pulse 1.1s ease-in-out infinite;
  }

  /* The message's size, not the chrome's: this row is the turn's byline —
     there is no `PI` label above it any more — and a ten-pixel whisper under
     a twelve-and-a-half-pixel answer read as chrome, not as speech. */
  .label {
    font-family: var(--font-chrome);
    font-size: 12.5px;
    letter-spacing: 0.04em;
    color: var(--fg-dim);
  }

  .chev {
    color: var(--fg-dimmest);
  }
</style>
