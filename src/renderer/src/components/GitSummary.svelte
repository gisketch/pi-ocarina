<script lang="ts">
  import type { GitStatus } from '../../../shared/protocol'
  import { branchLabel, summarize } from '$lib/git-format'

  // One place decides what a repository looks like, so the status bar and the
  // switcher card can never disagree about the same folder.
  const { status }: { status: GitStatus | null } = $props()

  const branch = $derived(branchLabel(status))
  const segments = $derived(summarize(status))
</script>

{#if status}
  <span class="branch"> {branch}</span>
  {#each segments as segment (segment.text)}
    <span class="seg {segment.tone}">{segment.text}</span>
  {/each}
{/if}

<style>
  .branch {
    color: inherit;
  }
  .seg {
    margin-left: 6px;
  }
  .ok {
    color: var(--ok);
  }
  .warn {
    color: var(--warn);
  }
  .bad {
    color: var(--err);
  }
</style>
