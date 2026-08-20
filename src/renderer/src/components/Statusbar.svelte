<script lang="ts">
  import GitSummary from './GitSummary.svelte'
  import Icon from './Icon.svelte'
  import { app } from '$lib/state/app.svelte'
  import { askKeys } from '$lib/state/ask-keys.svelte'
  import { changes } from '$lib/state/changes.svelte'
  import { threads } from '$lib/state/threads.svelte'
  import { threadGit } from '$lib/state/thread-git.svelte'
  import { formatUsage } from '$lib/usage-format'
  import { shell } from '$lib/state/shell.svelte'
  import { permission } from '$lib/state/permission.svelte'
  import { PERMISSION_LABELS } from '../../../shared/permissions'
  import { workspaceLsp } from '$lib/state/workspace-lsp.svelte'
  import { modes } from '$lib/state/modes.svelte'
  import { following } from '$lib/state/following.svelte'

  // pi's own accounting for the focused thread. A thread that has not run a
  // turn has no usage, and the segment stays blank rather than showing zeros
  // that would read as a measurement.
  const model = $derived(threads.get(app.thread.id))
  /** Read by the LSP effect: a server starts during a turn, never at a
   *  moment the reader did something the bar could hang off. */
  const runState = $derived(model.runState)

  // An isolated thread reports its own checkout, not the workspace's: the
  // reader is looking at a column whose branch and whose changes are not the
  // ones the folder behind it has.
  const isolated = $derived(Boolean(app.thread.branch))
  $effect(() => {
    const id = app.threadId
    if (isolated && id) threadGit.refresh(id)
  })
  // A question holding the keys is a mode the reader is in, and it was the one
  // mode the bar did not name: `j` and `k` moved choices rather than blocks and
  // nothing said why. Derived here rather than added to the key reducer, which
  // knows nothing about asks and should not — a card takes the keys by being on
  // screen, not by a keystroke.
  //
  // `owning`, not `holding`: a question can be pending while the caret is in
  // the composer or a viewer is open, and a bar reading `ASK` over a live caret
  // lies about the one thing a reader must be able to trust it for.
  const asking = $derived(askKeys.owning !== null && !changes.open)
  const mode = $derived(asking ? 'ASK' : app.mode)

  // Language servers belong to the workspace, so the chip follows the
  // workspace rather than the thread — and it follows the turn, because a
  // server starts when the agent first asks one a question, which is during a
  // turn and never at a moment the reader did anything. Without the run state
  // in this effect the count was whatever it had been when the workspace was
  // opened, which for a fresh workspace is always "none".
  //
  // `fresh` only when the run state actually moved: that is the moment a
  // server can have started or died. A plain focus move answers from the
  // store's memory, so crossing the strip stops costing a round trip per key.
  let seenRun: string | undefined
  $effect(() => {
    const id = app.workspace.id
    const run = runState
    const fresh = seenRun !== undefined && seenRun !== run
    seenRun = run
    void workspaceLsp.load(id, { fresh })
  })
  // The permission level is never absent from the bar. A level that is
  // invisible is a level that surprises — and `full` is the one state where
  // being reminded is the whole point.
  $effect(() => {
    void permission.load(app.workspace.id, app.threadId)
  })
  const level = $derived(permission.level)
  /** A thread that overrode its workspace says so, because the same word would
   *  otherwise mean two different scopes on two different threads. */
  const ownLevel = $derived(permission.thread !== undefined)

  const lsp = $derived(workspaceLsp.chip)

  // The voice belongs to the thread, so the chip follows the focused column.
  $effect(() => {
    void modes.load(app.threadId)
  })
  const modeChip = $derived(modes.chip)
  /** On, with nothing started. The chip says so quietly rather than counting. */
  const lspIdle = $derived(lsp === 'lsp' || lsp === 'lsp !')

  // Whether this column has stopped following its stream. Named only when it
  // has: a segment that spends its life reading FOLLOWING teaches nothing,
  // and paused is the state that needs a word — the transcript has stopped
  // moving and the pill only appears once something has landed below.
  const paused = $derived(app.thread.id !== '' && !following.of(app.thread.id).following)

  const ctxPercent = $derived(Math.round(model.usage?.contextPercent ?? 0))
  const usage = $derived(formatUsage(model.usage))
</script>

