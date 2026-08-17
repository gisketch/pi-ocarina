<script lang="ts">
  import Backdrop from './Backdrop.svelte'
  import { wrapIndex } from '$lib/fuzzy'
  import { roles } from '$lib/state/roles.svelte'
  import { READ_ONLY_TOOLS } from '../../../../shared/vocabulary'
  import type { AgentRole } from '$lib/thread'

  /** The roles a child agent can be spawned as.
   *
   *  A list first, a form second: reading four working roles is how the shape
   *  of a role is learned, so the list is what opens. `⏎` edits, `a` adds, `d`
   *  deletes, `esc` backs out one level at a time — out of the form, then out of
   *  the screen. */
  const { onclose }: { onclose: () => void } = $props()

  /** Every tool a role may be given. A fixed list rather than free text: a
   *  typo'd tool name is a role that silently cannot do its job. */
  const TOOLS = [...READ_ONLY_TOOLS, 'bash', 'write', 'edit']

  let selected = $state(0)
  /** The role being edited, or null while the list has the keys. A copy: the
   *  list must not change under the reader while they are typing into it. */
  let editing = $state.raw<AgentRole | null>(null)
  let field = $state(0)

  const FIELDS = ['name', 'instructions', 'tools', 'model'] as const

  $effect(() => {
    void roles.load()
  })

  function edit(role: AgentRole): void {
    editing = { ...role, tools: [...role.tools] }
    field = 0
  }

  function add(): void {
    editing = { id: '', name: '', instructions: '', tools: [...READ_ONLY_TOOLS] }
    field = 0
  }

  async function commit(): Promise<void> {
    const draft = editing
    if (!draft || draft.name.trim() === '' || draft.instructions.trim() === '') return

    // The id is set once, when the role is first saved: renaming a role must
    // not orphan it into a second entry.
    await roles.save({ ...draft, id: draft.id || roles.idFor(draft.name) })
    editing = null
  }

  function toggleTool(tool: string): void {
    if (!editing) return
    const held = editing.tools
    editing = {
      ...editing,
      tools: held.includes(tool) ? held.filter((one) => one !== tool) : [...held, tool],
    }
  }

  function onkeydown(event: KeyboardEvent): void {
    if (isTyping(event.target)) {
      if (event.key === 'Escape') (event.target as HTMLElement).blur()
      return
    }

    if (editing) {
      switch (event.key) {
        case 'j':
        case 'ArrowDown':
          field = wrapIndex(field + 1, FIELDS.length)
          break
        case 'k':
        case 'ArrowUp':
          field = wrapIndex(field - 1, FIELDS.length)
          break
        case 'Escape':
          editing = null
          break
        case 'Enter':
          void commit()
          break
        default:
          return
      }
      event.preventDefault()
      return
    }

    switch (event.key) {
      case 'j':
      case 'ArrowDown':
        selected = wrapIndex(selected + 1, Math.max(1, roles.roles.length))
        break
      case 'k':
      case 'ArrowUp':
        selected = wrapIndex(selected - 1, Math.max(1, roles.roles.length))
        break
      case 'a':
        add()
        break
      case 'Enter':
        if (roles.roles[selected]) edit(roles.roles[selected])
        break
      case 'd':
        if (roles.roles[selected]) void roles.remove(roles.roles[selected].id)
        break
      case 'Escape':
        onclose()
        break
      default:
        return
    }
    event.preventDefault()
  }

  /** A key typed into a field is the field's. */
  function isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null
    return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA'
  }
</script>

<svelte:window {onkeydown} />

