<script lang="ts">
  import Icon from '../../Icon.svelte'
  import type { InlineSegment } from '$lib/thread'

  /** `onattachment` is what makes a file chip a button. Absent — an agent's
   *  message, the demo catalog — the chip still draws, it just does nothing,
   *  which is honest: there is nothing behind it to open. */
  const isPicture = (name: string): boolean => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)

  const {
    parts,
    onattachment,
  }: { parts: InlineSegment[]; onattachment?: (name: string) => void } = $props()
</script>

{#each parts as part, i (i)}{#if part.href}<a
    href={part.href}
    target="_blank"
    rel="noreferrer noopener">{part.text}</a
  >{:else if part.attachment !== undefined}{#if onattachment}<button
      type="button"
      class="mention file"
      onclick={() => onattachment(part.attachment ?? '')}
      ><Icon name={isPicture(part.text) ? 'image' : 'file'} />{part.text}</button
    >{:else}<span class="mention file"
      ><Icon name={isPicture(part.text) ? 'image' : 'file'} />{part.text}</span
    >{/if}{:else if part.mention}<span class="mention">{part.text}</span
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
    background: oklch(0.76 0.14 var(--accent-hue) / 0.18);
  }

  /* A chip drawn as a button keeps the chip's box exactly: a border or a
     padding here would move every glyph after it, which is the one thing the
     composer's mirror rule forbids and the sent message has no reason to
     break either. */
  /* The sent message has no mirror to keep aligned, so this is where the chip
     can afford an icon: the composer's may not occupy space, this one may. */
  .file {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
  }
  button.file {
    font: inherit;
    padding: 0;
    border: none;
    background: oklch(0.76 0.14 var(--accent-hue) / 0.18);
    cursor: pointer;
  }
  button.file:hover {
    background: oklch(0.76 0.14 var(--accent-hue) / 0.2);
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
  /* A link's underline is the link, not a rule between two things — it is
     drawn by the text itself so it follows the glyphs and wraps with them. */
  a {
    color: var(--tone-2);
    text-decoration: underline;
    text-decoration-color: color-mix(in oklch, var(--tone-2) 40%, transparent);
    text-underline-offset: 2px;
  }
  a:hover {
    text-decoration-color: var(--tone-2);
  }
</style>
