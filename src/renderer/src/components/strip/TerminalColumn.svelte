<script lang="ts">
  import { onMount } from 'svelte'
  import { Terminal } from '@xterm/xterm'
  import { FitAddon } from '@xterm/addon-fit'
  import { app } from '$lib/state/app.svelte'
  import { terminals } from '$lib/state/terminal.svelte'
  import '@xterm/xterm/css/xterm.css'

  const { workspaceId, name, focused, onfocus }: {
    workspaceId: string
    name: string
    focused: boolean
    onfocus?: () => void
  } = $props()

  let host = $state<HTMLDivElement | null>(null)
  let term: Terminal | null = null
  let fit: FitAddon | null = null

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
    resize()

    // Keystrokes go straight out: buffering a key is a key that feels slow.
    const typed = term.onData((data) => terminals.write(workspaceId, data))
    const stop = terminals.onData(workspaceId, (data) => term?.write(data))

    const observer = new ResizeObserver(() => resize())
    observer.observe(host)

    return () => {
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
      terminals.resize(workspaceId, term.cols, term.rows)
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

  /** Scrollback for `j`/`k`, which reach here through the column scroller. */
  export function scrollBy(delta: number): void {
    term?.scrollLines(Math.sign(delta) * 3)
  }
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
    border: 1px solid var(--line-faint);
    overflow: hidden;
    transition: border-color 0.4s;
  }
  .terminal.focused {
    border-color: var(--accent-soft);
  }

  .head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line-faint);
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
    border: 1px solid var(--line-mid);
    padding: 1px 5px;
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
    border-top: 1px solid var(--line-faint);
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