<Backdrop {onclose} z={55} label="agent roles">
  <div class="roles">
    <div class="head">
      <span class="title">AGENT ROLES</span>
      <span class="hint">a role is a system prompt, a tool ceiling and a model</span>
    </div>

    {#if editing}
      <div class="form">
        <label class="row" class:on={field === 0}>
          <span class="key">name</span>
          <input
            class="value"
            value={editing.name}
            placeholder="scout"
            oninput={(event) => (editing = { ...editing!, name: event.currentTarget.value })}
          />
        </label>

        <label class="row tall" class:on={field === 1}>
          <span class="key">instructions</span>
          <textarea
            class="value"
            rows="5"
            value={editing.instructions}
            placeholder="You find things in a codebase and report where they are…"
            oninput={(event) =>
              (editing = { ...editing!, instructions: event.currentTarget.value })}
          ></textarea>
        </label>

        <div class="row" class:on={field === 2}>
          <span class="key">tools</span>
          <span class="tools">
            {#each TOOLS as tool (tool)}
              <button
                type="button"
                class="tool"
                class:picked={editing.tools.includes(tool)}
                onclick={() => toggleTool(tool)}
              >
                {editing.tools.includes(tool) ? '■' : '□'} {tool}
              </button>
            {/each}
          </span>
        </div>

        <label class="row" class:on={field === 3}>
          <span class="key">model</span>
          <input
            class="value"
            value={editing.model ?? ''}
            placeholder="this session's model"
            oninput={(event) =>
              (editing = { ...editing!, model: event.currentTarget.value || undefined })}
          />
        </label>

        <div class="foot">
          <button type="button" class="primary" onclick={() => void commit()}>save</button>
          <button type="button" class="ghost" onclick={() => (editing = null)}>cancel</button>
          <span class="hint">a model this machine has no credentials for falls back with a warning</span>
        </div>
      </div>
    {:else}
      <div class="list">
        {#if roles.roles.length === 0}
          <p class="empty">
            No roles. A child can still be given instructions inline, and gets read-only tools.
          </p>
        {/if}
        {#each roles.roles as role, index (role.id)}
          <button type="button" class="entry" class:on={index === selected} onclick={() => edit(role)}>
            <span class="name">{role.name}</span>
            <span class="tools-said">{role.tools.join(' ') || 'no tools'}</span>
            <span class="model">{role.model ?? ''}</span>
          </button>
        {/each}
      </div>

      <div class="foot">
        <button type="button" class="primary" onclick={add}>add a role</button>
        <span class="hint">⏎ edit · a add · d delete · esc close</span>
      </div>
    {/if}

    {#if roles.error}<p class="error">{roles.error}</p>{/if}
  </div>
</Backdrop>

<style>
  .roles {
    width: min(620px, 90vw);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    background: var(--bg-panel);
    border: 1px solid var(--line-strong);
    font-size: 11.5px;
    color: var(--fg-body);
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .title {
    color: var(--fg-bright);
    letter-spacing: 0.08em;
  }
  .hint,
  .tools-said,
  .model,
  .empty {
    color: var(--fg-dimmer);
    font-size: 10.5px;
  }
  .list,
  .form {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .entry,
  .row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 5px 7px;
    border: 1px solid transparent;
    background: transparent;
    font: inherit;
    font-size: 11.5px;
    color: inherit;
    text-align: left;
    width: 100%;
  }
  .entry {
    cursor: pointer;
  }
  .entry:hover {
    background: var(--bg-hover);
  }
  .entry.on,
  .row.on {
    border-color: var(--accent-soft);
  }
  .row.tall {
    align-items: flex-start;
  }
  .name {
    color: var(--fg-bright);
    min-width: 10ch;
  }
  .tools-said {
    flex: 1;
  }
  .key {
    min-width: 12ch;
    color: var(--fg-dimmer);
    flex: none;
  }
  .value {
    flex: 1;
    padding: 3px 6px;
    border: 1px solid var(--line-mid);
    background: transparent;
    font: inherit;
    font-size: 11px;
    color: var(--fg-bright);
    resize: vertical;
  }
  .value:focus {
    outline: none;
    border-color: var(--accent-soft);
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
    padding-top: 6px;
    border-top: 1px solid var(--line-mid);
  }
  .primary,
  .ghost {
    border: 1px solid var(--line-strong);
    background: transparent;
    font: inherit;
    font-size: 10.5px;
    padding: 3px 9px;
    color: var(--fg-bright);
    cursor: pointer;
  }
  .ghost {
    color: var(--fg-dim);
  }
  .error {
    margin: 0;
    color: var(--err);
    font-size: 10.5px;
  }
</style>
