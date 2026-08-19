<!-- `␣f`: the file search over the focused workspace (spec D4, D8).
     The index is served from cache at once and re-walked behind; picking
     hands the path to the caller, who decides what opening means. -->
<script lang="ts">
  import Telescope from './Telescope.svelte'
  import FilePreview from './FilePreview.svelte'
  import { app } from '$lib/state/app.svelte'
  import { files } from '$lib/state/files.svelte'

  const { onclose, onpick }: { onclose: () => void; onpick: (path: string) => void } = $props()

  // Pinned once: the search belongs to the workspace it opened over, the same
  // contract the thread picker keeps.
  const workspaceId = app.workspace.id
  files.refresh(workspaceId)

  const items = $derived(files.files(workspaceId))
  const ready = $derived(files.loaded(workspaceId))
</script>

<Telescope
  {onclose}
  label="File search"
  placeholder="search files… ⏎ opens"
  {items}
  text={(path) => path}
  key={(path) => path}
  onpick={onpick}
  empty={ready ? 'nothing matches' : 'reading the file list…'}
>
  {#snippet row(path)}
    <span class="path">{path}</span>
  {/snippet}
  {#snippet preview(path)}
    {#if path}
      {#key path}
        <FilePreview {workspaceId} {path} />
      {/key}
    {:else}
      <div class="none">nothing to show</div>
    {/if}
  {/snippet}
</Telescope>

<style>
  .path {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    /* The tail of a path is what identifies it; the head is shared by half
       the repository. */
    direction: rtl;
    text-align: left;
  }
  .none {
    margin: auto;
    font-size: 10.5px;
    color: var(--fg-dimmest);
  }
</style>
