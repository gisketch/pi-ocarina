<script lang="ts">
  import Chip from '../../Chip.svelte'
  import { fileIcon } from '$lib/icons'
  import type { InlineSegment } from '$lib/thread'

  /** `onattachment` is what makes a file chip a button. Absent — an agent's
   *  message, the demo catalog — the chip still draws, it just does nothing,
   *  which is honest: there is nothing behind it to open. */

  const {
    parts,
    onattachment,
  }: { parts: InlineSegment[]; onattachment?: (name: string) => void } = $props()
</script>

{#each parts as part, i (i)}{#if part.href}<a
    href={part.href}
    target="_blank"
    rel="noreferrer noopener">{part.text}</a
  >{:else if part.attachment !== undefined}<Chip
    icon={fileIcon(part.text)}
    label={part.text}
    onclick={onattachment && (() => onattachment(part.attachment ?? ''))}
  />{:else if part.skill}<Chip
    icon="tool-skill"
    label={part.text}
    tone="warn"
  />{:else if part.mention}<span class="mention">{part.text}</span
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

  /* A path the message referred to without attaching it. Tinted like a file
     chip but not built as one: there is no file behind it to open, and no
     icon to promise one. */
  .mention {
    color: var(--accent);
    background: oklch(0.76 0.14 var(--accent-hue) / 0.18);
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
