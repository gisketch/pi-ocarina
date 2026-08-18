<script lang="ts">
  /** What the project imposed, as opposed to what the reader chose.
   *
   *  A separate component because it is a separate category. The rows above it
   *  are settings — press a key, something changes. Everything here is a fact
   *  about files on disk, and the only thing a reader can do to it is read it.
   *  Drawing them the same way would invite a press that does nothing.
   *
   *  Names, descriptions and file contents all come off disk, which is
   *  untrusted text. Svelte escapes them; nothing here uses `{@html}`. */
  import Icon from '../Icon.svelte'
  import { countOf } from '../../../../shared/project-surface'
  import { projectSurface } from '$lib/state/project-surface.svelte'
  import { reloadEverything } from '$lib/state/reload'

  const surface = $derived(projectSurface.surface)

  /** How many rows a group shows before it asks. Enough that a project with a
   *  handful of skills is simply listed, and few enough that a machine with
   *  forty global ones does not bury the settings above it. */
  const CAP = 6

  /** Which groups the reader has opened. A screen this long is read for one
   *  thing at a time, so opening one does not open the others. */
  let shown = $state<Record<string, boolean>>({})
  const capped = <T,>(key: string, all: T[]): T[] =>
    shown[key] || all.length <= CAP ? all : all.slice(0, CAP)
</script>