<footer class="statusbar">
  <div class="mode" class:accented={app.accented || asking}>{mode}</div>

  <div class="seg branch">
    {#if isolated}
      <span class="worktree"><Icon name="branch" /></span>
    {/if}
    <GitSummary status={isolated ? threadGit.statusOf(app.thread.id) : app.workspace.git} />
  </div>

  <button
    type="button"
    class="seg perm"
    class:quiet={level === 'auto'}
    class:warn={level === 'full'}
    onclick={() => void permission.cycleThread()}
    title="permission level — click to change it for this thread (␣p)"
  >
    {PERMISSION_LABELS[level]}{ownLevel ? '*' : ''}
  </button>

  {#if modeChip}
    <!-- Absent when no voice is set, on the same rule the lsp chip follows: an
         empty state does not need a word for itself, and a segment that always
         reads "normal" is a permanent reminder of nothing. -->
    <button
      type="button"
      class="seg voice"
      onclick={() => shell.openOverlay('mode')}
      title="the voice this thread writes in — click to change it (␣M)"
    >
      {modeChip}{modes.overridden ? '*' : ''}
    </button>
  {/if}

  {#if lsp}
    <!-- Absent rather than "off": a bar segment that always reads off is a
         permanent reminder of a feature the reader chose not to use. -->
    <button
      type="button"
      class="seg lsp"
      class:idle={lspIdle}
      class:warn={lsp.endsWith('!')}
      onclick={() => shell.openOverlay('workspace')}
      title="language servers — click for workspace settings"
    >
      {lsp}
    </button>
  {/if}

  {#if paused}
    <button
      type="button"
      class="seg paused"
      onclick={() => following.jump(app.thread.id)}
      title="this column is not following its stream — click to jump to the latest (G)"
    >
      PAUSED
    </button>
  {/if}

  <div class="seg right ctx">
    ctx<span class="meter"><span class="fill" style:width="{ctxPercent}%"></span></span>{ctxPercent}%
  </div>

  <!-- Absent until a turn has actually spent something. A field is a band of
       its own now, and an empty one is a lit rectangle saying nothing. -->
  {#if usage}
    <div class="seg tokens">{usage}</div>
  {/if}

  <!-- Only while a question holds the keys. The standing hints — h/l, the
       leader, ⌘K — are the three bindings a reader learns first and then reads
       past forever; a bar that always says them teaches nothing and costs the
       width. This says the one thing they cannot deduce: that `j` and `k` have
       stopped being the transcript's and belong to the card. -->
  {#if asking}
    <div class="seg hints">
      <span><span class="key">j/k</span> choices</span>
      <span><span class="key">l</span> next</span>
      <span><span class="key">esc</span> release</span>
    </div>
  {/if}
</footer>

<style>
  .statusbar {
    height: var(--statusbar-h);
    flex: none;
    display: flex;
    align-items: stretch;
    font-size: 10.5px;
    background: var(--bg-statusbar);
    position: relative;
    z-index: 2;
    user-select: none;
    white-space: nowrap;
  }

  .mode {
    display: flex;
    align-items: center;
    padding: 0 12px;
    letter-spacing: 0.1em;
    background: var(--bg-chip);
    color: var(--fg-muted);
    transition:
      background-color 0.2s,
      color 0.2s;
  }
  .mode.accented {
    background: var(--accent);
    color: var(--bg);
  }

  .perm,
  .voice,
  .paused {
    border: none;
    font: inherit;
    color: var(--fg-dim);
    cursor: pointer;
  }
  .perm.quiet {
    color: var(--fg-dimmest);
  }
  .perm.warn {
    color: var(--warn, var(--accent));
  }
  .paused {
    color: var(--warn, var(--accent));
    letter-spacing: 0.08em;
  }

  .lsp {
    border: none;
    font: inherit;
    color: var(--accent);
    cursor: pointer;
  }
  .lsp.idle {
    color: var(--fg-dimmest);
  }
  .lsp.warn {
    color: var(--warn, var(--fg-bright));
  }

  /* One field from the next by how light it is, the way an NVChad statusline
     reads. There is no rule between any two.
     
     Alternating by position and not by name: the voice, the language servers
     and the paused flag each come and go, so a colour tied to a field put two
     of the same next to each other the moment one of them was absent — which
     is what made the permission level and the language servers read as one
     block. Counting children fixes the order whatever is on the bar. */
  .seg {
    display: flex;
    align-items: center;
    padding: 0 12px;
    color: var(--fg-dim);
  }
  .seg:nth-child(odd) {
    background: var(--seg-strong);
  }
  .seg:nth-child(even) {
    background: var(--seg);
  }

  .worktree {
    color: var(--accent);
    margin-right: 5px;
  }

  .branch {
    gap: 6px;
  }

  .right {
    margin-left: auto;
  }



  .ctx {
    gap: 6px;
  }
  .meter {
    width: 54px;
    height: 4px;
    background: rgba(255, 255, 255, 0.09);
    overflow: hidden;
    display: inline-block;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: background 0.4s;
  }

  .hints {
    gap: 10px;
    color: var(--fg-dimmest);
  }
  .key {
    color: var(--fg-muted);
  }
</style>
