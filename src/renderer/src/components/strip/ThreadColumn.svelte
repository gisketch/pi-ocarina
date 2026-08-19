<script lang="ts">
  import type { Snippet } from 'svelte'
  import Icon from '../Icon.svelte'
  import { app } from '$lib/state/app.svelte'
  import LeapOverlay from '../thread/LeapOverlay.svelte'
  import { leap } from '$lib/state/leap.svelte'
  import type { Thread } from '$lib/types'
  import { askKeys } from '$lib/state/ask-keys.svelte'
  import { askNotice } from '$lib/state/ask-notice.svelte'
  import { revealBlock } from '$lib/state/block-focus.svelte'
  import { following } from '$lib/state/following.svelte'
  import { threads } from '$lib/state/threads.svelte'
  import { followColumn } from '$lib/state/follow-column.svelte'
  import { preferences } from '$lib/state/preferences.svelte'
  import { shortModelLabel } from '$lib/model-label'
  import FollowPill from '../thread/FollowPill.svelte'
  import Composer from '../Composer.svelte'

  interface Props {
    thread: Thread
    focused: boolean
    onfocus: () => void
    onmodel: () => void
    oncommit: () => void
    children?: Snippet
  }

  const { thread, focused, onfocus, onmodel, oncommit, children }: Props = $props()

  // The live model outranks the catalog's listing once the thread has spoken.
  const status = $derived(app.statusOf(thread))

  // Per the reference's thread-state dots: running pulses in the accent, failed is
  // red, a thread waiting on a person is amber (the gate colour), the focused
  // column stays accent, and everything else recedes to grey.
  const tone = $derived(
    status === 'failed'
      ? 'failed'
      : status === 'waiting-input'
        ? 'waiting'
        : status === 'running'
          ? 'running'
          : focused
            ? 'focused'
            : 'idle',
  )

  // The live model wins as soon as the thread has one, exactly as its status
  // does. A thread that has not opened yet names the default it will take —
  // by its id, which is all a preference records, and which is the same string
  // pi answers under.
  const chosen = $derived(preferences.defaultModel)
  const model = $derived(
    shortModelLabel(threads.get(thread.id).model ?? (chosen ? { name: chosen.id } : undefined)),
  )

  const asking = $derived(askKeys.pendingIn(thread.id) !== null)
  const below = $derived(askNotice.belowIn(thread.id))

  let body = $state<HTMLElement | null>(null)

  const follow = $derived(following.of(thread.id))

  // Following is a complete idea — what counts as an arrival, when to pin, and
  // how to pin without measuring per token — so it lives beside the machine it
  // drives rather than in the middle of a column's markup.
  const pin = followColumn(
    () => thread.id,
    () => body,
  )

  function reveal(): void {
    const askId = askKeys.pendingIn(thread.id)
    if (askId === null) return
    revealBlock(thread.id, askId, 'nearest')
    askNotice.seen(thread.id)
  }
</script>

<section
  class="column"
  class:focused
  aria-label={app.titleOf(thread)}
  onclickcapture={onfocus}
  role="presentation"
