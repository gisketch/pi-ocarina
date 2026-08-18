<script lang="ts">
  import Backdrop from './Backdrop.svelte'
  import RoleForm from './RoleForm.svelte'
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

  let selected = $state(0)
  /** The pool's field, so `n` can reach it from the list. */
  let poolField = $state.raw<HTMLElement | null>(null)
  /** Whether the name pool is being edited. One list, one textarea: a pool is a
   *  list of words, and a row-per-word editor would be ceremony. */
  let pooling = $state(false)
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
    const saved = await roles.save({ ...draft, id: draft.id || roles.idFor(draft.name) })
    // A refused save keeps the form open with what was typed still in it.
    if (saved) editing = null
  }

  function onkeydown(event: KeyboardEvent): void {
    if (isTyping(event.target)) {
      // `esc` leaves the field without leaving the form; the field's own keys
      // are otherwise its own, so a role called "scout" is a name and not five
      // bindings.
      if (event.key === 'Escape') {
        ;(event.target as HTMLElement).blur()
        event.preventDefault()
      }
      // `tab` walks the fields, which is the one way to move without a mouse
      // while the caret is in one.
      if (event.key === 'Tab') {
        field = wrapIndex(field + (event.shiftKey ? -1 : 1), FIELDS.length)
        event.preventDefault()
      }
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
      case 'n':
        // Straight to the pool, since it is one field below a list the cursor
        // does not walk into.
        poolField?.focus()
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
      <RoleForm
        role={editing}
        {field}
        onchange={(next) => (editing = next)}
        onfield={(next) => (field = next)}
        onsave={() => void commit()}
        oncancel={() => (editing = null)}
      />
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

      <label class="row pool" class:on={pooling}>
        <span class="key">names</span>
        <textarea
          class="value"
          bind:this={poolField}
          rows="2"
          value={roles.names.join(' ')}
          placeholder="odysseus penelope circe…"
          onfocus={() => (pooling = true)}
          onblur={(event) => {
            pooling = false
            void roles.setNames(event.currentTarget.value.split(/\s+/))
          }}
        ></textarea>
      </label>

      <div class="foot">
        <button type="button" class="primary" onclick={add}>add a role</button>
        <span class="hint">⏎ edit · a add · d delete · esc close · a child borrows one name per run</span>
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
  .entry,
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
  .entry {
    cursor: pointer;
  }
  .entry:hover {
    background: var(--bg-hover);
  }
  .entry.on,
  .row.on {
    background: var(--accent-soft);
  }
  .row.pool {
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
  .foot {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding-top: 10px;
  }
  .primary {
    color: var(--fg-dim);
  }
  .error {
    margin: 0;
    color: var(--err);
    font-size: 10.5px;
  }
</style>
