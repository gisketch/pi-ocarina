<script lang="ts">
  import Backdrop from './Backdrop.svelte'
  import Identicon from '../Identicon.svelte'
  import { app } from '$lib/state/app.svelte'

  interface Props {
    onclose: () => void
    onselect: (index: number) => void
  }

  const { onclose, onselect }: Props = $props()
</script>

<Backdrop {onclose} z={50} label="Workspace switcher">
  <div class="cards">
    {#each app.workspaces as ws, i (ws.id)}
      <button
        type="button"
        class="card"
        class:active={i === app.workspaceIndex}
        style:--card-hue={ws.hue}
        onclick={() => onselect(i)}
      >
        <Identicon name={ws.name} hue={ws.hue} size={52} />
        <div class="name">{ws.name}</div>
        <div class="note">♪ {ws.note}</div>
        <div class="branch"> {ws.branch}</div>
        <div class="snippet">{ws.snippet}</div>
        <div class="key">{i + 1}</div>
      </button>
    {/each}

    <div class="card empty">
      <div class="ghost"></div>
      pin a folder…
      <div class="key plain">{app.workspaces.length + 1}</div>
    </div>
  </div>
</Backdrop>

<style>
  .cards {
    display: flex;
    gap: 16px;
    align-items: stretch;
  }

  .card {
    width: 190px;
    padding: 22px 18px 16px;
    border: 1px solid var(--line-strong);
    background: var(--bg-panel);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    animation: rise 0.25s ease;
    transition: transform 0.15s;
    font-family: var(--font-chrome);
  }
  .card:hover {
    transform: translateY(-3px);
  }
  .card.active {
    border-color: oklch(0.76 0.14 var(--card-hue) / 0.45);
  }

  .name {
    font-size: 14px;
    color: var(--fg-bright);
  }

  .note {
    font-size: 10.5px;
    color: oklch(0.76 0.14 var(--card-hue));
  }

  .branch {
    font-size: 10px;
    color: var(--fg-dimmer);
  }

  .snippet {
    font-size: 10px;
    color: var(--fg-dimmest);
    text-align: center;
    line-height: 1.5;
  }

  .key {
    margin-top: auto;
    font-size: 9.5px;
    color: var(--fg-dim);
    border: 1px solid var(--line-strong);
    padding: 1px 7px;
  }

  .empty {
    border-style: dashed;
    background: none;
    justify-content: center;
    color: var(--fg-dimmest);
    font-size: 10.5px;
    cursor: default;
  }
  .empty:hover {
    transform: none;
  }
  .ghost {
    width: 52px;
    height: 52px;
    border: 1px dashed rgba(255, 255, 255, 0.12);
  }
  .key.plain {
    color: var(--fg-dimmest);
    border-color: rgba(255, 255, 255, 0.09);
  }
</style>
