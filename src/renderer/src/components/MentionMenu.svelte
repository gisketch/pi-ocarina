<script lang="ts">
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
    return cut === -1 ? { dir: '', name: path } : { dir: path.slice(0, cut + 1), name: path.slice(cut + 1) }
  }
</script>

<div class="menu" role="listbox" aria-label="Workspace files">
  {#each paths as path, i (path)}
    {@const parts = split(path)}
    <button
      type="button"
      class="row"
      class:active={i === active}
      role="option"
      aria-selected={i === active}
      onmousedown={(event) => {
        event.preventDefault()
        onpick(path)
      }}
      onmouseenter={() => onhover(i)}
    >
      <span class="name">{parts.name}</span>
      <span class="dir">{parts.dir}</span>
      {#if i === active}<span class="kbd">tab</span>{/if}
    </button>
  {/each}
</div>

<style>
  .menu {
    max-width: var(--column-w);
    margin: 0 auto 6px;
    border: 1px solid rgba(255, 255, 255, 0.055);
    background: var(--bg-panel);
    animation: rise 0.15s ease;
  }

  .row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 7px 11px;
    width: 100%;
    text-align: left;
    cursor: pointer;
    border: none;
    background: none;
    color: var(--fg-agent);
    font-family: var(--font-body);
    font-size: 11.5px;
  }
  .row.active {
    background: var(--bg-hover-2);
  }

  .name {
    color: var(--fg-body);
    flex: none;
  }
  .dir {
    color: var(--fg-dimmest);
    font-size: 10.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kbd {
    margin-left: auto;
    flex: none;
    font-size: 9.5px;
    color: var(--fg-dimmer);
    border: 1px solid rgba(255, 255, 255, 0.07);
    padding: 1px 6px;
  }
</style>
