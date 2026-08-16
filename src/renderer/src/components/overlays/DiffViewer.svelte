<script lang="ts">
  import { changes } from '$lib/state/changes.svelte'

  // Held apart from the column, deliberately. A column carries
  // `content-visibility: auto`, and with it paint containment, which would
  // slice this off at the column's own edge — the failure the block menu was
  // fixed for twice.
  const files = $derived(changes.shown)
  const file = $derived(changes.file)
</script>

<div class="sheet" role="dialog" aria-label="changes">
  <div class="pane files" class:focused={changes.pane === 'files'}>
    <div class="head">
      {#if changes.filtering}
        <span class="prompt">/</span><span class="query">{changes.filter}</span><span class="caret"
        ></span>
      {:else}
        <span class="title">changed</span>
        <span class="count">{files.length}</span>
      {/if}
    </div>

    <div class="list">
      {#each files as entry, i (entry.path)}
        <div class="file" class:on={i === changes.at}>
          <span class="path">{entry.path}</span>
          <span class="stat">
            {#if !entry.existed}<span class="new">new</span>{/if}
            <span class="add">+{entry.added}</span>
            {#if entry.removed > 0}<span class="del">−{entry.removed}</span>{/if}
          </span>
        </div>
      {/each}
    </div>
  </div>

  <div class="pane diff" class:focused={changes.pane === 'diff'}>
    {#if changes.loading}
      <div class="empty">reading the changes…</div>
    {:else if !file}
      <!-- One sentence, not an empty window: a reader who opened this on a
           thread that changed nothing should be told so, not left hunting. -->
      <div class="empty" class:bad={changes.error !== null}>
        {#if changes.error !== null}
          could not read the changes · {changes.error}
        {:else if changes.files.length === 0}
          this thread has not changed any files
        {:else}
          no file matches
        {/if}
      </div>
    {:else}
      <div class="head">
        <span class="path">{file.path}</span>
        <span class="stat"><span class="add">+{file.added}</span>
          {#if file.removed > 0}<span class="del">−{file.removed}</span>{/if}</span>
      </div>
      <div class="body">
        {#each file.lines as line, i (i)}
          {#if line.sign === '@'}
            <div class="dline skip" class:on={i === changes.line && changes.pane === 'diff'}>
              {line.text}
            </div>
          {:else}
            <div
              class="dline"
              class:on={i === changes.line && changes.pane === 'diff'}
              class:add={line.sign === '+'}
              class:del={line.sign === '-'}
            ><span class="num">{line.line ?? ''}</span>{line.sign} {line.text}</div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .sheet {
    position: fixed;
    inset: 48px 40px 56px;
    z-index: 60;
    display: grid;
    grid-template-columns: minmax(200px, 300px) 1fr;
    background: var(--bg-float);
    border: 1px solid var(--line);
    box-shadow: 0 24px 64px rgb(0 0 0 / 55%);
    overflow: hidden;
  }

  .pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }
  .files {
    border-right: 1px solid var(--line);
  }
  /* Which pane has the keys, said quietly. A border rather than a glow: the
     reader is reading code, and the surface should not compete with it. */
  .pane.focused .head {
    color: var(--accent);
    border-bottom-color: var(--accent-soft);
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 9px 12px;
    border-bottom: 1px solid var(--line);
    font-family: var(--font-chrome);
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--fg-dimmest);
    flex: none;
  }
  .head .path {
    font-family: var(--font-body);
    font-size: 11.5px;
    letter-spacing: 0;
    color: var(--fg-bright);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .head .stat {
    margin-left: auto;
    display: flex;
    gap: 6px;
    font-family: var(--font-body);
    font-size: 11px;
  }
  .count {
    margin-left: auto;
  }
  .prompt {
    color: var(--accent);
  }
  .query {
    font-family: var(--font-body);
    font-size: 11.5px;
    letter-spacing: 0;
    color: var(--fg-bright);
  }
  .caret {
    width: 6px;
    height: 12px;
    background: var(--accent);
    animation: blink 1.1s steps(1) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  .list {
    overflow-y: auto;
    scrollbar-color: var(--fg-ghost) transparent;
  }
  .file {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 5px 12px;
    font-family: var(--font-body);
    font-size: 11.5px;
    color: var(--fg-dim);
  }
  .file.on {
    background: var(--bg-hover);
    color: var(--fg-bright);
  }
  .file .path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    /* The tail of a path is what identifies it; the head is shared by half the
       repository. */
    direction: rtl;
    text-align: left;
  }
  .file .stat {
    margin-left: auto;
    display: flex;
    gap: 5px;
    flex: none;
    font-size: 10.5px;
  }
  .add {
    color: var(--ok-text);
  }
  .del {
    color: var(--err-text);
  }
  .new {
    color: var(--fg-dimmest);
  }

  .body {
    overflow: auto;
    padding: 6px 0;
    scrollbar-color: var(--fg-ghost) transparent;
  }
  .dline {
    padding: 1px 12px;
    font-family: var(--font-body);
    font-size: 11.5px;
    line-height: 1.7;
    white-space: pre;
    color: var(--fg-dimmer);
  }
  .dline.add {
    color: var(--ok-text);
    background: var(--ok-soft);
  }
  .dline.del {
    color: var(--err-text);
    background: var(--err-soft);
  }
  /* The line under the cursor. An outline rather than a fill, so the add and
     delete tints underneath it stay readable. */
  .dline.on {
    outline: 1px solid var(--accent);
    outline-offset: -1px;
  }
  .num {
    display: inline-block;
    width: 40px;
    margin-right: 10px;
    text-align: right;
    color: var(--fg-ghost);
    user-select: none;
  }
  .skip {
    color: var(--fg-ghost);
    font-size: 10.5px;
    font-family: var(--font-chrome);
    padding: 5px 12px;
  }

  .empty {
    margin: auto;
    color: var(--fg-dimmest);
    font-family: var(--font-body);
    font-size: 12px;
  }
  .empty.bad {
    color: var(--err-text);
  }
</style>
