<!-- The head of one workspace file, for the file search's right pane. -->
<script lang="ts">
  import { session } from '$lib/session'

  const { workspaceId, path }: { workspaceId: string; path: string } = $props()

  /** Enough to recognize a file, not enough to read one — the buffer column
   *  is for reading. Keeps the pane cheap while the highlight flies. */
  const HEAD_LINES = 200

  let shown = $state<{ text: string } | { note: string } | null>(null)

  $effect(() => {
    const wanted = path
    shown = null
    void session
      .invoke('readFile', { workspaceId, path: wanted })
      .then((answer) => {
        // The highlight may have moved on while the read was in flight; a
        // stale answer must not paint over the current one.
        if (wanted !== path) return
        if ('missing' in answer) {
          shown = { note: 'no longer on disk' }
          return
        }
        shown = { text: answer.text.split('\n').slice(0, HEAD_LINES).join('\n') }
      })
      .catch((cause) => {
        if (wanted !== path) return
        shown = { note: cause instanceof Error ? cause.message : String(cause) }
      })
  })
</script>

<div class="head"><span class="path">{path}</span></div>
{#if shown === null}
  <div class="note">reading…</div>
{:else if 'note' in shown}
  <div class="note">{shown.note}</div>
{:else}
  <pre>{shown.text}</pre>
{/if}

<style>
  .head {
    flex: none;
    padding: 10px 14px 6px;
    font-family: var(--font-body);
    font-size: 11.5px;
    color: var(--fg-bright);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note {
    padding: 10px 14px;
    font-size: 11px;
    color: var(--fg-dimmest);
  }
  pre {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 4px 14px 12px;
    overflow: auto;
    font-family: var(--font-body);
    font-size: 11px;
    line-height: 1.6;
    color: var(--fg-dim);
  }
</style>
