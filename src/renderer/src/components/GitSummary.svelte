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
{:else}
  <!-- A folder outside a repository is a state, not an absence. Saying so
       costs one word and stops the field reading as a bar that broke. -->
  <span class="none">no git</span>
{/if}

<style>
  .branch {
    color: inherit;
  }
  .none {
    color: var(--fg-dimmest);
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
