<script lang="ts">
  import Backdrop from './Backdrop.svelte'
  import { wrapIndex } from '$lib/fuzzy'
  import { preferences } from '$lib/state/preferences.svelte'

  interface Props {
    onclose: () => void
    onkeymap: () => void
    /** Absent until D5 builds the model selector. The row still shows the
     *  current model; it just cannot be changed from here yet. */
    onmodel?: () => void
    model?: string
    /** The focused thread's reasoning level, and how to change it. pi stores
     *  this per thread, so the row acts on the thread rather than on a global
     *  preference that nothing would read. */
    reasoning?: string
    onreasoning?: (direction: 1 | -1) => void
    /** Opens the roles screen: what a child agent is, when one is spawned. */
    onroles?: () => void
    /** Opens the open workspace's own settings — language servers, today. */
    onworkspace?: () => void
  }

  const {
    onclose,
    onkeymap,
    onmodel,
    model = 'pi default',
    reasoning,
    onreasoning,
    onroles,
    onworkspace,
  }: Props = $props()

  /** A row is either a switch (`⏎`) or a range (`h`/`l`) — the hint chip tells
   *  the user which, so no row's behaviour has to be guessed. */
  interface Row {
    label: string
    value: () => string
    hint: 'enter' | 'range' | 'none'
    enter?: () => void
    nudge?: (direction: 1 | -1) => void
    accent?: boolean
  }

  const rows = $derived<Row[]>([
    { label: 'default model', value: () => model, hint: onmodel ? 'enter' : 'none', enter: onmodel },
    {
      label: 'reasoning effort',
      value: () => reasoning ?? 'pi default',
      hint: onreasoning ? 'range' : 'none',
      nudge: onreasoning,
      accent: true,
    },
    {
      label: 'grain texture',
      value: () => (preferences.grain ? 'on' : 'off'),
      hint: 'enter',
      enter: () => preferences.toggleGrain(),
    },
    {
      label: 'motion',
      value: () => (preferences.motion ? 'on' : 'off'),
      hint: 'enter',
      enter: () => preferences.toggleMotion(),
    },
    // Display only: there is one identity style, so there is nothing to choose.
    { label: 'workspace identity', value: () => 'pixel 5×5', hint: 'none' },
    {
      label: 'leader timeout',
      value: () => preferences.leaderTimeoutLabel,
      hint: 'range',
      nudge: (direction) => preferences.nudgeLeaderTimeout(direction),
    },
    {
      label: 'workspace settings',
      value: () => 'language servers',
      hint: onworkspace ? 'enter' : 'none',
      enter: onworkspace,
    },
    {
      label: 'agent roles',
      value: () => 'edit',
      hint: onroles ? 'enter' : 'none',
      enter: onroles,
    },
    { label: 'keymap', value: () => 'view', hint: 'enter', enter: onkeymap },
  ])

  let selected = $state(0)

  function onkeydown(event: KeyboardEvent): void {
    const row = rows[selected]

    switch (event.key) {
      case 'j':
      case 'ArrowDown':
        selected = wrapIndex(selected + 1, rows.length)
        break
      case 'k':
      case 'ArrowUp':
        selected = wrapIndex(selected - 1, rows.length)
        break
      case 'l':
      case 'ArrowRight':
        row.nudge?.(1)
        break
      case 'h':
      case 'ArrowLeft':
        row.nudge?.(-1)
        break
      case 'Enter':
        row.enter?.()
        break
      default:
        return
    }
    event.preventDefault()
  }
</script>

<!-- The overlay takes the keys itself while it is open, so `j`/`k` move the
     highlight instead of scrolling the thread behind it. Escape still belongs
     to the shell's keyboard layer. -->
<svelte:window {onkeydown} />

<Backdrop {onclose} z={53} label="Settings">
  <div class="settings">
    <div class="head">
      SETTINGS
      <span class="chip">,</span>
    </div>

    <div class="rows">
      {#each rows as row, i (row.label)}
        <button
          type="button"
          class="row"
          class:selected={i === selected}
          onclick={() => {
            selected = i
            row.enter?.()
          }}
          onmouseenter={() => (selected = i)}
        >
          {row.label}
          <span class="value" class:accent={row.accent}>{row.value()}</span>
          {#if row.hint !== 'none'}
            <span class="hint">{row.hint === 'enter' ? '⏎' : 'h/l'}</span>
          {/if}
        </button>
      {/each}
    </div>

    <div class="foot">j/k move · ⏎ change · esc close</div>
  </div>
</Backdrop>

<style>
  .settings {
    width: 540px;
    border: 1px solid rgba(255, 255, 255, 0.055);
    background: var(--bg-panel);
    animation: rise 0.2s ease;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--bg-chip);
    font-size: 10px;
    letter-spacing: 0.14em;
    color: var(--fg-dim);
  }
  .chip {
    margin-left: auto;
    border: 1px solid rgba(255, 255, 255, 0.09);
    padding: 1px 5px;
    color: var(--fg-dimmest);
    letter-spacing: 0;
  }

  .rows {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    width: 100%;
    text-align: left;
    cursor: pointer;
    color: var(--fg-agent);
    border: none;
    border-left: 2px solid transparent;
    background: none;
    font-family: var(--font-body);
    font-size: 12px;
    transition:
      background-color 0.15s,
      border-color 0.15s;
  }
  .row.selected {
    border-left-color: var(--accent);
    background: var(--bg-hover);
  }

  .value {
    margin-left: auto;
    color: var(--fg-bright);
  }
  .value.accent {
    color: var(--accent);
  }

  .hint {
    color: var(--fg-dimmest);
    font-size: 10px;
    font-family: var(--font-chrome);
    width: 22px;
    text-align: right;
  }

  .foot {
    display: flex;
    gap: 14px;
    padding: 10px 20px;
    border-top: 1px solid var(--bg-chip);
    font-size: 10px;
    color: var(--fg-dimmest);
  }
</style>
