<script lang="ts">
  import { onMount } from 'svelte'
  import PaneGroup from './PaneGroup.svelte'
  import { app } from '$lib/state/app.svelte'
  import { blockNav } from '$lib/state/block-nav.svelte'
  import { columnBody } from '$lib/state/columns'
  import { following } from '$lib/state/following.svelte'
  import { clampThread, COLUMN_GAP, paneGroupWidth, stripGroupOffset } from '$lib/strip'
  import type { Thread, Workspace } from '$lib/types'

  /** The two overlays a composer's `/` commands open. They belong to the app
   *  shell, so they are handed down rather than reached for. */
  const { onmodel, oncommit }: { onmodel: () => void; oncommit: () => void } = $props()

  /** How many workspaces keep their strips alive at once.
   *
   *  Switching used to rebuild the world: every transcript's DOM, every
   *  xterm's WebGL context and glyph atlas, a megabyte of markdown — torn
   *  down and re-made per switch. A visited workspace now keeps its strip
   *  mounted and hidden, so a switch is show-and-hide.
   *
   *  Bounded because keeping is not free: each shell holds thousands of
   *  scrollback lines, and browsers cap live WebGL contexts — an unbounded
   *  keep-alive would trade a lag for a crash. The least recently visited
   *  strip past the cap unmounts and pays today's mount cost on return. */
  const KEEP = 4

  let visited = $state<string[]>([])
  $effect(() => {
    const current = app.workspace.id
    if (current === '' || visited[0] === current) return
    visited = [current, ...visited.filter((id) => id !== current)].slice(0, KEEP)
  })

  const mounted = $derived(
    app.workspaces
      .map((workspace, index) => ({ workspace, index }))
      .filter(({ workspace }) => visited.includes(workspace.id)),
  )

  let viewport = $state<HTMLDivElement | null>(null)
  let viewportWidth = $state(0)

  function hostsOf(workspace: Workspace): Thread[] {
    return workspace.threads.filter((thread) => !thread.terminal)
  }

  function attachmentOf(workspace: Workspace, hostId: string): Thread | undefined {
    return workspace.threads.find(
      (thread) => thread.terminal && thread.attachment?.hostId === hostId,
    )
  }

  /** The focused thread a workspace remembers, from the shell's own `focus`
   *  array — asked per strip because every mounted strip centres on its own
   *  remembered column, not on the active workspace's. */
  function focusedIdOf(workspace: Workspace, index: number): string {
    const at = clampThread(app.focus[index] ?? 0, workspace.threads.length)
    return workspace.threads[at]?.id ?? ''
  }

  // The strip is pinned at left:50% and slid so the focused column sits centred;
  // one composited transform moves the whole rail of columns. Each workspace
  // owns its transform, so a switch changes which strip is shown and never
  // animates one strip across another's distance.
  function offsetOf(workspace: Workspace, index: number): number {
    const hosts = hostsOf(workspace)
    const focusedId = focusedIdOf(workspace, index)
    const focused = workspace.threads.find((thread) => thread.id === focusedId)
    const focusedHostId = focused?.attachment?.hostId ?? focusedId
    const group = Math.max(0, hosts.findIndex((candidate) => candidate.id === focusedHostId))
    const widths = hosts.map((candidate) =>
      paneGroupWidth(attachmentOf(workspace, candidate.id) !== undefined, viewportWidth),
    )
    return stripGroupOffset(widths, group)
  }

  onMount(() => {
    if (!viewport) return
    const measure = () => { viewportWidth = viewport?.clientWidth ?? 0 }
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    measure()
    return () => observer.disconnect()
  })

  // A followed column that streamed while its strip was hidden has a bottom
  // it never scrolled to — the pin declines to measure what is not laid out.
  // Shown again, each followed column is put back at its live end before the
  // reader can see it anywhere else.
  $effect(() => {
    const workspace = app.workspace
    requestAnimationFrame(() => {
      for (const thread of workspace.threads) {
        if (!following.of(thread.id).following) continue
        const body = columnBody(thread.id)
        if (body) body.scrollTop = body.scrollHeight
      }
    })
  })

  /** A click changes the focused column without a keystroke, and READ belongs
   *  to one column's transcript. Reconciling here keeps the mode chip honest
   *  about what the keys will do. */
  function focusColumn(id: string): void {
    const index = app.workspace.threads.findIndex((thread) => thread.id === id)
    if (index === -1) return
    app.focusThread(index)
    blockNav.reconcileMode()
  }
</script>

<div class="viewport" bind:this={viewport}>
  {#each mounted as strip (strip.workspace.id)}
    {@const active = strip.workspace.id === app.workspace.id}
    <div
      class="strip"
      class:hidden={!active}
      style:transform="translateX({offsetOf(strip.workspace, strip.index)}px)"
      style:gap="{COLUMN_GAP}px"
    >
      {#each hostsOf(strip.workspace) as host (host.id)}
        {@const attachment = attachmentOf(strip.workspace, host.id)}
        <!-- A hidden strip names no focused column: a composer or a shell in
             it believing it held the keyboard would fight the one on screen. -->
        <PaneGroup
          workspace={strip.workspace}
          {host}
          {attachment}
          focusedId={active ? app.thread.id : ''}
          {viewportWidth}
          onfocus={focusColumn}
          {onmodel}
          {oncommit}
        />
      {/each}
    </div>
  {/each}
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

  /* Kept, not gone: the whole point of mounting more than one strip. */
  .strip.hidden {
    display: none;
  }
</style>
