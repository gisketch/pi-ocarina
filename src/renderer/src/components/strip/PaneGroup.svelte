<script lang="ts">
  import type { Thread, Workspace } from '$lib/types'
  import { threadOf } from '$lib/types'
  import Dashboard from './Dashboard.svelte'
  import FileColumn from './FileColumn.svelte'
  import LiveThread from './LiveThread.svelte'
  import TerminalColumn from './TerminalColumn.svelte'
  import ThreadColumn from './ThreadColumn.svelte'
  import { flip } from 'svelte/animate'
  import { quintOut } from 'svelte/easing'
  import { COLUMN_GAP, paneGroupWidth, paneRegime } from '$lib/strip'
  import { swapDuration } from '$lib/motion'

  const {
    workspace,
    host,
    attachment,
    focusedId,
    viewportWidth,
    onfocus,
    onmodel,
    oncommit,
  }: {
    workspace: Workspace
    host: Thread
    attachment?: Thread
    focusedId: string
    viewportWidth: number
    onfocus: (id: string) => void
    onmodel: () => void
    oncommit: () => void
  } = $props()

  const live = $derived(threadOf(host))
  const attached = $derived(attachment !== undefined)
  const regime = $derived(paneRegime(attached, viewportWidth))
  const width = $derived(paneGroupWidth(attached, regime))

  /** The members in visual order, keyed so a side change is a reorder of the
   *  same DOM — which keeps xterm alive across the swap and gives FLIP a
   *  move to animate instead of a teleport. */
  const members = $derived.by((): { id: string; kind: 'host' | 'attachment' }[] => {
    if (attachment === undefined) return [{ id: host.id, kind: 'host' }]
    const ordered = [
      { id: host.id, kind: 'host' as const },
      { id: attachment.id, kind: 'attachment' as const },
    ]
    return attachment.attachment?.side === 'left' ? ordered.reverse() : ordered
  })
</script>

<div
  class="pane-group"
  class:attached
  class:split={regime === 'split'}
  style:width={`${width}px`}
  style:gap={regime === 'split' ? `${COLUMN_GAP}px` : ''}
>
  {#each members as member (member.id)}
    <div
      class="member"
      class:host={member.kind === 'host'}
      class:attachment={member.kind === 'attachment'}
      class:active={focusedId === member.id}
      animate:flip={{ duration: swapDuration(), easing: quintOut }}
    >
      {#if member.kind === 'attachment' && attachment !== undefined}
        <TerminalColumn
          terminalId={attachment.id}
          workspaceId={workspace.id}
          name={workspace.name}
          focused={focusedId === attachment.id}
          onfocus={() => onfocus(attachment.id)}
        />
      {:else if host.fresh}
        <Dashboard
          {workspace}
          columnId={host.id}
          focused={focusedId === host.id}
          {onmodel}
          {oncommit}
        />
      {:else if host.file !== undefined}
        <FileColumn
          columnId={host.id}
          focused={focusedId === host.id}
          onfocus={() => onfocus(host.id)}
        />
      {:else if live}
        <ThreadColumn
          thread={host}
          focused={focusedId === host.id}
          onfocus={() => onfocus(host.id)}
          {onmodel}
          {oncommit}
        >
          <LiveThread threadId={live} />
        </ThreadColumn>
      {/if}
    </div>
  {/each}
</div>

<style>
  .pane-group {
    height: 100%;
    display: flex;
    flex: none;
  }

  .member {
    width: var(--column-w);
    height: 100%;
    flex: none;
    min-width: 0;
    transition: opacity var(--dur-fast) ease;
  }

  /* The inactive member recedes by opacity, never by `filter`: a filter here
     re-rasters the whole member on every content change, and one member is a
     live streaming column — exactly the per-frame paint cost the
     frame-interval sweep in docs/quality.md exists to catch. Opacity is the
     compositor's to blend, so a token stream in one pane paints nothing in
     the other. The column already dims itself against the strip
     (ThreadColumn drops to 0.4 unfocused); this layer only tells host and
     attachment apart inside one group, so it stays light. */
  .member:not(.active) {
    opacity: 0.75;
  }

  /* Members never resize with the viewport: the regime moves the strip
     around fixed boxes (spec: pane-reveal). A width that followed the window
     would re-wrap a live terminal on every drag of the sash. */
  .pane-group.attached .host {
    width: var(--column-w);
  }

  .pane-group.attached .attachment {
    width: 390px;
  }
</style>
