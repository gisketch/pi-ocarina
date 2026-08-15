<script lang="ts">
  import SlashMenu from './SlashMenu.svelte'
  import { isSendKey, planSend, sendHint } from '$lib/composer'
  import { wrapIndex } from '$lib/fuzzy'
  import { filterSlash, resolveSlash, slashQuery, type SlashCommand } from '$lib/slash'
  import { app } from '$lib/state/app.svelte'
  import { catalog } from '$lib/state/catalog.svelte'
  import { threads } from '$lib/state/threads.svelte'

  interface Props {
    input?: HTMLTextAreaElement | null
    /** Opens the model spotlight — `/model` has nowhere to go without it. */
    onmodel?: () => void
  }

  let { input = $bindable(null), onmodel }: Props = $props()

  let text = $state('')
  let sending = $state(false)

  const insert = $derived(app.mode === 'INSERT')

  const query = $derived(slashQuery(text))
  const slash = $derived(query === null ? [] : filterSlash(query))
  const menuOpen = $derived(slash.length > 0)
  let picked = $state(0)
  const active = $derived(menuOpen ? wrapIndex(picked, slash.length) : -1)

  const thread = $derived(app.thread)
  const runState = $derived(threads.get(thread.id).runState)
  const hint = $derived(sendHint(runState))

  function run(command: SlashCommand): void {
    text = ''
    picked = 0

    if (command.id === 'compact') threads.compact(thread.id)
    else if (command.id === 'model') onmodel?.()
  }

  /** A fresh column has no thread behind it yet. Sending is what brings one
   *  into existence, so the hero is not a dead end. */
  async function targetThread(): Promise<string | null> {
    if (!thread.fresh) return thread.id
    return catalog.newThread(app.workspace.id)
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

      if (plan.action === 'prompt') threads.prompt(threadId, plan.text)
      else threads.steer(threadId, plan.text)

      // Cleared only once it has gone somewhere: losing a prompt to a failed
      // send would mean retyping it.
      text = ''
    } finally {
      sending = false
    }
  }

  function onkeydown(event: KeyboardEvent): void {
    if (menuOpen) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          picked = wrapIndex(active + 1, slash.length)
          return
        case 'ArrowUp':
          event.preventDefault()
          picked = wrapIndex(active - 1, slash.length)
          return
        case 'Enter':
          if (event.shiftKey) break
          event.preventDefault()
          run(slash[active])
          return
        case 'Escape':
          // Dismisses the menu without leaving INSERT: the person is still
          // writing, they simply do not want the list.
          event.preventDefault()
          event.stopPropagation()
          text = ''
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
    picked = 0
  })
</script>

<div class="dock">
  {#if menuOpen}
    <SlashMenu
      commands={slash}
      {active}
      onpick={run}
      onhover={(index) => (picked = index)}
    />
  {/if}

  <div class="composer" class:insert>
    <span class="caret">&gt;</span>
    <textarea
      bind:this={input}
      bind:value={text}
      {onkeydown}
      rows="1"
      placeholder="Message pi in {app.workspace.name}…  (i to focus)"
      onfocus={() => (app.mode = 'INSERT')}
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
