<script lang="ts">
  interface Props {
    command: string
    note?: string
  }

  const { command, note }: Props = $props()

  // Decisions are local in the static shell; per-workspace policy lands with the
  // session backend (see the approvals decision in the architecture spec).
  let decision = $state<'allow' | 'deny' | null>(null)

  const status = $derived(
    decision === 'allow' ? 'allowed · running…' : decision === 'deny' ? 'denied' : '',
  )
</script>

<div class="approve">
  <div class="head">
    <span class="tag">! APPROVE</span>
    <span class="body"
      >pi wants to run <code>{command}</code>{#if note}{' '}<span class="note">{note}</span
        >{/if}</span
    >
    <span class="status">{status}</span>
  </div>

  {#if decision === null}
    <div class="actions">
      <button type="button" class="primary" onclick={() => (decision = 'allow')}>allow once</button>
      <button type="button" class="secondary" onclick={() => (decision = 'allow')}>always allow</button>
      <button type="button" class="ghost" onclick={() => (decision = 'deny')}>deny</button>
    </div>
  {/if}
</div>

<style>
  .approve {
    border: 1px solid rgba(233, 196, 106, 0.28);
    background: var(--warn-soft);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 12px;
  }
  .tag {
    font-family: var(--font-chrome);
    font-size: 10px;
    color: var(--warn);
    flex: none;
  }
  .body {
    color: var(--fg);
    font-size: 12px;
    font-family: var(--font-body);
  }
  code {
    background: var(--bg-chip);
    padding: 1px 5px;
    font-size: 11.5px;
    font-family: var(--font-body);
  }
  .note {
    color: var(--fg-dim);
  }
  .status {
    margin-left: auto;
    color: var(--fg-dim);
    font-size: 10px;
    font-family: var(--font-chrome);
    white-space: nowrap;
  }

  .actions {
    display: flex;
    gap: 8px;
    padding: 0 12px 11px;
  }

  button {
    padding: 5px 14px;
    cursor: pointer;
    font-size: 10.5px;
    font-family: var(--font-chrome);
    border: 1px solid transparent;
    transition: all 0.15s;
  }
  .primary {
    background: var(--warn);
    color: var(--bg);
  }
  .primary:hover {
    background: #f2d488;
  }
  .secondary {
    border-color: rgba(233, 196, 106, 0.4);
    color: var(--warn);
    background: none;
  }
  .secondary:hover {
    background: rgba(233, 196, 106, 0.08);
  }
  .ghost {
    border-color: var(--line-strong);
    color: var(--fg-dim);
    background: none;
  }
  .ghost:hover {
    border-color: rgba(255, 255, 255, 0.3);
  }
</style>
