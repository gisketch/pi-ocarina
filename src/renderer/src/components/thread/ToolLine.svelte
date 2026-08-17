<script lang="ts">
  import { labelTone } from '$lib/ledger'
  import { labelFor } from '$lib/tool-label'
  import type { ToolRow } from '$lib/thread'

  /** One tool call, as a line: what ran, what it acted on, and how it went.
   *
   *  Split from `Ledger.svelte`, which is the spine, the nesting and the focus
   *  registry. This is the grammar of a single row — `{kind} {target} {meta}` —
   *  and the tones it is drawn in. A child agent's row is a *different* grammar
   *  and has its own component. */
  const { row }: { row: ToolRow } = $props()
</script>

<span class="kind {labelTone(row)}">{labelFor(row.kind, row.status)}</span>
<span class="target" class:struck={row.status === 'cancelled'}>{row.target}</span>

<style>
  .kind {
    font-family: var(--font-chrome);
    font-size: 10px;
    /* The reference's 36px is the floor, not the width: a row now says what is
       happening to it, and `editing` does not fit in four characters. */
    width: max(36px, var(--gutter, 4ch));
    flex: none;
  }
  .kind.accent {
    color: var(--accent);
  }
  .kind.err {
    color: var(--err);
  }
  .kind.warn {
    color: var(--warn);
  }
  .kind.muted {
    color: var(--fg-dim);
  }
  .target {
    color: var(--fg);
    overflow-wrap: anywhere;
  }
  .target.struck {
    text-decoration: line-through;
    color: var(--fg-dim);
  }
</style>
