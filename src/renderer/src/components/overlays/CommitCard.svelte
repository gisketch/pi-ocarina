<script lang="ts">
  import { app } from '$lib/state/app.svelte'
  import { commit } from '$lib/state/commit.svelte'
  import { branchLabel } from '$lib/git-format'

  let input = $state<HTMLInputElement | null>(null)

  const branch = $derived(branchLabel(app.workspace.git))
  const nothing = $derived(!commit.loading && commit.changes.length === 0)

  // Focused the moment editing starts: the key that opened the field and the
  // caret arriving are one action to the person pressing it.
  $effect(() => {
    if (commit.editing) input?.focus()
  })

  const MARK = { M: 'M', A: 'A', D: 'D' } as const
</script>

<div class="scrim">
  <div class="card" role="dialog" aria-label="Commit changes">
    <div class="header">
      <span class="what">⎇ COMMIT</span>
      {#if commit.editing}
        <input
          bind:this={input}
          class="message editing"
          value={commit.message}
          oninput={(event) => (commit.message = event.currentTarget.value)}
          aria-label="Commit message"
        />
      {:else}
        <span class="message">{commit.message || 'no message yet'}</span>
      {/if}
      <span class="branch"> {branch}</span>
    </div>

    <div class="files">
      {#if commit.loading}
        <div class="quiet">reading changes…</div>
      {:else if nothing}
        <div class="quiet">nothing to commit — the working tree is clean</div>
      {:else}
        {#each commit.changes as change (change.path)}
          <div class="file">
            <span class="letter {change.status}">{MARK[change.status]}</span>
            <span class="path">{change.path}</span>
            <span class="counts">
              {#if change.added === null}
                <span class="binary">binary</span>
              {:else}
                {#if change.added > 0}<span class="added">+{change.added}</span>{/if}
                {#if change.removed}<span class="removed">−{change.removed}</span>{/if}
              {/if}
            </span>
          </div>
        {/each}
      {/if}
    </div>

    {#if commit.error}
      <div class="failed">{commit.error}</div>
    {/if}

    <div class="keys">
      {#if commit.editing}
        <span><span class="key">⏎</span> done</span>
      {:else}
        <span><span class="key">c</span> commit</span>
        <span><span class="key">p</span> commit + push</span>
        <span><span class="key">e</span> edit message</span>
      {/if}
      <span><span class="key">esc</span> cancel</span>
      {#if commit.running}<span class="running">running git…</span>{/if}
    </div>
  </div>
</div>

<style>
  .scrim {
    position: absolute;
    inset: 0;
    z-index: 65;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
  }

  .card {
    width: 560px;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--line-strong);
    background: var(--bg-panel);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .header {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 12px;
    border-bottom: 1px solid var(--line);
  }
  .what {
    font-family: var(--font-chrome);
    font-size: 10px;
    color: var(--accent);
    flex: none;
  }
  .message {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    color: var(--fg-body);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .message.editing {
    border: none;
    border-bottom: 1px solid var(--accent);
    background: none;
    font-family: inherit;
    padding: 0 0 2px;
    outline: none;
  }
  .branch {
    flex: none;
    font-family: var(--font-chrome);
    font-size: 10px;
    color: var(--fg-dimmest);
    white-space: nowrap;
  }

  .files {
    padding: 9px 12px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 11.5px;
    overflow-y: auto;
  }
  .file {
    display: flex;
    gap: 10px;
    color: var(--fg-dim);
  }
  .letter {
    width: 12px;
    flex: none;
  }
  .letter.M {
    color: var(--ok);
  }
  .letter.A {
    color: var(--accent);
  }
  .letter.D {
    color: var(--err);
  }
  .path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .counts {
    margin-left: auto;
    flex: none;
    font-size: 10.5px;
    display: flex;
    gap: 6px;
  }
  .added {
    color: var(--ok);
  }
  .removed {
    color: var(--err);
  }
  .binary,
  .quiet {
    color: var(--fg-dimmest);
  }

  .failed {
    padding: 0 12px 9px;
    font-size: 11px;
    color: var(--err-text);
  }

  .keys {
    display: flex;
    gap: 14px;
    padding: 9px 12px;
    border-top: 1px solid var(--line);
    font-family: var(--font-chrome);
    font-size: 10px;
    color: var(--fg-dimmest);
  }
  .key {
    color: var(--fg-muted);
    border: 1px solid var(--line-strong);
    padding: 1px 5px;
  }
  .running {
    margin-left: auto;
    color: var(--warn);
  }
</style>
