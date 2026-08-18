<script lang="ts">
  /** The voices the reader can write in, and the one every thread starts on.
   *
   *  A list first, a form second, on the roles screen's pattern: reading a
   *  working mode is how the shape of one is learned, so the list is what
   *  opens. `⏎` edits, `a` adds, `d` deletes, `␣` makes one the default, `esc`
   *  backs out one level at a time. */
  import Backdrop from './Backdrop.svelte'
  import { wrapIndex } from '$lib/fuzzy'
  import { modes } from '$lib/state/modes.svelte'
  import type { ChatMode } from '../../../../shared/chat-modes'

  const { onclose }: { onclose: () => void } = $props()

  let selected = $state(0)
  /** The mode being edited, or null while the list has the keys. A copy: the
   *  list must not change under the reader while they are typing into it. */
  let editing = $state.raw<ChatMode | null>(null)

  $effect(() => {
    void modes.load('')
  })

  function isTyping(target: EventTarget | null): boolean {
    const node = target as HTMLElement | null
    return node?.tagName === 'INPUT' || node?.tagName === 'TEXTAREA'
  }

  function edit(mode: ChatMode): void {
    editing = { ...mode }
  }

  function add(): void {
    editing = { id: '', name: '', instructions: '' }
  }

  async function commit(): Promise<void> {
    const draft = editing
    if (!draft) return
    // The id is set once, when the mode is first saved: renaming must not
    // orphan it into a second entry, and must not silently change what the
    // default points at.
    const saved = await modes.save({ ...draft, id: draft.id || modes.idFor(draft.name) })
    if (saved) editing = null
  }

  function onkeydown(event: KeyboardEvent): void {
    if (isTyping(event.target)) {
      if (event.key === 'Escape') {
        ;(event.target as HTMLElement).blur()
        event.preventDefault()
      }
      return
    }

    if (editing) {
      if (event.key === 'Escape') {
        editing = null
        event.preventDefault()
        event.stopPropagation()
      }
      if (event.key === 'Enter') {
        void commit()
        event.preventDefault()
      }
      return
    }

    switch (event.key) {
      case 'j':
      case 'ArrowDown':
        selected = wrapIndex(selected + 1, modes.all.length)
        break
      case 'k':
      case 'ArrowUp':
        selected = wrapIndex(selected - 1, modes.all.length)
        break
      case 'Enter':
        if (modes.all[selected]) edit(modes.all[selected])
        break
      case 'a':
        add()
        break
      case 'd':
        if (modes.all[selected]) void modes.remove(modes.all[selected].id)
        break
      case ' ': {
        const mode = modes.all[selected]
        if (mode) void modes.setDefault(modes.fallback === mode.id ? undefined : mode.id)
        break
      }
      default:
        return
    }
    event.preventDefault()
  }
</script>

<svelte:window {onkeydown} />

<Backdrop {onclose} z={53} label="Chat modes">
  <div class="screen">
    <div class="head">VOICES</div>

    {#if editing}
      <div class="form">
        <label class="field">
          <span class="key">name</span>
          <input bind:value={editing.name} placeholder="terse" />
        </label>
        <label class="field">
          <span class="key">instructions</span>
          <textarea
            rows="7"
            bind:value={editing.instructions}
            placeholder="How the agent should write. Not what it should do — the app adds that boundary itself."
          ></textarea>
        </label>
        <div class="foot">⏎ save · esc back · a voice cannot change what the agent does</div>
      </div>
    {:else}
      <div class="rows">
        {#each modes.all as mode, i (mode.id)}
          <button
            type="button"
            class="row"
            class:selected={selected === i}
            onclick={() => {
              selected = i
              edit(mode)
            }}
            onmouseenter={() => (selected = i)}
          >
            <span class="name">{mode.name}</span>
            <span class="what">{mode.instructions}</span>
            {#if modes.fallback === mode.id}<span class="tag">default</span>{/if}
          </button>
        {:else}
          <div class="empty">no voices yet — press a to write one</div>
        {/each}
      </div>
      <div class="foot">j/k move · ⏎ edit · a add · d delete · ␣ make default · esc close</div>
    {/if}
  </div>
</Backdrop>

<style>
  .screen {
    width: 560px;
    border: 1px solid rgba(255, 255, 255, 0.055);
    background: var(--bg-panel);
  }

  .head {
    padding: 14px 20px;
    border-bottom: 1px solid var(--bg-chip);
    font-family: var(--font-chrome);
    font-size: 10px;
    letter-spacing: 0.14em;
    color: var(--dim);
  }

  .rows {
    max-height: 340px;
    overflow: auto;
  }

  .row {
    display: flex;
    gap: 10px;
    align-items: baseline;
    width: 100%;
    padding: 8px 20px;
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .row.selected {
    background: var(--bg-chip);
  }

  .name {
    min-width: 92px;
    color: var(--fg);
  }

  .what {
    flex: 1;
    color: var(--dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag {
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--accent);
  }

  .form {
    padding: 14px 20px;
  }

  .field {
    display: block;
    margin-bottom: 12px;
  }

  .key {
    display: block;
    font-size: 10px;
    letter-spacing: 0.12em;
    color: var(--dim);
    margin-bottom: 4px;
  }

  input,
  textarea {
    width: 100%;
    padding: 6px 8px;
    background: var(--bg-chip);
    border: 1px solid var(--line);
    border-radius: 3px;
    color: var(--fg);
    font: inherit;
    font-size: 12px;
    resize: vertical;
  }

  .empty,
  .foot {
    padding: 10px 20px;
    font-size: 11px;
    color: var(--dim);
  }

  .foot {
    border-top: 1px solid var(--bg-chip);
  }
</style>
