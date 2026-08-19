<script lang="ts">
  import type { Thread, Workspace } from '$lib/types'
  import { threadOf } from '$lib/types'
  import Dashboard from './Dashboard.svelte'
  import FileColumn from './FileColumn.svelte'
  import LiveThread from './LiveThread.svelte'
  import TerminalColumn from './TerminalColumn.svelte'
  import ThreadColumn from './ThreadColumn.svelte'

  const {
    workspace,
    host,
    attachment,
    focusedId,
    onfocus,
    onmodel,
    oncommit,
  }: {
    workspace: Workspace
    host: Thread
    attachment?: Thread
    focusedId: string
    onfocus: (id: string) => void
    onmodel: () => void
    oncommit: () => void
  } = $props()

  const live = $derived(threadOf(host))
</script>

<div class="pane-group" class:attached={attachment !== undefined}>
  {#if attachment?.attachment?.side === 'left'}
    <div class="member attachment">
      <TerminalColumn
        terminalId={attachment.id}
        workspaceId={workspace.id}
        name={workspace.name}
        focused={focusedId === attachment.id}
        onfocus={() => onfocus(attachment.id)}
      />
    </div>
  {/if}

  <div class="member host">
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
    <div class="member attachment">
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
  }
</style>
