<!-- The head of one workspace file, for the file search's right pane —
     drawn by the same machinery as the buffer column (theme, palette
     highlighting, gutter), so what the picker shows is what opening gets. -->
<script lang="ts">
  import { session } from '$lib/session'
  import { mountPreview, type PreviewHandle } from '$lib/editor/preview'

  const { workspaceId, path }: { workspaceId: string; path: string } = $props()

  /** Enough to recognize a file, not enough to read one — the buffer column
   *  is for reading. Keeps the pane cheap while the highlight flies. */
  const HEAD_LINES = 200

  let shown = $state<{ text: string } | { note: string } | null>(null)
  let host = $state<HTMLDivElement | null>(null)
  let mounted: PreviewHandle | null = null

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

  // One pane per shown text: the component is keyed by path upstream, but the
  // text arrives async, so the mount follows the answer rather than the mount
  // of the component.
  $effect(() => {
    const target = host
    if (!target || shown === null || 'note' in shown) return
    mounted = mountPreview(target, shown.text, path)
    return () => {
      mounted?.destroy()
      mounted = null
    }
  })
</script>

<div class="head"><span class="path">{path}</span></div>
{#if shown === null}
  <div class="note">reading…</div>
{:else if 'note' in shown}
  <div class="note">{shown.note}</div>
{:else}
  <div class="pane" bind:this={host}></div>
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
  .pane {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .pane :global(.cm-editor) {
    height: 100%;
  }
</style>
