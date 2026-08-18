<script lang="ts">
  /** Settings that belong to the open workspace rather than to the app.
   *
   *  A sibling of `SettingsOverlay`, not a section inside it: what a repository
   *  wants from a language server is not what the next repository wants, and a
   *  row that silently meant "this folder only" inside a global screen would be
   *  the kind of thing a reader discovers by being surprised. This one names the
   *  workspace at the top, so its scope is never in question. */
  import Backdrop from './Backdrop.svelte'
  import { wrapIndex } from '$lib/fuzzy'
  import { app } from '$lib/state/app.svelte'
  import { confirm } from '$lib/state/confirm.svelte'
  import { permission } from '$lib/state/permission.svelte'
  import { PERMISSION_NOTES } from '../../../../shared/permissions'
  import { workspaceLsp } from '$lib/state/workspace-lsp.svelte'

  const { onclose }: { onclose: () => void } = $props()

  let selected = $state(0)

  $effect(() => {
    void workspaceLsp.load(app.workspace.id)
    void permission.load(app.workspace.id)
  })

  /** Permissions, then the master switch, then one row per server. */
  const rows = $derived([
    { kind: 'permission' as const },
    { kind: 'master' as const },
    ...workspaceLsp.servers.map((server) => ({ kind: 'server' as const, server })),
  ])

  function act(index: number): void {
    const row = rows[index]
    if (!row) return

    if (row.kind === 'permission') {
      void permission.cycleWorkspace()
      return
    }
    if (row.kind === 'master') {
      void workspaceLsp.set({ on: !workspaceLsp.on })
      return
    }
    void workspaceLsp.set({ serverId: row.server.id, enabled: !row.server.enabled })
  }

  function copy(index: number): void {
    const row = rows[index]
    if (row?.kind === 'server' && !row.server.installed) void workspaceLsp.copyInstall(row.server)
  }

  /** The keys belong to the confirmation while it is up. Without this, `j`
   *  moved the row behind a modal question about full access. */
  const modal = $derived(confirm.pending)

  function onkeydown(event: KeyboardEvent): void {
    if (modal) return
    switch (event.key) {
      case 'j':
      case 'ArrowDown':
        selected = wrapIndex(selected + 1, rows.length)
        break
      case 'k':
      case 'ArrowUp':
        selected = wrapIndex(selected - 1, rows.length)
        break
      case 'Enter':
      case ' ':
        act(selected)
        break
      case 'y':
        copy(selected)
        break
      default:
        return
    }
    event.preventDefault()
  }

  /** What a server's row says about itself, in three words or fewer. */
  function stateOf(server: (typeof workspaceLsp.servers)[number]): string {
    if (!server.installed) return 'not installed'
    if (!workspaceLsp.on) return 'workspace off'
    if (!server.enabled) return 'off'
    if (server.degraded) return 'degraded'
    if (server.running) return 'running'
    return 'ready'
  }
</script>

<svelte:window {onkeydown} />

