<script lang="ts">
  import Backdrop from './Backdrop.svelte'
  import { SHIPPED_KEYS } from '$lib/keymap'
  import { keybinds } from '$lib/state/keybinds.svelte'

  const { onclose }: { onclose: () => void } = $props()

  /** Drawn from the registry and the live keymap, never written by hand — a
   *  hardcoded sheet showed the shipped key for actions the reader had moved,
   *  which is a cheat sheet that cheats. */
  const GROUPS = [
    { group: 'navigate', title: 'NAVIGATE' },
    { group: 'screens', title: 'SCREENS' },
    { group: 'read', title: 'READ' },
    { group: 'diff', title: 'DIFF' },
    { group: 'leader', title: 'LEADER ␣' },
  ]

  const rowsOf = (group: string) =>
    Object.entries(SHIPPED_KEYS).filter(([, entry]) => entry.group === group)

  function spell(press: string): string {
    if (press === ' ') return '␣'
    if (press === 'Tab') return '⇥'
    if (press.startsWith('C-')) return `^${press.slice(2)}`
    return press
  }

  const moved = (action: string) => keybinds.pressOf(action) !== SHIPPED_KEYS[action].key

  /** The keys no keymap moves, said rather than implied. */
  const FIXED: [string, string][] = [
    ['jump workspace', '1–3'],
    ['commands', '⌘K'],
    ['insert · send', 'i / ⏎'],
    ['back out of anything', 'esc'],
  ]
</script>

<Backdrop {onclose} z={55} label="Keymap">
  <div class="keymap">
    <div class="heading">
      KEYMAP <span class="sub">— play it like a song</span>
      <span class="edit">edit in settings (,)</span>
    </div>
    <div class="grid">
      {#each GROUPS as { group, title } (group)}
        <div class="group">
          <div class="group-title">{title}</div>
          {#each rowsOf(group) as [action, entry] (action)}
            <div class="row">
              <span>{entry.label}</span>
              <span class="key" class:moved={moved(action)}>{spell(keybinds.pressOf(action))}</span>
            </div>
          {/each}
        </div>
      {/each}

      <div class="group">
        <div class="group-title">FIXED</div>
        {#each FIXED as [label, key] (label)}
          <div class="row"><span>{label}</span><span class="key">{key}</span></div>
        {/each}
      </div>
    </div>
  </div>
</Backdrop>

<style>
  .keymap {
    width: var(--column-w);
    background: var(--bg-panel);
    padding: 26px 30px;
    animation: rise 0.2s ease;
    max-height: 82vh;
    overflow-y: auto;
  }

  .heading {
    font-size: 16px;
    color: var(--fg-bright);
    margin-bottom: 18px;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .sub {
    color: var(--fg-dimmer);
    font-size: 11px;
  }
  .edit {
    margin-left: auto;
    color: var(--fg-dimmest);
    font-size: 10px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    font-size: 11px;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .group-title {
    color: var(--accent);
    font-size: 10px;
    letter-spacing: 0.12em;
  }

  .row {
    display: flex;
    justify-content: space-between;
    color: var(--fg-agent);
  }
  .key {
    color: var(--fg-dim);
  }
  /* The reader's own key, said in the reader's color. */
  .key.moved {
    color: var(--accent);
  }
</style>
