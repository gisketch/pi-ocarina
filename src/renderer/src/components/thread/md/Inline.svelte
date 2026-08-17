<script lang="ts">
  import type { InlineSegment } from '$lib/thread'

  const { parts }: { parts: InlineSegment[] } = $props()
</script>

{#each parts as part, i (i)}{#if part.href}<a
    href={part.href}
    target="_blank"
    rel="noreferrer noopener">{part.text}</a
  >{:else if part.mention}<span class="mention">{part.text}</span
  >{:else if part.code}<code class:b={part.bold}>{part.text}</code
  >{:else}<span
    class:b={part.bold}
    class:i={part.italic}
    class:s={part.strike}>{part.text}</span
  >{/if}{/each}

<style>
  /* Inline code lives here now, so its style does too. Svelte scopes a rule to
     the component that wrote the element, and leaving this behind in Message
     silently un-styled every backticked word in the app. */
  code {
    background: var(--bg-chip);
    padding: 1px 5px;
    font-size: 12px;
    color: var(--fg-body);
    font-family: var(--font-body);
  }
  code.b {
    font-weight: 700;
  }

  /* A file the message referred to. Drawn the way the composer draws it while
     it is being typed, so it reads as the same thing before and after sending
     — the design's chips, flowing with the text. */
  .mention {
    color: var(--accent);
    background: oklch(0.76 0.14 var(--accent-hue) / 0.1);
    outline: 1px solid oklch(0.76 0.14 var(--accent-hue) / 0.32);
  }

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