>
  <header class="head">
    <span class="dot {tone}"></span>
    {#if asking}
      <!-- A colour alone is a thing to learn; a question mark is a thing to
           read. It sits before the title so a strip of columns can be scanned
           down one edge. -->
      <span class="asking" title="waiting on an answer">?</span>
    {/if}
    <span class="title">{app.titleOf(thread)}</span>
    {#if thread.branch}
      <!-- The chip's presence is the isolation: a thread in the workspace's
           own folder carries nothing, so there is one thing to look for
           rather than two labels to compare. -->
      <span class="branch" title="worktree · {thread.branch}"><Icon name="branch" />{thread.branch}</span>
    {/if}
    <!-- Which model is answering here. The one fact about a thread that
         changes what its answers are worth, and it lived in the title bar for
         the focused column only — a strip running three models said so
         nowhere. It gives way before the title does: the title is what a
         reader needs, the model is what they scan for. -->
    <span class="model" title="model · {model}">{model}</span>
    <span class="meta">{thread.meta}</span>
  </header>

  <div
    class="body"
    class:leaping={leap.activeFor(thread.id)}
    bind:this={body}
    onscroll={pin.scrolled}
  >
    {@render children?.()}
    <LeapOverlay threadId={thread.id} />
  </div>

  {#if follow.showJump}
    <FollowPill unseen={follow.unseen} onjump={() => following.jump(thread.id)} />
  {/if}

  <!-- The column's own foot, drawn whether or not this column has the
       keyboard: a field that appeared and vanished as focus moved read as the
       app losing it, and a column with a draft in it should say so from
       across the strip. -->
  <Composer columnId={thread.id} {focused} {onmodel} {oncommit} />

  {#if below}
    <!-- The reader is reading history and a question is waiting past the fold.
         Nothing moved them; this is what carries it. -->
    <button type="button" class="below" onclick={() => reveal()}>
      ? a question below <span class="key">⏎</span>
    </button>
  {/if}
</section>

<style>
  .asking {
    color: var(--warn, var(--accent));
    font-family: var(--font-chrome);
    flex: none;
  }

  .below {
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 10px;
    padding: 6px 10px;
    /* It floats over the transcript, so it has to hide what it covers — a
       tint would let the text read through it. Accent mixed into the float
       colour rather than laid over it as a translucent layer. */
    background: color-mix(in srgb, var(--accent) 14%, var(--bg-float));
    font: inherit;
    font-size: 10.5px;
    color: var(--fg-bright);
    cursor: pointer;
  }
  .below .key {
    font-family: var(--font-chrome);
    font-size: 9.5px;
    color: var(--fg-dimmest);
  }

  .branch {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-chrome);
    font-size: 9.5px;
    letter-spacing: 0.08em;
    color: var(--accent);
    background: oklch(0.76 0.14 var(--accent-hue) / 0.15);
    padding: 2px 6px;
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: none;
  }

  .column {
    position: relative;
    width: var(--column-w);
    flex: none;
    display: flex;
    flex-direction: column;
    /* Which column has the reader is said by how light it is, and by nothing
       else. `--bg-column` travels with it: a ledger node paints the column's
       own ground to cover the spine, and a node still painting the idle value
       inside a focused column reads as a darker patch under every icon. */
    --bg-column: color-mix(in srgb, #ffffff 0.7%, var(--bg));
    background: var(--bg-column-idle);
    opacity: 0.4;
    transition:
      opacity 0.4s,
      background 0.4s;
    overflow: hidden;
    cursor: pointer;
  }
  .column.focused {
    --bg-column: color-mix(in srgb, #ffffff 1.6%, var(--bg));
    opacity: 1;
    background: var(--bg-column-focus);
    cursor: default;
  }

  .head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px 14px;
    background: var(--bg-header);
    font-size: 11px;
  }

  .dot {
    width: 6px;
    height: 6px;
    flex: none;
    background: var(--accent);
  }
  .dot.running {
    animation: pulse 1.1s ease-in-out infinite;
  }
  .dot.idle {
    background: var(--fg-dimmest);
  }
  .dot.failed {
    background: var(--err);
  }
  .dot.waiting {
    background: var(--warn);
    animation: pulse 1.1s ease-in-out infinite;
  }

  /* One line, always: a long name truncates rather than wrapping the header
     taller and pushing the transcript down. `min-width: 0` is what lets a
     flex item shrink past its content at all. */
  .title {
    color: var(--fg-bright);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Truncates rather than wrapping, and loses before the title: `min-width: 0`
     is what lets a flex item shrink past its content at all. */
  .model {
    margin-left: auto;
    color: var(--fg-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .meta {
    color: var(--fg-dimmest);
    flex: none;
  }

  .body {
    flex: 1;
    /* The leap overlay is positioned in this box's content coordinates. */
    position: relative;
    overflow-y: auto;
    /* The inline padding moved onto the blocks, so a focused block's band can
       reach both column edges. Padding on this box would have been a strip the
       band could not cross, and the highlight would have floated in a frame. */
    padding: var(--pad-column) 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
    font-family: var(--font-body);
    font-size: 12.5px;
  }
  /* The transcript keeps no scrollbar.
   *
   *  Its blocks are virtualized with `content-visibility`, so the column's
   *  height is an estimate that gets corrected as blocks are measured for the
   *  first time. A thumb sized from that estimate changes length while the
   *  reader scrolls — it reports the guess, not the thread. Removing it is the
   *  only way to stop that: the length cannot be stabilised without measuring
   *  every block up front, which is the cost virtualization exists to avoid.
   *
   *  Nothing is lost that the column does not already say. `PAUSED` in the bar
   *  and the follow pill both name the one position that matters — whether the
   *  reader is at the live end. */
  .body::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  /* A leaping column goes quiet by re-pointing its colour tokens at one muted
     grey, rather than by `opacity` or `filter`.
     Both of those would take the match paint down with everything else: a
     highlight is painted as part of the text it covers and cannot escape an
     ancestor's compositing. Re-pointing the tokens leaves the highlight, which
     names its own colours, as the only lit thing in the column. */
  .body.leaping {
    --fg-bright: var(--fg-dimmer);
    --fg-body: var(--fg-dimmer);
    --fg: var(--fg-dimmer);
    --fg-agent: var(--fg-dimmer);
    --fg-muted: var(--fg-dimmer);
    --fg-dim: var(--fg-dimmer);
    --fg-dimmest: var(--fg-dimmer);
    --accent: var(--fg-dimmer);
    --ok: var(--fg-dimmer);
    --ok-text: var(--fg-dimmer);
    --err: var(--fg-dimmer);
    --err-text: var(--fg-dimmer);
    --warn: var(--fg-dimmer);
    --tone-1: var(--fg-dimmer);
    --tone-2: var(--fg-dimmer);
    --tone-3: var(--fg-dimmer);
  }

  /* Scrollback virtualization.
     Every block is skipped by layout and paint while it is off-screen, which is
     what keeps a five-thousand-block thread scrolling. This is done with
     `content-visibility` rather than by windowing the list in JavaScript,
     deliberately: the blocks stay in the DOM, so expand/collapse state, scroll
     anchoring, text selection and find-in-page all keep working — a hand-rolled
     window silently breaks each of those. `contain-intrinsic-size` gives the
     scrollbar a stable estimate so it does not jump as blocks are measured. */
  .body > :global(*) {
    content-visibility: auto;
    contain-intrinsic-size: auto 120px;
    padding-inline: var(--pad-column);
    /* Blocks are flex items, and a flex item's default `flex-shrink: 1` is
       what silently destroyed the estimate above: when the column overflows,
       the browser shrinks every *skipped* block toward zero — its min-content
       is nothing while its layout is skipped — so a ninety-turn thread's
       unmeasured scrollback added up to almost no scroll height at all.
       Every page-distance was then computed against a collapsed layout that
       exploded the moment its blocks were measured: `ctrl-u` flew across
       dozens of turns, the bottom ran away from `ctrl-d`, and each
       collapse/expand under the view was the flicker. Blocks never share a
       fixed budget, so they must never shrink. */
    flex: none;
  }

  /* The last block is exempt: it is the one that streams, and skipping its
     layout while tokens arrive would make the caret stutter. */
  .body > :global(*:last-child) {
    content-visibility: visible;
  }
</style>
