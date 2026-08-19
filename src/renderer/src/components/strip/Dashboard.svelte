<script lang="ts">
  import Identicon from '../Identicon.svelte'
  import Composer from '../Composer.svelte'
  import { branchField } from '$lib/state/branch-field.svelte'
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
</script>

<div class="hero" class:focused>
  <div class="middle">
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
    {/if}
  </div>

  <!-- The column with no thread behind it is the one most likely to receive a
       first message, so it gets a field like every other. -->
  <Composer {columnId} {focused} {onmodel} {oncommit} />
</div>

<style>
  .hero {
    width: var(--column-w);
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
