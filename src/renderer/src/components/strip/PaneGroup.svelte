<script lang="ts">
  import type { Thread, Workspace } from '$lib/types'
  import { threadOf } from '$lib/types'
  import Dashboard from './Dashboard.svelte'
  import FileColumn from './FileColumn.svelte'
  import LiveThread from './LiveThread.svelte'
  import TerminalColumn from './TerminalColumn.svelte'
  import ThreadColumn from './ThreadColumn.svelte'
  import { paneGroupIsNarrow, paneGroupWidth } from '$lib/strip'

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
  const narrow = $derived(attached && paneGroupIsNarrow(viewportWidth))
  const width = $derived(paneGroupWidth(attached, viewportWidth))
</script>

<div class="pane-group" class:attached class:narrow style:width={`${width}px`}>
  {#if attachment?.attachment?.side === 'left'}
    <div class="member attachment" class:active={focusedId === attachment.id}>
      <TerminalColumn
        terminalId={attachment.id}
        workspaceId={workspace.id}
        name={workspace.name}
        focused={focusedId === attachment.id}
        onfocus={() => onfocus(attachment.id)}
      />
    </div>
  {/if}

  <div class="member host" class:active={focusedId === host.id}>
    {#if host.fresh}
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

  {#if attachment?.attachment?.side === 'right'}
    <div class="member attachment" class:active={focusedId === attachment.id}>
      <TerminalColumn
        terminalId={attachment.id}
        workspaceId={workspace.id}
        name={workspace.name}
        focused={focusedId === attachment.id}
        onfocus={() => onfocus(attachment.id)}
      />
    </div>
  {/if}
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

  .pane-group.attached:not(.narrow) .host {
    width: 66.6667%;
  }

  .pane-group.attached:not(.narrow) .attachment {
    width: 33.3333%;
  }

  .pane-group.narrow .member:not(.active) {
    display: none;
  }

  .pane-group.narrow .member.active {
    width: 100%;
  }
</style>
