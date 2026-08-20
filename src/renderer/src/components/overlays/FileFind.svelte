<!-- `␣f`: the file search over the focused workspace (spec D4, D8).
     The index is served from cache at once and re-walked behind; picking
     hands the path to the caller, who decides what opening means. -->
<script lang="ts">
  import Telescope from './Telescope.svelte'
  import FilePreview from './FilePreview.svelte'
  import Icon from '../Icon.svelte'
  import { fileColor, fileIcon, fileTone } from '$lib/icons'
  import { app } from '$lib/state/app.svelte'
  import { files } from '$lib/state/files.svelte'

  const { onclose, onpick }: { onclose: () => void; onpick: (path: string) => void } = $props()

  // Pinned once: the search belongs to the workspace it opened over, the same
  // contract the thread picker keeps.
  const workspaceId = app.workspace.id
  files.refresh(workspaceId)

  const items = $derived(files.files(workspaceId))
  const ready = $derived(files.loaded(workspaceId))

  /** The tail of a path is what identifies it; the head is shared by half the
   *  repository. Splitting them lets the head recede and truncate while the
   *  name stays whole and bright. */
  function parts(path: string): { dir: string; base: string } {
    const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    if (slash === -1) return { dir: '', base: path }
    return { dir: path.slice(0, slash + 1), base: path.slice(slash + 1) }
  }
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
    {@const split = parts(path)}
    <span class="line tone-{fileTone(path)}">
      <!-- The same mark the chips and the mention menu wear for this path,
           in the colour the nerd-font conventions give its extension. -->
      <span class="icon" style:color={fileColor(path)}><Icon name={fileIcon(path)} size={13} /></span>
      <span class="base">{split.base}</span>
      {#if split.dir !== ''}
        <span class="dir">{split.dir}</span>
      {/if}
    </span>
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
  .line {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .icon {
    flex: none;
    display: flex;
    color: var(--fg-dimmer);
  }
  /* The mark carries the kind in the workspace's own tones; the accent keeps
     the loudest voice (code), the support tones take media and config. */
  .tone-code .icon {
    color: var(--tone-1);
  }
  .tone-media .icon {
    color: var(--tone-2);
  }
  .tone-config .icon {
    color: var(--tone-3);
  }
  .base {
    flex: none;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    /* The name is the row: it reads at body strength, not chrome strength. */
    color: var(--fg-body);
  }
  .dir {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    /* The head truncates from its own head: the part nearest the name is the
       part that disambiguates it. */
    direction: rtl;
    text-align: left;
    color: var(--fg-dimmer);
    font-size: 11px;
  }
  /* A dotfile, a secret, or anything living under a dot-directory recedes
     whole — name included. */
  .tone-hidden,
  .tone-hidden .icon,
  .tone-hidden .base,
  .tone-hidden .dir {
    color: var(--fg-dimmest);
  }
  .none {
    margin: auto;
    font-size: 10.5px;
    color: var(--fg-dimmest);
  }
</style>
