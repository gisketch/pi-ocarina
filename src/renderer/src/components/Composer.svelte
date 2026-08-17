<script lang="ts">
  import { tick } from 'svelte'
  import MentionMenu from './MentionMenu.svelte'
  import SlashMenu from './SlashMenu.svelte'
  import { isSendKey, sendHint } from '$lib/composer'
  import { sendMessage } from '$lib/composer-send'
  import { wrapIndex } from '$lib/fuzzy'
  import { fuzzyFilter } from '$lib/fuzzy'
  import { applyMention, mentionAt } from '$lib/mention'
  import { filterSlash, resolveSlash, slashQuery, type SlashCommand } from '$lib/slash'
  import { attachments } from '$lib/state/attachments.svelte'
  import { pasting } from '$lib/state/pasting.svelte'
  import StagedChips from './composer/StagedChips.svelte'
  import Field from './composer/Field.svelte'
  import FoldPeek from './composer/FoldPeek.svelte'
  import { files } from '$lib/state/files.svelte'
  import { app } from '$lib/state/app.svelte'
  import { blockNav } from '$lib/state/block-nav.svelte'
  import { catalog } from '$lib/state/catalog.svelte'
  import { createThread } from '$lib/state/new-thread'
  import { runSlash } from '$lib/state/slash-run'
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

  // A caret inside a fold's token is the reader asking what is in it.
  const peeked = $derived(pasting.at(text, caret))

  const thread = $derived(app.thread)
  const runState = $derived(threads.get(thread.id).runState)
  const hint = $derived(sendHint(runState))

  function run(command: SlashCommand): void {
    text = ''
    picked = 0
    runSlash(command, { threadId: thread.id, onmodel, oncommit })
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
    if (sending) return

    sending = true
    try {
      const went = await sendMessage(text, {
        runState,
        targetThread,
        expand: (said) => pasting.expand(said),
        attachments: () => attachments.list,
        prompt: (threadId, said, files) => threads.prompt(threadId, said, files),
        steer: (threadId, said) => threads.steer(threadId, said),
        sent: () => {
          attachments.clear()
          pasting.clear()
        },
      })
      if (went) text = ''
    } finally {
      sending = false
    }
  }

  /** Applies whatever the paste layer decided, then puts the caret where it
   *  said. The wait is Svelte's: the token only exists in the field once the
   *  new value has been written to it. */
  async function applyToField(next: { text: string; caret: number } | null): Promise<void> {
    if (!next) return
    text = next.text
    await tick()
    input?.setSelectionRange(next.caret, next.caret)
    trackCaret()
  }

  const onpaste = async (event: ClipboardEvent): Promise<void> =>
    applyToField(await pasting.fromEvent(event, text, input))

  function onkeydown(event: KeyboardEvent): void {
    // A chip is one thing. Taking a character out of the middle of a token
    // dropped the paste and left its characters behind as literal text.
    if (event.key === 'Backspace' && input?.selectionStart === input?.selectionEnd) {
      const cut = pasting.backspace(text, input?.selectionStart ?? 0)
      if (cut) {
        event.preventDefault()
        void applyToField(cut)
        return
      }
    }

    // The fold was applied by assignment, not by the browser, so there is
    // nothing in the field's own undo stack to go back to. Only handled when
    // there is a fold to unfold; otherwise the browser's undo is untouched.
    if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey) {
      const undone = pasting.undo(text)
      if (undone) {
        event.preventDefault()
        void applyToField(undone)
        return
      }
    }

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

  {#if peeked}<FoldPeek fold={peeked} />{/if}
  <StagedChips />

  <div class="composer" class:insert>
    <span class="caret">&gt;</span>
    <Field
      bind:value={text}
      bind:element={input}
      folds={pasting.folds}
      placeholder="Message pi in {app.workspace.name}…  (i to focus)"
      {onkeydown}
      {onpaste}
      onmove={trackCaret}
      oninput={() => {
        trackCaret()
        // Deleting a chip is how a reader drops a paste, so the held text has
        // to follow the token rather than outlive it.
        pasting.prune(text)
      }}
      onfocus={() => blockNav.startTyping()}
      onblur={() => {
        if (app.mode === 'INSERT') app.mode = 'NORMAL'
      }}
    />
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
