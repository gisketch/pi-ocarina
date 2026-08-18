<script lang="ts">
  /** The `@` menu: files in this workspace.
   *
   *  Same box as the command menu, so the two cannot drift again — and the
   *  same one line per row, with the folder taking whatever width is left. */
  import Icon from './Icon.svelte'
  import MenuList from './composer/MenuList.svelte'
  import { fileIcon } from '$lib/icons'

  interface Props {
    paths: string[]
    active: number
    onpick: (path: string) => void
    onhover: (index: number) => void
  }

  const { paths, active, onpick, onhover }: Props = $props()

  /** Split so the file name reads first and its folder recedes — the name is
   *  what someone is looking for; the folder only disambiguates. */
  function split(path: string): { dir: string; name: string } {
    const cut = path.lastIndexOf('/')
    return cut === -1
      ? { dir: '', name: path }
      : { dir: path.slice(0, cut + 1), name: path.slice(cut + 1) }
  }
</script>

<MenuList
  label="Workspace files"
  items={paths}
  {active}
  key={(path) => path}
  onpick={(path) => onpick(path)}
  {onhover}
>
  {#snippet row(path: string, isActive: boolean)}
    <!-- The mark for what this file is. A picker of forty paths is read by
         shape before it is read by name. -->
    <span class="icon"><Icon name={fileIcon(path)} /></span>
    <span class="name">{split(path).name}</span>
    <span class="dir">{split(path).dir}</span>
    <span class="meta">{#if isActive}<span class="kbd">tab</span>{/if}</span>
  {/snippet}
</MenuList>

<style>
  .icon {
    display: inline-flex;
    width: 13px;
    color: var(--fg-dimmer);
  }

  .name {
    color: var(--fg-body);
    white-space: nowrap;
  }
  .dir {
    color: var(--fg-dimmest);
    font-size: 10.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    /* From the right: the end of a long path is the part that identifies it. */
    direction: rtl;
    text-align: left;
  }
  .meta {
    display: flex;
    justify-content: flex-end;
  }
  .kbd {
    font-size: 9.5px;
    color: var(--fg-dimmer);
    background: var(--bg-chip);
    padding: 2px 6px;
  }
</style>
