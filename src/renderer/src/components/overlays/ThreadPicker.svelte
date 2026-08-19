<script lang="ts">
  import Telescope from './Telescope.svelte'
  import ThreadPreview from './ThreadPreview.svelte'
  import type { ThreadSummary } from '../../../../shared/protocol'
  import { ago, dashboardRecent } from '$lib/state/dashboard-recent.svelte'
  import { app } from '$lib/state/app.svelte'

  const { onclose }: { onclose: () => void } = $props()

  // Pinned once: the picker belongs to the workspace it opened over, and a
  // workspace switch mid-pick should not quietly swap the list underneath.
  const workspaceId = app.workspace.id
  const items = $derived(dashboardRecent.all(workspaceId))

  function pick(summary: ThreadSummary): void {
    void dashboardRecent.openThread(workspaceId, summary)
    onclose()
  }
</script>

<Telescope
  {onclose}
  label="Thread history"
  placeholder="fuzzy filter threads… ⏎ opens"
  {items}
  text={(summary) => summary.title}
  key={(summary) => summary.id}
  onpick={pick}
>
  {#snippet row(summary)}
    <span class="line">
      <span class="title">{summary.title}</span>
      <span class="when">{ago(summary.modified)}</span>
    </span>
  {/snippet}
  {#snippet preview(summary)}
    {#if summary}
      <div class="about">
        <div class="name">{summary.title}</div>
        <div class="meta">
          {summary.messageCount} message{summary.messageCount === 1 ? '' : 's'}
          · {ago(summary.modified)} ago
          {#if summary.branch}· ⎇ {summary.branch}{/if}
        </div>
      </div>
      <!-- Keyed: a new highlight is a new pane. What survives the key is the
           thread store underneath, which is where the caching lives. -->
      {#key summary.id}
        <ThreadPreview threadId={summary.id} />
      {/key}
    {:else}
      <div class="about"><div class="soon">nothing to show</div></div>
    {/if}
  {/snippet}
</Telescope>

<style>
  .line {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .when {
    flex: none;
    font-size: 10px;
    color: var(--fg-dimmest);
  }

  .about {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 16px 20px 10px;
  }
  .name {
    font-size: 14px;
    color: var(--fg-bright);
    text-align: center;
  }
  .meta {
    font-size: 11px;
    color: var(--fg-dim);
  }
  .soon {
    font-size: 10.5px;
    color: var(--fg-dimmest);
  }
</style>
