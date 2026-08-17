<script lang="ts">
  import MentionMenu from './MentionMenu.svelte'
  import SlashMenu from './SlashMenu.svelte'
  import { isSendKey, planSend, sendHint } from '$lib/composer'
  import { wrapIndex } from '$lib/fuzzy'
  import { fuzzyFilter } from '$lib/fuzzy'
  import { applyMention, mentionAt } from '$lib/mention'
  import { filterSlash, resolveSlash, slashQuery, type SlashCommand } from '$lib/slash'
  import { attachments } from '$lib/state/attachments.svelte'
  import { files } from '$lib/state/files.svelte'
  import { app } from '$lib/state/app.svelte'
  import { blockNav } from '$lib/state/block-nav.svelte'
  import { catalog } from '$lib/state/catalog.svelte'
  import { createThread } from '$lib/state/new-thread'
  import { threads } from '$lib/state/threads.svelte'

  interface Props {
    input?: HTMLTextAreaElement | null
    /** Opens the model spotlight — `/model` has nowhere to go without it. */
    onmodel?: () => void
    oncommit?: () => void
  }

  let { input = $bindable(null), onmodel, oncommit }: Props = $props()

  let text = $state('')
  let sending = $state(false)

  const insert = $derived(app.mode === 'INSERT')
  const chips = $derived(attachments.list)

  const query = $derived(slashQuery(text))
  const slash = $derived(query === null ? [] : filterSlash(query))

  // Where the caret is, so `@` knows which word it is inside.
  let caret = $state(0)
  /** Where a mention the user dismissed started, so Escape sticks. Cleared as
   *  soon as they type a different one — otherwise Escape would silently
   *  disable the picker for the rest of the message. */
  let dismissed = $state<number | null>(null)
  const found = $derived(mentionAt(text, caret))
  const mention = $derived(found && found.start === dismissed ? null : found)
  const paths = $derived(
    mention === null
      ? []
      : fuzzyFilter(files.files(app.workspace.id), mention.query, (path) => path).slice(0, 8),
  )

  // One menu at a time. A slash only ever opens at position 0 and a mention
  // never starts there, so the two cannot both be open.
  const menu = $derived(slash.length > 0 ? 'slash' : paths.length > 0 ? 'mention' : null)
  const options = $derived(menu === 'slash' ? slash.length : paths.length)
  let picked = $state(0)
  const active = $derived(menu === null ? -1 : wrapIndex(picked, options))

  $effect(() => {
    files.ensure(app.workspace.id)
  })

  function insertMention(path: string): void {
    if (!mention) return
    const next = applyMention(text, mention, path)
    text = next.text
    picked = 0
    // Restored after Svelte writes the new value, or the caret jumps to the end.
    queueMicrotask(() => {
      input?.setSelectionRange(next.caret, next.caret)
      caret = next.caret
    })
  }

  function choose(index: number): void {
    if (menu === 'slash') run(slash[index])
    else if (menu === 'mention') insertMention(paths[index])
  }

  function trackCaret(): void {
    caret = input?.selectionStart ?? 0
  }

  const thread = $derived(app.thread)
  const runState = $derived(threads.get(thread.id).runState)
  const hint = $derived(sendHint(runState))

  function run(command: SlashCommand): void {
    text = ''
    picked = 0

    if (command.id === 'compact') threads.compact(thread.id)
    else if (command.id === 'model') onmodel?.()
    else if (command.id === 'commit') oncommit?.()
  }

  /** A fresh column has no thread behind it yet. Sending is what brings one
   *  into existence, so the hero is not a dead end. */
  async function targetThread(): Promise<string | null> {
    if (!thread.fresh) return thread.id
    return createThread(app.workspace.id)
  }

  async function send(): Promise<void> {
    // A message naming a real command runs it. Anything else starting with `/`
    // is just text someone typed, and is sent as written.
    const command = resolveSlash(text)
    if (command) {
      run(command)
      return
    }

    const plan = planSend(text, runState)
    if (plan.action === 'none' || sending) return

    sending = true
    try {
      const threadId = await targetThread()
      if (!threadId) return

      if (plan.action === 'prompt') threads.prompt(threadId, plan.text, attachments.list)
      else threads.steer(threadId, plan.text)

      attachments.clear()

      // Cleared only once it has gone somewhere: losing a prompt to a failed
      // send would mean retyping it.
      text = ''
    } finally {
      sending = false
    }
  }

  function onkeydown(event: KeyboardEvent): void {
    if (menu !== null) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          picked = wrapIndex(active + 1, options)
          return
        case 'ArrowUp':
          event.preventDefault()
          picked = wrapIndex(active - 1, options)
          return
        case 'Tab':
          // Tab completes a path, which is what a file picker trains fingers to
          // expect. It has no meaning for the command list.
          if (menu !== 'mention') break
          event.preventDefault()
          choose(active)
          return
        case 'Enter':
          if (event.shiftKey) break
          event.preventDefault()
          choose(active)
          return
        case 'Escape':
          // Dismisses the menu without leaving INSERT: the person is still
          // writing, they simply do not want the list. A slash menu clears the
          // word that opened it; a mention keeps what was typed.
          event.preventDefault()
          event.stopPropagation()
          if (menu === 'slash') text = ''
          else dismissed = mention?.start ?? null
          return
      }
    }

    if (!isSendKey(event)) return
    event.preventDefault()
    void send()
  }

  // Grows with the text up to a few lines, then scrolls. Height is set from
  // content rather than animated, so nothing here can drop a frame.
  function resize(element: HTMLTextAreaElement): void {
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`
  }

  $effect(() => {
    void text
    if (input) resize(input)
  })

  $effect(() => {
    void query
    void mention?.query
    picked = 0
  })
</script>

<div class="dock">
  {#if menu === 'slash'}
    <SlashMenu
      commands={slash}
      {active}
      onpick={run}
      onhover={(index) => (picked = index)}
    />
  {:else if menu === 'mention'}
    <MentionMenu
      {paths}
      {active}
      onpick={insertMention}
      onhover={(index) => (picked = index)}
    />
  {/if}

  {#if chips.length > 0}
    <div class="chips">
      {#each chips as attachment (attachment.path)}
        <span class="chip" class:image={(attachment.mime ?? '').startsWith('image/')}>
          <span class="glyph">▤</span>{attachment.name}
          <button
            type="button"
            class="drop"
            aria-label="remove {attachment.name}"
            onclick={() => attachments.remove(attachment.path)}>✕</button
          >
        </span>
      {/each}
    </div>
  {/if}

  <div class="composer" class:insert>
    <span class="caret">&gt;</span>
    <textarea
      bind:this={input}
      bind:value={text}
      {onkeydown}
      onselect={trackCaret}
      onclick={trackCaret}
      oninput={trackCaret}
      onkeyup={trackCaret}
      rows="1"
      placeholder="Message pi in {app.workspace.name}…  (i to focus)"
      onfocus={() => blockNav.startTyping()}
      onblur={() => {
        if (app.mode === 'INSERT') app.mode = 'NORMAL'
      }}
    ></textarea>
    <span class="hints">
      <span><span class="kbd">⏎</span> {hint}</span>
      <span><span class="kbd">⇧⏎</span> newline</span>
      <span><span class="kbd">esc</span> normal</span>
    </span>
  </div>
</div>

<style>
  .dock {
    flex: none;
    padding: 0 28px 14px;
  }

  .composer {
    max-width: var(--column-w);
    margin: 0 auto;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    border: 1px solid var(--bg-chip);
    background: var(--bg-raise-3);
    padding: 11px 14px;
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
  }
  .composer.insert {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .caret {
    color: var(--accent);
    line-height: 1.5;
  }

  textarea {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg-body);
    font-family: var(--font-body);
    font-size: 13px;
    line-height: 1.5;
    caret-color: var(--accent);
    resize: none;
    overflow-y: auto;
    min-width: 0;
    scrollbar-width: thin;
    scrollbar-color: #2c2c33 transparent;
  }
  textarea::placeholder {
    color: var(--fg-dimmest);
  }

  .chips {
    max-width: var(--column-w);
    margin: 0 auto 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    border: 1px solid var(--line-strong);
    background: var(--bg-hover);
    padding: 2px 8px;
    font-size: 11px;
    font-family: var(--font-body);
    color: var(--fg-agent);
  }
  .chip.image {
    border-color: oklch(0.76 0.14 var(--accent-hue) / 0.5);
  }
  .glyph {
    color: var(--fg-dim);
  }
  .chip.image .glyph {
    color: var(--accent);
  }
  .drop {
    background: none;
    border: none;
    padding: 0;
    color: var(--fg-dimmest);
    font: inherit;
    font-size: 10px;
    cursor: pointer;
    transition: color 0.15s;
  }
  .drop:hover {
    color: var(--err);
  }

  .hints {
    color: var(--fg-dimmest);
    font-size: 10px;
    display: flex;
    gap: 10px;
    flex: none;
    line-height: 1.5;
  }
  .kbd {
    border: 1px solid rgba(255, 255, 255, 0.09);
    padding: 1px 5px;
  }
</style>
