<script lang="ts">
  import { onMount } from 'svelte'
  import PaneGroup from './PaneGroup.svelte'
  import { app } from '$lib/state/app.svelte'
  import { blockNav } from '$lib/state/block-nav.svelte'
  import { COLUMN_GAP, paneGroupWidth, stripGroupOffset } from '$lib/strip'

  /** The two overlays a composer's `/` commands open. They belong to the app
   *  shell, so they are handed down rather than reached for. */
  const { onmodel, oncommit }: { onmodel: () => void; oncommit: () => void } = $props()

  const workspace = $derived(app.workspace)
  const hosts = $derived(workspace.threads.filter((thread) => !thread.terminal))
  const focusedHostId = $derived(app.thread.attachment?.hostId ?? app.thread.id)
  const focusedGroup = $derived(Math.max(0, hosts.findIndex((host) => host.id === focusedHostId)))
  let viewport = $state<HTMLDivElement | null>(null)
  let viewportWidth = $state(0)

  function attachmentOf(hostId: string) {
    return workspace.threads.find(
      (thread) => thread.terminal && thread.attachment?.hostId === hostId,
    )
  }

  const groupWidths = $derived(
    hosts.map((host) => paneGroupWidth(attachmentOf(host.id) !== undefined, viewportWidth)),
  )
  // The strip is pinned at left:50% and slid so the focused column sits centred;
  // one composited transform moves the whole rail of columns.
  const offset = $derived(stripGroupOffset(groupWidths, focusedGroup))

  onMount(() => {
    if (!viewport) return
    const measure = () => { viewportWidth = viewport?.clientWidth ?? 0 }
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    measure()
    return () => observer.disconnect()
  })

  /** A click changes the focused column without a keystroke, and READ belongs
   *  to one column's transcript. Reconciling here keeps the mode chip honest
   *  about what the keys will do. */
  function focusColumn(id: string): void {
    const index = workspace.threads.findIndex((thread) => thread.id === id)
    if (index === -1) return
    app.focusThread(index)
    blockNav.reconcileMode()
  }
</script>

<div class="viewport" bind:this={viewport}>
  {#key workspace.id}
    <div class="strip" style:transform="translateX({offset}px)" style:gap="{COLUMN_GAP}px">
      {#each hosts as host (host.id)}
        {@const attachment = attachmentOf(host.id)}
        <PaneGroup
          {workspace}
          {host}
          {attachment}
          focusedId={app.thread.id}
          {viewportWidth}
          onfocus={focusColumn}
          {onmodel}
          {oncommit}
        />
      {/each}
    </div>
  {/key}
</div>

<style>
  .viewport {
    flex: 1;
    overflow: hidden;
    position: relative;
    min-width: 0;
  }

  .strip {
    position: absolute;
    left: 50%;
    top: 18px;
    /* No gap under the columns: the composer sits against them, so a message
       is typed at the foot of the transcript it belongs to rather than across
       a band of empty chrome. */
    bottom: 0;
    display: flex;
    transition: transform var(--dur-strip) var(--ease-strip);
    will-change: transform;
  }

</style>
