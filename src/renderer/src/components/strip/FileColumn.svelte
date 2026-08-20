<!-- A buffer column: one workspace file in a vim editor (spec D1, D5).
     The editor seam owns the text and the vim engine; the buffers store owns
     what the `:` commands mean; this wires the two and draws the frame. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import EditorRendered from './EditorRendered.svelte'
  import { app } from '$lib/state/app.svelte'
  import { buffers } from '$lib/state/buffers.svelte'
  import { registerColumnBody } from '$lib/state/columns'
  import { isVimMode } from '$lib/types'
  import { preferences } from '$lib/state/preferences.svelte'
  import { toasts } from '$lib/state/toasts.svelte'
  import { mountEditor, type EditorHandle } from '$lib/editor/editor'
  import { isMarkdownPath, readsRendered } from '$lib/editor/reading'

  const { columnId, focused, onfocus }: {
    columnId: string
    focused: boolean
    onfocus?: () => void
  } = $props()

  const entry = $derived(buffers.get(columnId))

  let host = $state<HTMLDivElement | null>(null)
  let handle = $state<EditorHandle | null>(null)

  /* Markdown reads rendered; entering vim shows the source (spec:
     pane-reveal-and-editor). Only the reader-facing view swaps — the
     CodeMirror instance stays mounted backstage so cursor, undo history and
     unsaved edits survive every swap. */
  const markdown = $derived(isMarkdownPath(entry?.path ?? ''))
  const reading = $derived(readsRendered(entry?.path ?? '', focused, app.mode))
  /* The live editor text, dirty edits included; `entry.text` is a dependency
     so a watcher reload of a clean buffer re-renders, and the pre-mount
     fallback for the first paint. */
  const readingText = $derived(reading ? (handle?.text() ?? entry?.text ?? '') : '')

  /* While the rendered view shows, it is the column's scroll box: ctrl-d/u
     page it through the existing seam, and a wheel yields a keyboard scroll
     the same way a transcript does. Unmounting unregisters, so vim's own
     ctrl-d never fights it. */
  let readBox = $state<HTMLDivElement | null>(null)
  $effect(() => {
    if (!readBox) return
    return registerColumnBody(columnId, readBox)
  })

  // The settings toggle reaches every open buffer live.
  $effect(() => {
    handle?.setRelativeNumbers(preferences.bufferRelativeNumbers)
  })

  onMount(() => {
    const opened = buffers.get(columnId)
    if (!host || !opened) return

    handle = mountEditor(host, {
      text: opened.text,
      path: opened.path,
      bag: {
        save: (force) => buffers.save(columnId, force),
        quit: (force) => buffers.quit(columnId, force),
        quitAll: (force) => buffers.quitAll(force),
      },
      onModeChange: (mode) => buffers.mirrorMode(columnId, mode),
      onNotify: (text) => toasts.push({ tone: 'info', text }),
      onDirtyChange: (dirty) => buffers.setDirty(columnId, dirty),
      relativeNumbers: preferences.bufferRelativeNumbers,
    })
    const unregister = buffers.register(columnId, handle)

    return () => {
      unregister()
      handle?.destroy()
      handle = null
    }
  })

  /** A click into the editor is a claim on the keyboard: the strip's focus
   *  follows, and the mode mirrors vim rather than staying on the strip. */
  function claimed(): void {
    onfocus?.()
    if (!isVimMode(app.mode)) app.mode = 'NORMAL'
  }
</script>

<section class="buffer" class:focused role="presentation" onclickcapture={onfocus}>
  <header class="head">
    <span class="dot"></span>
    <span class="kind">EDITOR</span>
    <span class="path">{entry?.path ?? columnId}</span>
    {#if entry?.dirty}<span class="mark">+</span>{/if}
  </header>

  {#if entry?.notice}
    <div class="notice">{entry.notice}</div>
  {/if}

  {#if reading}
    <div class="reading" bind:this={readBox}>
      <EditorRendered text={readingText} />
    </div>
  {/if}
  <div class="screen" class:backstage={reading} bind:this={host} onfocusincapture={claimed}></div>

  <div class="hints">
    <span><span class="k">⏎</span> {markdown ? 'edit source' : 'normal'}</span>
    <span><span class="k">i</span> insert</span>
    <span><span class="k">:w :q :wq :qa</span></span>
    <span><span class="k">s</span> leap</span>
    <span class="right"><span class="k">esc</span> back</span>
  </div>
</section>

<style>
  .buffer {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    /* A buffer is another column in the same strip, so it uses the CHAT
       column's exact attention treatment rather than becoming a dark editor
       embedded beside it. CodeMirror itself stays transparent. */
    background: var(--bg-column-idle);
    opacity: 0.4;
    transition:
      opacity 0.4s,
      background 0.4s;
    overflow: hidden;
    cursor: pointer;
  }
  .buffer.focused {
    opacity: 1;
    background: var(--bg-column-focus);
    cursor: default;
  }

  .head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px 14px;
    background: var(--bg-header);
    font-size: 11px;
  }
  .dot {
    width: 6px;
    height: 6px;
    background: var(--accent);
    flex: none;
  }
  .kind {
    font-family: var(--font-chrome);
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--fg-dim);
  }
  .path {
    color: var(--fg-bright);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
    min-width: 0;
  }
  .mark {
    margin-left: auto;
    color: var(--accent);
    font-size: 12px;
    flex: none;
  }

  .notice {
    flex: none;
    padding: 5px 14px;
    background: var(--err-soft, rgba(255, 90, 90, 0.08));
    color: var(--err-text, #e88);
    font-family: var(--font-body);
    font-size: 11px;
  }

  .reading {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px 20px;
  }

  .screen {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  /* Hidden, not gone: the vim state lives in this instance, and an element
     that kept `display` stays focusable — entering vim focuses it in the
     same keystroke, before the rendered view has even unmounted. */
  .screen.backstage {
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
  }
  .screen :global(.cm-editor) {
    height: 100%;
  }

  .hints {
    flex: none;
    display: flex;
    gap: 12px;
    padding: 7px 14px;
    background: var(--bg-header);
    font-size: 10px;
    color: var(--fg-dimmest);
  }
  .k {
    color: var(--fg-dim);
    background: var(--bg-chip);
    padding: 1px 5px;
  }
  .right {
    margin-left: auto;
  }
</style>
