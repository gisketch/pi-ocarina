<script lang="ts">
  import Identicon from '../Identicon.svelte'
  import Composer from '../Composer.svelte'
  import LeapOverlay from '../thread/LeapOverlay.svelte'
  import { branchField } from '$lib/state/branch-field.svelte'
  import { navTarget } from '$lib/state/block-focus.svelte'
  import { registerColumnBody } from '$lib/state/columns'
  import { ago, dashboardRecent } from '$lib/state/dashboard-recent.svelte'
  import type { Workspace } from '$lib/types'

  const {
    workspace,
    columnId,
    focused,
    onmodel,
    oncommit,
  }: {
    workspace: Workspace
    columnId: string
    focused: boolean
    onmodel: () => void
    oncommit: () => void
  } = $props()

  // The launcher's choices. `b` and `/` are drawn before they act — their
  // tickets land next — so a reader learns the column's shape once.
  const actions = [
    { key: 'i', label: 'new thread' },
    { key: 'b', label: 'new worktree thread' },
    { key: '/', label: 'search history' },
  ]

  // The worktree flow: `b` swapped the menu for this field. Keys land through
  // the shell's modal gate, so this only draws the state.
  const naming = $derived(branchField.columnId === columnId)
  const problem = $derived(branchField.problem)
  const failure = $derived(branchField.failure)

  // What this workspace closed. Loaded when the launcher comes up; what is
  // *open* is filtered at read time, so a thread opened elsewhere disappears
  // from here without a re-list.
  $effect(() => {
    void dashboardRecent.load(workspace.id)
  })
  const recent = $derived(dashboardRecent.rows(workspace.id))
  const selected = $derived(dashboardRecent.selected(workspace.id))

  // The leap needs the column registered like any other: its candidates walk
  // the registered body, and its labels position in that box's coordinates.
  let middle = $state<HTMLElement | null>(null)
  $effect(() => {
    if (!middle) return
    return registerColumnBody(columnId, middle)
  })
</script>

<div class="hero" class:focused>
  <div class="middle" bind:this={middle}>
    <LeapOverlay threadId={columnId} />
    <Identicon name={workspace.name} hue={workspace.hue} size={70} />
    <div class="name">{workspace.name}</div>
    <div class="sub">
      fresh thread — no history yet · <span class="note">♪ {workspace.note}</span>
    </div>
    {#if naming}
      <div class="branch">
        <div class="ask">branch name</div>
        <div class="field" class:bad={problem !== null || failure !== null}>
          <span class="typed">{branchField.branch}</span><span class="caret"></span>
        </div>
        <div class="detail" class:bad={problem !== null || failure !== null}>
          {#if branchField.creating}
            making the worktree…
          {:else}
            {problem ?? failure ?? 'e.g. fix/OCA-231 · ⏎ creates · esc goes back'}
          {/if}
        </div>
      </div>
    {:else}
      <div class="actions">
        {#each actions as action (action.key)}
          <div class="action">
            <span class="kbd">{action.key}</span>
            <span class="label">{action.label}</span>
          </div>
        {/each}
      </div>

      {#if recent.length > 0}
        <div class="recent">
          <div class="heading">recent</div>
          {#each recent as row, index (row.id)}
            <button
              type="button"
              class="row"
              use:navTarget={{ threadId: columnId, navId: row.id }}
              class:picked={focused && index === selected}
              onclick={() => {
                dashboardRecent.select(workspace.id, row.id)
                void dashboardRecent.open(workspace.id)
              }}
            >
              <span class="dot"></span>
              <span class="title">{row.title}</span>
              <span class="when">{ago(row.modified)}</span>
            </button>
          {/each}
          <div class="hint"><span class="kbd">j</span><span class="kbd">k</span> pick · <span class="kbd">⏎</span> open</div>
        </div>
      {/if}
    {/if}
  </div>

  <!-- The column with no thread behind it is the one most likely to receive a
       first message, so it gets a field like every other. -->
  <Composer {columnId} {focused} {onmodel} {oncommit} />
</div>

<style>
  .hero {
    width: var(--column-w);
    height: 100%;
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--bg-column-idle);
    transition: background 0.4s;
    animation: rise 0.35s ease;
    overflow: hidden;
  }
  /* The same step every other column takes: the one with the reader is the
     lighter one. */
  .hero.focused {
    background: var(--bg-column-focus);
  }

  .middle {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .name {
    font-size: 20px;
    color: var(--fg-bright);
  }

  .sub {
    color: var(--fg-dim);
    font-size: 11px;
  }
  .note {
    color: var(--accent);
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
  }
  .action {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 11.5px;
  }
  .label {
    color: var(--fg-dim);
  }
  .kbd {
    background: var(--bg-chip);
    padding: 2px 6px;
    color: var(--fg-muted);
    font-size: 10.5px;
    min-width: 10px;
    text-align: center;
  }

  .recent {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 14px;
    width: min(320px, 85%);
  }
  .heading {
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--fg-dimmest);
    margin-bottom: 4px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    font-size: 11.5px;
    color: var(--fg-dim);
    text-align: left;
    cursor: pointer;
    background: none;
  }
  /* Full-bleed selection, visual-line style: the picked row is a band. */
  .row.picked {
    background: var(--seg-strong);
    color: var(--fg-bright);
  }
  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--fg-dimmest);
    flex: none;
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
  .hint {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    font-size: 10px;
    color: var(--fg-dimmest);
  }

  .branch {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
    width: min(300px, 80%);
  }
  .ask {
    font-size: 11px;
    color: var(--fg-dim);
  }
  .field {
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 8px 11px;
    background: rgba(255, 255, 255, 0.05);
    font-family: var(--font-body);
    font-size: 12.5px;
    color: var(--fg-bright);
    min-height: 32px;
  }
  .field.bad {
    background: rgba(224, 122, 107, 0.12);
  }
  .caret {
    width: 6px;
    height: 14px;
    background: var(--accent);
    animation: blink 1.1s steps(1) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
  .detail {
    font-size: 11px;
    color: var(--fg-dimmer);
  }
  .detail.bad {
    color: var(--err-text);
  }
</style>
