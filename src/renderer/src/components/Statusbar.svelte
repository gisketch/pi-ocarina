<script lang="ts">
  import GitSummary from './GitSummary.svelte'
  import { app } from '$lib/state/app.svelte'
  import { askKeys } from '$lib/state/ask-keys.svelte'
  import { changes } from '$lib/state/changes.svelte'
  import { threads } from '$lib/state/threads.svelte'
  import { threadGit } from '$lib/state/thread-git.svelte'
  import { formatUsage } from '$lib/usage-format'
  import { shell } from '$lib/state/shell.svelte'
  import { workspaceLsp } from '$lib/state/workspace-lsp.svelte'

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
    if (isolated) threadGit.refresh(app.thread.id)
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
  $effect(() => {
    void app.workspace.id
    void runState
    void workspaceLsp.load(app.workspace.id)
  })
  const lsp = $derived(workspaceLsp.chip)
  /** On, with nothing started. The chip says so quietly rather than counting. */
  const lspIdle = $derived(lsp === 'lsp' || lsp === 'lsp !')

  const ctxPercent = $derived(Math.round(model.usage?.contextPercent ?? 0))
  const usage = $derived(formatUsage(model.usage))
</script>

<footer class="statusbar">
  <div class="mode" class:accented={app.accented || asking}>{mode}</div>

  <div class="seg workspace">
    <span class="note">♪ {app.workspace.note}</span>{app.workspace.name}
  </div>

  <div class="seg branch">
    {#if isolated}
      <span class="worktree">⑂</span>
    {/if}
    <GitSummary status={isolated ? threadGit.statusOf(app.thread.id) : app.workspace.git} />
  </div>

  <div class="seg">thread {app.threadLabel}</div>

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

  <div class="seg right ctx">
    ctx<span class="meter"><span class="fill" style:width="{ctxPercent}%"></span></span>{ctxPercent}%
  </div>

  <div class="seg left-line">{usage}</div>

  <!-- The hints say what the keys do *now*. While a question holds them, `h`
       and `l` are the question's, and saying "threads" would be a lie. -->
  <div class="seg left-line hints">
    {#if asking}
      <span><span class="key">j/k</span> choices</span>
      <span><span class="key">l</span> next</span>
      <span><span class="key">esc</span> release</span>
    {:else}
      <span><span class="key">h/l</span> threads</span>
      <span><span class="key">␣</span> leader</span>
      <span><span class="key">⌘K</span> commands</span>
    {/if}
  </div>
</footer>

<style>
  .statusbar {
    height: var(--statusbar-h);
    flex: none;
    display: flex;
    align-items: stretch;
    font-size: 10.5px;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    background: var(--bg-raise-2);
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

  .lsp {
    border: none;
    background: none;
    font: inherit;
    color: var(--accent);
    cursor: pointer;
    padding: 0;
  }
  .lsp.idle {
    color: var(--fg-dimmest);
  }
  .lsp.warn {
    color: var(--warn, var(--fg-bright));
  }

  .seg {
    display: flex;
    align-items: center;
    padding: 0 12px;
    border-right: 1px solid rgba(255, 255, 255, 0.04);
    color: var(--fg-dim);
  }

  .worktree {
    color: var(--accent);
    margin-right: 5px;
  }

  .workspace {
    gap: 7px;
    color: var(--fg-agent);
  }
  .note {
    color: var(--accent);
    flex: none;
  }

  .branch {
    gap: 6px;
  }

  .right {
    margin-left: auto;
  }

  .right,
  .left-line {
    border-right: none;
    border-left: 1px solid rgba(255, 255, 255, 0.04);
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