{#snippet more(key: string, total: number)}
  {#if total > CAP}
    <button type="button" class="more" onclick={() => (shown[key] = !shown[key])}>
      {shown[key] ? 'show fewer' : `${total - CAP} more`}
    </button>
  {/if}
{/snippet}

<div class="imposed">
  <div class="banner">
    LOADED HERE
    <span class="note">read only — these come from files</span>
    <button type="button" class="reload" onclick={() => void reloadEverything()}>
      {projectSurface.loading ? 'reading…' : 're-read (/reload)'}
    </button>
  </div>

  {#if projectSurface.error}
    <div class="empty">could not read this workspace — {projectSurface.error}</div>
  {:else if projectSurface.loading && projectSurface.empty}
    <div class="empty">looking…</div>
  {:else if projectSurface.empty}
    <div class="empty">this project defines no commands, skills or instructions</div>
  {/if}

  {#if surface.skills.length > 0}
    <div class="group">{countOf('skill', surface.skills.length)}</div>
    {#each capped('skills', surface.skills) as skill, i (`${skill.path}-${i}`)}
      <div class="item">
        <span class="icon"><Icon name="tool-skill" /></span>
        <span class="name">{skill.name}</span>
        <span class="desc">{skill.description}</span>
        <span class="meta">
          {#if skill.explicitOnly}<span class="tag">explicit</span>{/if}
          <span class="from">{skill.source}</span>
        </span>
      </div>
    {/each}
    {@render more('skills', surface.skills.length)}
  {/if}

  {#if surface.commands.length > 0}
    <div class="group">{countOf('command', surface.commands.length)}</div>
    {#each capped('commands', surface.commands) as command, i (`${command.path}-${i}`)}
      <div class="item">
        <span class="icon"><Icon name="tool-todo" /></span>
        <span class="name">/{command.name}</span>
        <span class="desc">{command.description}</span>
        <span class="meta"><span class="from">{command.source}</span></span>
      </div>
    {/each}
    {@render more('commands', surface.commands.length)}
  {/if}

  {#if surface.instructionFiles.length > 0}
    <div class="group">{countOf('file', surface.instructionFiles.length)} the agent was told to read</div>
    {#each surface.instructionFiles as file, i (`${file.path}-${i}`)}
      <button type="button" class="item open" onclick={() => projectSurface.toggle(file.path)}>
        <span class="icon"><Icon name="tool-read" /></span>
        <span class="name">{file.path}</span>
        <span class="desc">{projectSurface.reading === file.path ? 'hide' : 'read'}</span>
      </button>
      {#if projectSurface.reading === file.path}
        <pre class="content">{projectSurface.open}</pre>
      {/if}
    {/each}
  {/if}

  {#if surface.systemPromptSource}
    <div class="group">system prompt</div>
    <div class="item"><span class="name">{surface.systemPromptSource}</span></div>
  {/if}

  {#if surface.problems.length > 0}
    <div class="group bad">{countOf('problem', surface.problems.length)}</div>
    {#each surface.problems as problem, i (`${problem.path}-${i}`)}
      <div class="item">
        <span class="icon bad"><Icon name="error" /></span>
        <span class="name">{problem.path}</span>
        <span class="desc">{problem.message}</span>
      </div>
    {/each}
  {/if}
</div>

<style>
  .imposed {
    margin-top: 14px;
    background: var(--bg-raise-3);
    padding: 10px;
  }

  .banner {
    display: flex;
    gap: 10px;
    align-items: baseline;
    font-size: 10px;
    letter-spacing: 0.14em;
    color: var(--fg-dim);
    padding: 0 2px 6px;
  }

  .reload {
    margin-left: auto;
    background: none;
    border: 0;
    padding: 0 2px;
    font: inherit;
    letter-spacing: 0;
    text-transform: none;
    color: var(--fg-dim);
    cursor: pointer;
  }

  .reload:hover {
    color: var(--fg);
  }

  .note {
    letter-spacing: 0;
    text-transform: none;
    opacity: 0.7;
  }

  .group {
    font-size: 10px;
    letter-spacing: 0.14em;
    color: var(--fg-dimmest);
    padding: 14px 8px 5px;
    margin-bottom: 3px;
  }

  .group.bad {
    color: var(--err);
  }

  /* A grid, not a row of flexed spans. Forty skills in a monospace font is a
     wall unless the eye has columns to run down: the name starts in the same
     place on every line, and so does where it stops. */
  .item {
    display: grid;
    grid-template-columns: 13px minmax(0, max-content) minmax(0, 1fr) auto;
    gap: 0 10px;
    align-items: baseline;
    width: 100%;
    padding: 3px 2px;
    font-size: 12px;
    line-height: 1.45;
    text-align: left;
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
  }

  .item:hover {
    background: var(--bg-hover);
  }

  .item.open {
    cursor: pointer;
  }

  .icon {
    display: inline-flex;
    width: 13px;
    color: var(--fg-dim);
  }

  .icon.bad {
    color: var(--err);
  }

  /* The name is what a reader scans for, so it is the only thing at full
     strength. Everything beside it recedes by a step. */
  .name {
    color: var(--fg-bright);
    white-space: nowrap;
  }

  .desc {
    color: var(--fg-dimmer);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* One cell, so `explicit` never pushes the source out of its column — the
     word a reader is checking down the list is where they left it. */
  .meta {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    white-space: nowrap;
  }

  .tag {
    color: var(--warn);
    font-size: 10px;
    letter-spacing: 0.08em;
  }

  .from {
    color: var(--fg-faint);
    font-size: 10px;
    letter-spacing: 0.08em;
    min-width: 46px;
    text-align: right;
  }

  .content {
    margin: 2px 0 8px 21px;
    padding: 8px 10px;
    max-height: 220px;
    overflow: auto;
    font-size: 11px;
    line-height: 1.5;
    color: var(--fg-dim);
    background: var(--bg-chip);
    border-radius: 4px;
    white-space: pre-wrap;
  }

  .more {
    display: block;
    width: 100%;
    padding: 5px 2px 5px 25px;
    font: inherit;
    font-size: 11px;
    text-align: left;
    background: none;
    border: 0;
    color: var(--fg-dimmest);
    cursor: pointer;
  }
  .more:hover {
    color: var(--fg-body);
  }

  .empty {
    padding: 8px 2px;
    font-size: 12px;
    color: var(--fg-dim);
  }
</style>
