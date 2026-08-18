<script lang="ts">
  import type { ThreadId } from '../../../../shared/thread-id'
  import ThreadView from '../thread/ThreadView.svelte'
  import ThreadError from '../thread/ThreadError.svelte'
  import ThreadSkeleton from '../thread/ThreadSkeleton.svelte'
  import { catalog } from '$lib/state/catalog.svelte'
  import { threads } from '$lib/state/threads.svelte'

  const { threadId }: { threadId: ThreadId } = $props()

  const model = $derived(threads.get(threadId))
  const loading = $derived(!threads.isLoaded(threadId))
  const failure = $derived(
    model.runState === 'failed' || model.runState === 'interrupted' ? model.runState : null,
  )
  const wired = $derived(catalog.source === 'live')
</script>

{#if loading}
  <ThreadSkeleton />
{:else}
  <ThreadView {threadId} blocks={model.blocks} />

  {#if threads.errorFor(threadId)}
    <ThreadError state="failed" reason={threads.errorFor(threadId) ?? undefined} />
  {:else if failure}
    <ThreadError
      state={failure}
      reason={model.reason}
      onretry={wired ? () => threads.retry(threadId) : undefined}
    />
  {/if}
{/if}
