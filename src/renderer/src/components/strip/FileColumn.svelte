<!-- A buffer column: one workspace file in a vim editor (spec D1, D5).
     The editor seam owns the text and the vim engine; the buffers store owns
     what the `:` commands mean; this wires the two and draws the frame. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { app } from '$lib/state/app.svelte'
  import { buffers } from '$lib/state/buffers.svelte'
  import { mountEditor, type EditorHandle } from '$lib/editor/editor'

  const { columnId, focused, onfocus }: {
    columnId: string
    focused: boolean
    onfocus?: () => void
  } = $props()

  const entry = $derived(buffers.get(columnId))

  let host = $state<HTMLDivElement | null>(null)
  let handle: EditorHandle | null = null

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
      onDirtyChange: (dirty) => buffers.setDirty(columnId, dirty),
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
    if (app.mode !== 'NORMAL' && app.mode !== 'INSERT') app.mode = 'NORMAL'
  }
</script>

<section class="buffer" class:focused role="presentation" onclickcapture={onfocus}>
  <header class="head">
    <span class="dot"></span>
    <span class="kind">BUFFER</span>
    <span class="path">{entry?.path ?? columnId}</span>
    {#if entry?.dirty}<span class="mark">+</span>{/if}
  </header>

  {#if entry?.notice}
    <div class="notice">{entry.notice}</div>
  {/if}

  <div class="screen" bind:this={host} onfocusincapture={claimed}></div>

  <div class="hints">
    <span><span class="k">⏎</span> normal</span>
    <span><span class="k">i</span> insert</span>
    <span><span class="k">:w :q :wq :qa</span></span>
    <span class="right"><span class="k">esc</span> back</span>
  </div>
</section>

<style>
  .buffer {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-deep);
    overflow: hidden;
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

  .screen {
    flex: 1;
    min-height: 0;
    overflow: hidden;
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