<Backdrop {onclose} z={53} label="Workspace settings">
  <div class="screen">
    <div class="head">
      WORKSPACE
      <span class="name" style:--hue={app.workspace.hue}>
        <span class="note">♪ {app.workspace.note}</span>{app.workspace.name}
      </span>
    </div>

    <div class="rows">
      <button
        type="button"
        class="row"
        class:selected={selected === 0}
        onclick={() => {
          selected = 0
          act(0)
        }}
        onmouseenter={() => (selected = 0)}
      >
        <span class="label">permission</span>
        <span class="sub">{PERMISSION_NOTES[permission.level]}</span>
        <span class="value" class:on={permission.level === 'auto'} class:warn={permission.level === 'full'}>
          {permission.row}
        </span>
        <span class="hint">⏎</span>
      </button>

      <button
        type="button"
        class="row"
        class:selected={selected === 1}
        onclick={() => {
          selected = 1
          act(1)
        }}
        onmouseenter={() => (selected = 1)}
      >
        <span class="label">language servers</span>
        <span class="sub">the agent asks the compiler instead of grepping</span>
        <span class="value" class:on={workspaceLsp.on}>{workspaceLsp.on ? 'on' : 'off'}</span>
        <span class="hint">⏎</span>
      </button>

      {#if workspaceLsp.error}
        <div class="empty">could not read this workspace — {workspaceLsp.error}</div>
      {:else if workspaceLsp.servers.length === 0}
        <div class="empty">
          {workspaceLsp.loading ? 'looking…' : 'no language server matches this workspace'}
        </div>
      {/if}

      {#each workspaceLsp.servers as server, i (server.id)}
        {@const at = i + 2}
        <button
          type="button"
          class="row server"
          class:selected={selected === at}
          class:dim={!workspaceLsp.on}
          onclick={() => {
            selected = at
            act(at)
          }}
          onmouseenter={() => (selected = at)}
        >
          <span class="label">{server.label}</span>
          {#if !server.installed}
            <span class="sub mono">{server.install}</span>
          {/if}
          <span
            class="value"
            class:on={server.running}
            class:warn={server.degraded || !server.installed}
          >
            {stateOf(server)}
          </span>
          <span class="hint">
            {#if !server.installed}
              {workspaceLsp.copied === server.id ? 'copied' : 'y'}
            {:else}
              ⏎
            {/if}
          </span>
        </button>
      {/each}
    </div>

    <div class="foot">j/k move · ⏎ switch · y copy install · esc close</div>
  </div>
</Backdrop>

<style>
  .screen {
    width: 560px;
    border: 1px solid rgba(255, 255, 255, 0.055);
    background: var(--bg-panel);
    animation: rise 0.2s ease;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--bg-chip);
    font-family: var(--font-chrome);
    font-size: 10px;
    letter-spacing: 0.14em;
    color: var(--fg-dim);
  }
  .name {
    margin-left: auto;
    display: flex;
    align-items: baseline;
    gap: 7px;
    letter-spacing: 0;
    color: var(--fg-bright);
  }
  .note {
    color: oklch(0.76 0.14 var(--hue));
  }

  .rows {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr auto 22px;
    align-items: baseline;
    gap: 10px;
    padding: 9px 12px;
    width: 100%;
    text-align: left;
    cursor: pointer;
    color: var(--fg-agent);
    border: none;
    border-left: 2px solid transparent;
    background: none;
    font-family: var(--font-body);
    font-size: 12px;
    transition:
      background-color 0.15s,
      border-color 0.15s;
  }
  .row.selected {
    border-left-color: var(--accent);
    background: var(--bg-hover);
  }
  /* A server row means nothing while the workspace switch is off; it is still
     shown, because that is where the reader looks to find out what would run. */
  .row.dim .label,
  .row.dim .value {
    opacity: 0.5;
  }

  .label {
    grid-column: 1;
  }
  .sub {
    grid-column: 1;
    grid-row: 2;
    font-size: 10.5px;
    color: var(--fg-dimmest);
  }
  .sub.mono {
    font-family: var(--font-chrome);
    /* The install line is a command the reader will paste, so it is shown
       whole rather than shortened into something that would not run. */
    word-break: break-all;
  }

  .value {
    grid-column: 2;
    color: var(--fg-dim);
  }
  .value.on {
    color: var(--accent);
  }
  .value.warn {
    color: var(--warn, var(--fg-bright));
  }

  .hint {
    grid-column: 3;
    color: var(--fg-dimmest);
    font-size: 10px;
    font-family: var(--font-chrome);
    text-align: right;
  }

  .empty {
    padding: 10px 14px;
    font-size: 11px;
    color: var(--fg-dimmest);
  }

  .foot {
    display: flex;
    gap: 14px;
    padding: 10px 20px;
    border-top: 1px solid var(--bg-chip);
    font-family: var(--font-chrome);
    font-size: 10px;
    color: var(--fg-dimmest);
  }
</style>
