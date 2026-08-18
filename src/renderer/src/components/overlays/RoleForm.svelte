<script lang="ts">
  import { wrapIndex } from '$lib/fuzzy'
  import Icon from '../Icon.svelte'
  import { READ_ONLY_TOOLS } from '../../../../shared/vocabulary'
  import type { AgentRole } from '$lib/thread'

  /** One role, being written.
   *
   *  Split from the list because they are two screens sharing an overlay, and
   *  because the list is what opens: reading four working roles is how the shape
   *  of a role is learned. */
  const {
    role,
    field,
    onchange,
    onfield,
    onsave,
    oncancel,
  }: {
    role: AgentRole
    /** Which field the cursor is on. The caret follows it. */
    field: number
    onchange: (next: AgentRole) => void
    onfield: (next: number) => void
    onsave: () => void
    oncancel: () => void
  } = $props()

  /** Every tool a role may be given. A fixed list rather than free text: a
   *  typo'd tool name is a role that silently cannot do its job. */
  const TOOLS = [...READ_ONLY_TOOLS, 'bash', 'write', 'edit']
  export const FIELD_COUNT = 4

  let fields = $state.raw<(HTMLElement | null)[]>([])

  // Moving the cursor moves the caret. Without this the highlight did nothing
  // and the form could only be filled in with a mouse.
  $effect(() => {
    const target = fields[field]
    if (target) target.focus()
    else (document.activeElement as HTMLElement | null)?.blur()
  })

  function toggleTool(tool: string): void {
    const held = role.tools
    onchange({
      ...role,
      tools: held.includes(tool) ? held.filter((one) => one !== tool) : [...held, tool],
    })
  }

  /** A key typed into a field is the field's: a role called "scout" is a name,
   *  not five bindings. `esc` leaves the field, `tab` walks them. */
  function held(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      ;(event.target as HTMLElement).blur()
      event.preventDefault()
      event.stopPropagation()
    }
    if (event.key === 'Tab') {
      onfield(wrapIndex(field + (event.shiftKey ? -1 : 1), FIELD_COUNT))
      event.preventDefault()
    }
  }
</script>

<div class="form">
  <label class="row" class:on={field === 0}>
    <span class="key">name</span>
    <input
      class="value"
      bind:this={fields[0]}
      value={role.name}
      placeholder="scout"
      onkeydown={held}
      oninput={(event) => onchange({ ...role, name: event.currentTarget.value })}
    />
  </label>

  <label class="row tall" class:on={field === 1}>
    <span class="key">instructions</span>
    <textarea
      class="value"
      bind:this={fields[1]}
      rows="5"
      value={role.instructions}
      placeholder="You find things in a codebase and report where they are…"
      onkeydown={held}
      oninput={(event) => onchange({ ...role, instructions: event.currentTarget.value })}
    ></textarea>
  </label>

  <div class="row" class:on={field === 2}>
    <span class="key">tools</span>
    <span class="tools">
      {#each TOOLS as tool (tool)}
        <button
          type="button"
          class="tool"
          class:picked={role.tools.includes(tool)}
          onclick={() => toggleTool(tool)}
        >
          <Icon name={role.tools.includes(tool) ? 'box-done' : 'box'} /> {tool}
        </button>
      {/each}
    </span>
  </div>

  <label class="row" class:on={field === 3}>
    <span class="key">model</span>
    <input
      class="value"
      bind:this={fields[3]}
      value={role.model ?? ''}
      placeholder="this session's model"
      onkeydown={held}
      oninput={(event) => onchange({ ...role, model: event.currentTarget.value || undefined })}
    />
  </label>

  <div class="foot">
    <button type="button" class="primary" onclick={onsave}>save</button>
    <button type="button" class="ghost" onclick={oncancel}>cancel</button>
    <span class="hint">a model this machine has no credentials for falls back with a warning</span>
  </div>
</div>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 6px 8px;
    background: transparent;
    font: inherit;
    font-size: 11.5px;
    color: inherit;
    text-align: left;
    width: 100%;
  }
  .row.on {
    background: var(--accent-soft);
  }
  .row.tall {
    align-items: flex-start;
  }
  .key {
    min-width: 12ch;
    color: var(--fg-dimmer);
    flex: none;
  }
  .value {
    flex: 1;
    padding: 4px 7px;
    border: none;
    background: rgba(255, 255, 255, 0.05);
    font: inherit;
    font-size: 11px;
    color: var(--fg-bright);
    resize: vertical;
  }
  .value:focus {
    outline: none;
    background: var(--accent-soft);
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .tool {
    border: none;
    background: transparent;
    font: inherit;
    font-size: 10.5px;
    color: var(--fg-dim);
    cursor: pointer;
    padding: 0;
  }
  .tool.picked {
    color: var(--fg-bright);
  }
  .foot {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding-top: 10px;
  }
  .hint {
    color: var(--fg-dimmer);
    font-size: 10.5px;
  }
  .primary,
  .ghost {
    border: none;
    background: oklch(0.76 0.14 var(--accent-hue) / 0.15);
    font: inherit;
    font-size: 10.5px;
    padding: 3px 9px;
    color: var(--fg-bright);
    cursor: pointer;
  }
  .ghost {
    color: var(--fg-dim);
    background: rgba(255, 255, 255, 0.06);
  }
</style>
