<script lang="ts">
  import { sweep } from '$lib/state/sweep.svelte'
  import Icon from '../Icon.svelte'

  // Keys are answered by the shell's modal gate; this draws the list and
  // nothing else.
  const entries = $derived(sweep.entries)
</script>

{#if sweep.open}
  <div class="scrim">
    <div class="sheet" role="dialog" aria-label="worktrees">
      <div class="head">
        <span class="title">WORKTREES</span>
        <span class="count">{entries.length}</span>
      </div>

      <div class="list">
        {#if sweep.loading}
          <div class="quiet">reading the worktrees…</div>
        {:else if sweep.error !== null}
          <div class="quiet bad">could not read them · {sweep.error}</div>
        {:else if entries.length === 0}
          <div class="quiet">this workspace has no worktrees</div>
        {:else}
          {#each entries as entry, i (entry.path)}
            <div class="row" class:on={i === sweep.at}>
              <span class="branch"><Icon name="branch" /> {entry.branch}</span>
              <span class="state">
                {#if entry.live}<span class="live">thread open</span>{/if}
                {#if entry.commits > 0}<span class="held">{entry.commits} commits</span>{/if}
                {#if entry.dirty > 0}<span class="dirty">{entry.dirty} uncommitted</span>{/if}
                {#if !entry.live && entry.commits === 0 && entry.dirty === 0}
                  <span class="spent">clean</span>
                {/if}
              </span>
            </div>
          {/each}
        {/if}
      </div>

      <div class="keys">
        <span><span class="key">j/k</span> move</span>
        <span><span class="key">x</span> remove</span>
        <span><span class="key">esc</span> close</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 65;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
  }

  .sheet {
    width: 520px;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--line-strong);
    background: var(--bg-panel);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line);
    font-family: var(--font-chrome);
    font-size: 10px;
    letter-spacing: 0.12em;
    color: var(--accent);
  }
  .count {
    margin-left: auto;
    color: var(--fg-dimmest);
  }

  .list {
    overflow-y: auto;
    padding: 6px 0;
    scrollbar-color: var(--fg-ghost) transparent;
  }

  .row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 6px 16px;
    font-size: 11.5px;
    color: var(--fg-dim);
  }
  .row.on {
    background: var(--bg-hover);
    color: var(--fg-bright);
  }
  .branch {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .state {
    margin-left: auto;
    display: flex;
    gap: 8px;
    flex: none;
    font-family: var(--font-chrome);
    font-size: 9.5px;
    letter-spacing: 0.08em;
  }
  /* The three reasons a worktree stays, and the one state that means it can
     go. Colour carries the same order as the close rules. */
  .live {
    color: var(--accent);
  }
  .held {
    color: var(--ok-text);
  }
  .dirty {
    color: var(--warn, var(--err-text));
  }
  .spent {
    color: var(--fg-dimmest);
  }

  .quiet {
    padding: 14px 16px;
    font-size: 11.5px;
    color: var(--fg-dimmest);
  }
  .quiet.bad {
    color: var(--err-text);
  }

  .keys {
    display: flex;
    gap: 14px;
    padding: 10px 16px;
    border-top: 1px solid var(--line);
    font-size: 10.5px;
    color: var(--fg-dimmest);
  }
  .key {
    font-family: var(--font-chrome);
    font-size: 9.5px;
    letter-spacing: 0.1em;
    color: var(--fg-dim);
  }
</style>
