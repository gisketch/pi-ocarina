<script lang="ts">
  import Spotlight from './Spotlight.svelte'
  import Identicon from '../Identicon.svelte'
  import GitSummary from '../GitSummary.svelte'
  import { isDesktop } from '$lib/bridge'
  import { fuzzyFilter } from '$lib/fuzzy'
  import { app } from '$lib/state/app.svelte'
  import { catalog } from '$lib/state/catalog.svelte'

  interface Props {
    onclose: () => void
    onselect: (index: number) => void
    input?: HTMLInputElement | null
  }

  let { onclose, onselect, input = $bindable(null) }: Props = $props()

  let query = $state('')
  let pinning = $state(false)

  // Cards carry their own index so a filtered grid still selects the right
  // workspace — the number chip is the workspace's position, not the row's.
  const cards = $derived(
    fuzzyFilter(
      app.workspaces.map((workspace, index) => ({ workspace, index })),
      query,
      ({ workspace }) => workspace.name,
    ),
  )

  function onkeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (cards.length > 0) onselect(cards[0].index)
  }

  async function pin(): Promise<void> {
    if (pinning) return
    pinning = true
    try {
      // Closing only on success keeps the overlay in place when the user
      // cancels the picker or the folder is refused — which is where they are
      // already looking, and where the reason can be shown.
      if (await catalog.pin()) onclose()
    } finally {
      pinning = false
    }
  }
</script>

<Spotlight
  {onclose}
  z={50}
  label="Workspace switcher"
  placeholder="search workspaces… ⏎ picks first"
  bind:value={query}
  bind:input
  {onkeydown}
>
  <div class="cards">
    {#each cards as { workspace, index } (workspace.id)}
      <button
        type="button"
        class="card"
        class:active={index === app.workspaceIndex}
        style:--card-hue={workspace.hue}
        onclick={() => onselect(index)}
      >
        <Identicon name={workspace.name} hue={workspace.hue} size={52} />
        <div class="name">{workspace.name}</div>
        <div class="note">♪ {workspace.note}</div>
        <div class="branch"><GitSummary status={workspace.git} /></div>
        <div class="snippet">{workspace.snippet}</div>
        <div class="key">{index + 1}</div>
      </button>
    {/each}

    <button type="button" class="card empty" onclick={pin} disabled={!isDesktop}>
      <div class="ghost"></div>
      {pinning ? 'pinning…' : 'pin a folder…'}
      <div class="key plain">{app.workspaces.length + 1}</div>
    </button>
  </div>

  {#if catalog.error}
    <div class="failed">could not pin that folder — {catalog.error}</div>
  {/if}
</Spotlight>

<style>
  .cards {
    display: flex;
    gap: 16px;
    align-items: stretch;
  }

  .card {
    width: 190px;
    padding: 22px 18px 16px;
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
  /* The workspace under the cursor is the brighter card, tinted with its own
     seeded hue — the same hue the app will take if it is chosen. */
  .card.active {
    background: oklch(0.76 0.14 var(--card-hue) / 0.12);
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
    background: var(--bg-chip);
    padding: 2px 7px;
  }

  .empty {
    background: rgba(255, 255, 255, 0.03);
    justify-content: center;
    color: var(--fg-dimmest);
    font-size: 10.5px;
  }
  .empty:disabled {
    cursor: default;
  }
  .empty:disabled:hover {
    transform: none;
  }
  .empty:not(:disabled):hover {
    color: var(--fg-dim);
    background: var(--bg-hover);
  }
  .ghost {
    width: 52px;
    height: 52px;
    background: rgba(255, 255, 255, 0.05);
  }
  .key.plain {
    color: var(--fg-dimmest);
    background: var(--bg-raise-3);
  }

  .failed {
    padding: 7px 12px;
    background: rgba(224, 122, 107, 0.09);
    color: var(--err-text);
    font-size: 11px;
    font-family: var(--font-body);
  }
</style>
