<script lang="ts">
  import type { InlineSegment } from '$lib/thread'

  const { parts }: { parts: InlineSegment[] } = $props()
</script>

{#each parts as part, i (i)}{#if part.href}<a
    href={part.href}
    target="_blank"
    rel="noreferrer noopener">{part.text}</a
  >{:else if part.code}<code class:b={part.bold}>{part.text}</code
  >{:else}<span
    class:b={part.bold}
    class:i={part.italic}
    class:s={part.strike}>{part.text}</span
  >{/if}{/each}

<style>
  .b {
    font-weight: 700;
    color: var(--fg-bright);
  }
  .i {
    font-style: italic;
  }
  .s {
    text-decoration: line-through;
    color: var(--fg-dim);
  }

  /* Links open outside the app. The window itself never navigates — main
     refuses that — so this is the only place a URL can go. */
  a {
    color: var(--tone-2);
    text-decoration: none;
    border-bottom: 1px solid color-mix(in oklch, var(--tone-2) 40%, transparent);
  }
  a:hover {
    border-bottom-color: var(--tone-2);
  }
</style>
