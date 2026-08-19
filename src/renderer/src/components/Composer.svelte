<script lang="ts">
  import { tick, untrack } from 'svelte'
  import type { ThreadId } from '../../../shared/thread-id'
  import MentionMenu from './MentionMenu.svelte'
  import SlashMenu from './SlashMenu.svelte'
  import { isSendKey, sendHint } from '$lib/composer'
  import { sendMessage } from '$lib/composer-send'
  import { wrapIndex } from '$lib/fuzzy'
  import { fuzzyFilter } from '$lib/fuzzy'
  import { applyMention, mentionAt } from '$lib/mention'
  import { menuKey } from '$lib/composer-menu'
  import { skillsSaid, type SlashCommand } from '$lib/slash'
  import type { CaretField } from '$lib/chip-field'
  import { attachments } from '$lib/state/attachments.svelte'
  import { nameAt, pasting } from '$lib/state/pasting.svelte'
  import { following } from '$lib/state/following.svelte'
  import ChipField from './composer/ChipField.svelte'
  import FoldPeek from './composer/FoldPeek.svelte'
  import { files } from '$lib/state/files.svelte'
  import { app } from '$lib/state/app.svelte'
  import { blockNav } from '$lib/state/block-nav.svelte'
  import { catalog } from '$lib/state/catalog.svelte'
  import { runSlash } from '$lib/state/slash-run'
  import { completions } from '$lib/state/completions.svelte'
  import { drafts } from '$lib/state/drafts.svelte'
  import { projectSurface } from '$lib/state/project-surface.svelte'
  import { shell } from '$lib/state/shell.svelte'
  import { threads } from '$lib/state/threads.svelte'

  interface Props {
    /** The column this composer is the foot of. Every thread column draws one,
     *  so the draft outlives no component — but it does have to stay with its
     *  own column rather than following the caret. */
    columnId: string
    /** Whether this column has the keyboard. Only the focused one takes the
     *  caret, reads the project's commands or opens a completion menu: the
     *  others are showing their own draft, not being typed into. */
    focused: boolean
    /** Opens the model spotlight — `/model` has nowhere to go without it. */
    onmodel?: () => void
    oncommit?: () => void
  }

  const { columnId, focused, onmodel, oncommit }: Props = $props()

  // Two doors to one field: the element for the shell's focus targeting,
  // the handle for everything that thinks in the composer string.
  let element = $state<HTMLElement | null>(null)
  let field = $state<CaretField | null>(null)
  // Read once, deliberately: only the focused column draws a composer, so a
  // different column is a different instance and this id never changes.
  let text = $state(untrack(() => drafts.get(columnId)))
  let sending = $state(false)

  // The draft belongs to the column, not to this component: moving one column
  // over destroys it, and a half-typed message must still be there on the way
  // back.
  $effect(() => drafts.set(columnId, text))

  // The keyboard layer hands the caret to whatever is registered here — and
  // there is exactly one composer at a time, so it is always the right one.
  $effect(() => {
    if (!focused) return
    shell.targets.composer = element
    return () => {
      if (shell.targets.composer === element) shell.targets.composer = null
    }
  })

  const insert = $derived(focused && app.mode === 'INSERT')

  /** The skill names this workspace loaded. Two things ask "is this a
   *  skill?": the field's chips, and the swap into pi's syntax on the way
   *  out. */
  const skillNames = $derived(projectSurface.surface.skills.map((skill) => skill.name))

  const menus = completions({
    text: () => text,
    setText: (next) => (text = next),
    field: () => field,
    focused: () => focused,
  })
  const slash = $derived(menus.slash)
  const paths = $derived(menus.paths)
  const menu = $derived(menus.menu)
  const active = $derived(menus.active)

  /** Enter. Runs a command; writes a skill named inside a sentence, because
   *  there is nothing to run there — the sentence is the message. */
  function choose(index: number): void {
    if (menu === 'mention') menus.insertMention(paths[index])
    else if (menu === 'slash') {
      const command = slash[index]
      if (menus.runnable && command.id !== 'skill') run(command)
      else if (!menus.insertSlash(command)) run(command)
    }
  }

  /** Tab. Always writes into the sentence, never runs. */
  function writeIn(index: number): void {
    if (menu === 'mention') menus.insertMention(paths[index])
    else if (menu === 'slash' && !menus.insertSlash(slash[index])) run(slash[index])
  }

  const trackCaret = (): void => menus.trackCaret()

  // A caret inside a fold's token is the reader asking what is in it.
  const peeked = $derived(pasting.at(text, menus.caret))

  const thread = $derived(app.thread)
  const runState = $derived(threads.get(thread.id).runState)
  const hint = $derived(sendHint(runState))

  function run(command: SlashCommand): void {
    text = ''
    menus.reset()
    runSlash(command, { threadId: app.threadId, targetThread, onmodel, oncommit })
  }

  /** A fresh column has no thread behind it yet. Sending is what brings one
   *  into existence, so the hero is not a dead end. A plain thread, always:
   *  the worktree question is the dashboard's `b` flow, not an interrupt on
   *  the way to typing. */
  async function targetThread(): Promise<ThreadId | null> {
    const here = app.threadId
    if (here !== null) return here
    return catalog.newThread(app.workspace.id)
  }

  async function send(): Promise<void> {
    // A message naming a real command runs it. Anything else starting with `/`
    // is just text someone typed, and is sent as written.
    const command = menus.resolve(text)
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
        // Folds put back, then the readable `/name` written as pi's
        // `/skill:name`. Both are the same idea: the field holds what reads
        // best and this is where it becomes what the backend needs.
        expand: (said) => skillsSaid(pasting.expand(said), skillNames),
        attachments: () => attachments.list,
        prompt: (threadId, said, files) => threads.prompt(threadId, said, files),
        steer: (threadId, said) => threads.steer(threadId, said),
        sent: (threadId) => {
          attachments.clear()
          pasting.clear()
          // Sending is asking for the answer, so the view goes where the
          // answer will be — and to the thread it went to, which for a fresh
          // column is not the placeholder this composer was drawn over.
          following.jump(threadId)
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
    field?.setSelectionRange(next.caret, next.caret)
    trackCaret()
  }

  /** Every paste goes through the model: the browser's own paste would drop
   *  markup into a field whose DOM must serialize back to the string. The
   *  clipboard and the selection are read before anything async — the event
   *  is dead by the time the staging returns. */
  function onpaste(event: ClipboardEvent): void {
    event.preventDefault()
    const plain = event.clipboardData?.getData('text/plain') ?? ''
    const start = field?.selectionStart ?? text.length
    const end = field?.selectionEnd ?? start
    void (async () => {
      const handled = await pasting.fromEvent(event, text, field)
      if (handled) return applyToField(handled)
      if (plain === '') return
      return applyToField({
        text: text.slice(0, start) + plain + text.slice(end),
        caret: start + plain.length,
      })
    })()
  }

  // A file dropped on the window is staged by the shell, which has no caret to
  // insert at. It leaves the names here and the composer writes them into the
  // sentence, so a drop and a paste land in the same place.
  $effect(() => {
    if (attachments.pending.length === 0) return
    void applyToField(nameAt(text, field, attachments.takePending()))
  })

  function onkeydown(event: KeyboardEvent): void {
    // Chip deletion needs no rule here any more: a chip is a
    // `contenteditable="false"` element, and the browser deletes it whole —
    // `oninput`'s prune then drops whatever it staged.

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

    const wanted = menu === null ? null : menuKey(event, menu, active, menus.options)
    if (wanted) {
      event.preventDefault()
      // A key the menu took is the menu's alone. The shell's window handler
      // reads some of these too — ⌘k opens the palette, Escape leaves INSERT
      // — and a key that both walked the list and opened a screen did two
      // things when the reader asked for one.
      event.stopPropagation()
      if (wanted.kind === 'move') menus.highlight(wanted.to)
      else if (wanted.kind === 'choose') choose(wanted.index)
      else if (wanted.kind === 'insert') writeIn(wanted.index)
      else {
        // A slash menu clears the word that opened it; a mention keeps what
        // was typed.
        if (menu === 'slash') text = ''
        else menus.dismiss()
      }
      return
    }

    if (!isSendKey(event)) return
    event.preventDefault()
    void send()
  }

</script>

<div class="dock">
  {#if menu === 'slash'}
    <SlashMenu
      commands={slash}
      {active}
      onpick={run}
      onhover={(index) => menus.highlight(index)}
    />
  {:else if menu === 'mention'}
    <MentionMenu
      {paths}
      {active}
      onpick={(path) => menus.insertMention(path)}
      onhover={(index) => menus.highlight(index)}
    />
  {/if}

  {#if peeked}<FoldPeek fold={peeked} />{/if}

  <div class="composer" class:insert>
    <span class="caret">&gt;</span>
    <ChipField
      bind:value={text}
      bind:handle={field}
      bind:element
      folds={pasting.folds}
      files={attachments.names}
      skills={skillNames}
      placeholder="Message pi in {app.workspace.name}…  (i to focus)"
      {onkeydown}
      {onpaste}
      onmove={trackCaret}
      oninput={() => {
        trackCaret()
        // Deleting a chip is how a reader drops a paste or a file, so what is
        // held has to follow the text rather than outlive it.
        pasting.prune(text)
        attachments.prune(text)
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
  /* Inside the column, so it needs no width or centring of its own — the
     column is already that wide, and the foot is simply its last row. */
  .dock {
    flex: none;
    position: relative;
  }

  .composer {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: rgba(255, 255, 255, 0.025);
    padding: 10px 13px;
    transition: background 0.2s;
  }
  /* Typing brightens the whole field rather than lighting a rule above it. */
  .composer.insert {
    background: rgba(255, 255, 255, 0.06);
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
    background: var(--bg-chip);
    padding: 2px 6px;
  }
</style>
