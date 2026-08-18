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
</script>

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
    {#each surface.skills as skill, i (`${skill.path}-${i}`)}
      <div class="item">
        <span class="icon"><Icon name="tool-skill" /></span>
        <span class="name">{skill.name}</span>
        <span class="desc">{skill.description}</span>
        {#if skill.explicitOnly}<span class="tag">explicit only</span>{/if}
        <span class="from">{skill.source}</span>
      </div>
    {/each}
  {/if}

  {#if surface.commands.length > 0}
    <div class="group">{countOf('command', surface.commands.length)}</div>
    {#each surface.commands as command, i (`${command.path}-${i}`)}
      <div class="item">
        <span class="icon"><Icon name="tool-todo" /></span>
        <span class="name">/{command.name}</span>
        <span class="desc">{command.description}</span>
        <span class="from">{command.source}</span>
      </div>
    {/each}
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
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }

  .banner {
    display: flex;
    gap: 10px;
    align-items: baseline;
    font-size: 10px;
    letter-spacing: 0.14em;
    color: var(--dim);
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
    color: var(--dim);
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
    font-size: 11px;
    color: var(--dim);
    padding: 8px 2px 4px;
  }

  .group.bad {
    color: var(--bad);
  }

  .item {
    display: flex;
    gap: 8px;
    align-items: baseline;
    width: 100%;
    padding: 4px 2px;
    font-size: 12px;
    text-align: left;
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
  }

  .item.open {
    cursor: pointer;
  }

  .icon {
    display: inline-flex;
    width: 13px;
    color: var(--dim);
  }

  .icon.bad {
    color: var(--bad);
  }

  .name {
    color: var(--fg);
    white-space: nowrap;
  }

  .desc {
    color: var(--dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .tag,
  .from {
    color: var(--dim);
    font-size: 10px;
    letter-spacing: 0.08em;
  }

  .content {
    margin: 2px 0 8px 21px;
    padding: 8px 10px;
    max-height: 220px;
    overflow: auto;
    font-size: 11px;
    line-height: 1.5;
    color: var(--dim);
    background: var(--bg-chip);
    border-radius: 4px;
    white-space: pre-wrap;
  }

  .empty {
    padding: 8px 2px;
    font-size: 12px;
    color: var(--dim);
  }
</style>
