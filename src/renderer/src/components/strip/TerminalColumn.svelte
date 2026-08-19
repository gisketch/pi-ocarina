<script lang="ts">
  import { onMount } from 'svelte'
  import { Terminal } from '@xterm/xterm'
  import { FitAddon } from '@xterm/addon-fit'
  import { WebglAddon } from '@xterm/addon-webgl'
  import { app } from '$lib/state/app.svelte'
  import { registerColumnScroller } from '$lib/state/columns'
  import { SCROLL_STEP } from '$lib/keyboard'
  import { xtermShouldHandle } from '$lib/terminal-keys'
  import { terminalId } from '$lib/types'
  import { terminals } from '$lib/state/terminal.svelte'
  import '@xterm/xterm/css/xterm.css'

  const { workspaceId, name, focused, onfocus }: {
    workspaceId: string
    name: string
    focused: boolean
    onfocus?: () => void
  } = $props()

  /** Lines per j/k press. Matches the thread column's step closely enough that
   *  the two feel like the same key. */
  const SCROLL_LINES = 3

  let host = $state<HTMLDivElement | null>(null)
  let term: Terminal | null = null
  let fit: FitAddon | null = null
  const id = $derived(terminalId(workspaceId))

  /** Read from the document rather than hardcoded: the accent is seeded per
   *  workspace, so the cursor follows whichever workspace this shell is in. */
  function token(name: string, fallback: string): string {
    if (typeof getComputedStyle !== 'function' || !host) return fallback
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
  }

  onMount(() => {
    if (!host) return

    const accent = token('--accent', '#7fd7a4')
    term = new Terminal({
      fontFamily: token('--font-body', 'JetBrains Mono, monospace'),
      fontSize: 12,
      lineHeight: 1.35,
      cursorBlink: true,
      // No ghost cursor from the strip: an unfocused shell draws none, the
      // same rule the buffer's block cursor follows in OCARINA.
      cursorInactiveStyle: 'none',
      // Scrollback is the reason j/k works here; xterm owns its own viewport.
      scrollback: 5000,
      theme: {
        background: token('--bg-deep', '#0a0a0c'),
        foreground: token('--fg-body', '#d6d6d2'),
        cursor: accent,
        cursorAccent: token('--bg-deep', '#0a0a0c'),
        selectionBackground: 'rgba(255,255,255,0.16)',
      },
    })

    fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)

    // The GPU renderer is what keeps a scrolling build cheap. It is loaded
    // after open() because it needs a canvas, and it is optional: a machine
    // that cannot give us a WebGL context still gets a working terminal.
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch {
      // Falls back to the DOM renderer.
    }

    resize()

    // The Nerd Font symbols load as a file, and xterm draws from a glyph
    // atlas it built at open — before the file landed, every icon in a
    // prompt or a TUI is a block. Once the face is in, resetting the family
    // (through a real change, same-value sets are ignored) rebuilds the
    // atlas with the symbols present. DOM text re-renders itself on font
    // load; a canvas has to be told.
    void document.fonts.load('12px "Symbols Nerd Font Mono"').then(() => {
      if (!term) return
      const family = term.options.fontFamily
      term.options.fontFamily = 'monospace'
      term.options.fontFamily = family
      fit?.fit()
    })

    // Escape belongs to the shell, not to xterm.
    //
    // xterm handles Escape itself and stops it before it reaches the window,
    // which left the mode machine blind to the one key that leaves TERM.
    // Returning false here declines the key so it propagates normally; the
    // shell then decides whether it means "leave" or, pressed twice, "send a
    // real escape through". Every other key stays xterm's.
    term.attachCustomKeyEventHandler(xtermShouldHandle)

    // Keystrokes go straight out: buffering a key is a key that feels slow.
    const typed = term.onData((data) => terminals.write(id, data))
    const stop = terminals.onData(id, (data) => term?.write(data))

    const observer = new ResizeObserver(() => resize())
    observer.observe(host)

    // j/k scroll the focused column through one registry, whatever the column
    // is. xterm keeps its scrollback in a buffer of its own rather than as DOM
    // overflow, so it registers its scroll call instead of an element.
    const unregister = registerColumnScroller(id, (top) => {
      // The magnitude is in the thread column's pixels; a terminal counts in
      // lines. Converting keeps one contract — a scroller is asked to move by
      // an amount — so a half-page press moves a shell about as far as it
      // moves a transcript.
      const steps = Math.max(1, Math.round(Math.abs(top) / SCROLL_STEP))
      term?.scrollLines(Math.sign(top) * SCROLL_LINES * steps)
    })

    return () => {
      unregister()
      typed.dispose()
      stop()
      observer.disconnect()
      term?.dispose()
      term = null
    }
  })

  function resize(): void {
    if (!fit || !term) return
    try {
      fit.fit()
      terminals.resize(id, term.cols, term.rows)
    } catch {
      // The column is mid-transition and has no measurable size yet.
    }
  }

  // The pty owns the keyboard only in TERM. In NORMAL the column behaves like
  // any other: h/l move, j/k scroll — so focus follows the mode, not the click.
  $effect(() => {
    if (!term) return
    if (focused && app.mode === 'TERM') term.focus()
    else term.blur()
  })

</script>

<section class="terminal" class:focused onclickcapture={onfocus} role="presentation">
  <header class="head">
    <span class="dot"></span>
    <span class="kind">TERMINAL · zsh</span>
    <span class="name">{name}</span>
    <span class="key">t</span>
  </header>

  <div class="screen" bind:this={host}></div>

  <div class="hints">
    <span><span class="k">i</span> type</span>
    <span><span class="k">esc</span> normal</span>
    <span><span class="k">esc esc</span> literal esc</span>
    <span><span class="k">⇧H/⇧L</span> move column</span>
    <span class="right"><span class="k">␣x</span> close</span>
  </div>
</section>

<style>
  /* Its own frame rather than ThreadColumn's: a shell is not a transcript, and
     borrowing that chrome printed the name twice. */
  .terminal {
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
  .name {
    color: var(--fg-bright);
  }
  .key {
    margin-left: auto;
    font-size: 10px;
    color: var(--fg-dimmest);
    background: var(--bg-chip);
    padding: 2px 6px;
  }

  .screen {
    flex: 1;
    min-height: 0;
    padding: 10px 12px;
  }

  .hints {
    flex: none;
    display: flex;
    gap: 14px;
    padding: 8px 14px;
    background: var(--bg-raise-3);
    font-family: var(--font-chrome);
    font-size: 10px;
    color: var(--fg-dimmest);
  }
  .k {
    color: var(--fg-dim);
  }
  .right {
    margin-left: auto;
  }
</style>
