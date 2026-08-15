<script lang="ts">
  interface Props {
    label: string
    /** Absent for a thread with no backend behind it; the control stays hidden
     *  rather than offering an action that would do nothing. */
    onrestore?: () => void
  }

  const { label, onrestore }: Props = $props()

  let confirming = $state(false)

  function confirm(): void {
    confirming = false
    onrestore?.()
  }
</script>

<div class="checkpoint">
  <span class="rule"></span>
  <span class="label">⟲ CHECKPOINT · {label}</span>
  {#if onrestore && !confirming}
    <button type="button" class="restore" onclick={() => (confirming = true)}>restore</button>
  {/if}
  <span class="rule"></span>
</div>

{#if confirming}
  <!-- The copy is deliberate. Restoring rewinds the conversation only; pi does
       not touch the working tree, and a user who assumed otherwise would be
       expecting their edits to disappear. Say which one it is, plainly. -->
  <div class="confirm">
    <div class="warn">Restore this checkpoint?</div>
    <div class="detail">
      This rewinds the conversation to here. Your files keep every later edit —
      nothing on disk is undone.
    </div>
    <div class="actions">
      <button type="button" class="go" onclick={confirm}>restore</button>
      <button type="button" class="cancel" onclick={() => (confirming = false)}>cancel</button>
    </div>
  </div>
{/if}

<style>
  .checkpoint {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 10px;
    font-family: var(--font-chrome);
    color: var(--fg-dimmest);
  }

  .rule {
    height: 1px;
    flex: 1;
    background: repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.14) 0 4px,
      transparent 4px 8px
    );
  }

  .label {
    white-space: nowrap;
  }

  .restore {
    border: 1px solid var(--line-strong);
    background: none;
    padding: 1px 7px;
    color: var(--fg-dim);
    font-size: 10px;
    font-family: var(--font-chrome);
    cursor: pointer;
    transition:
      border-color 0.15s,
      color 0.15s;
  }
  .restore:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .confirm {
    border: 1px solid rgba(233, 196, 106, 0.28);
    background: var(--warn-soft);
    padding: 10px 13px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .warn {
    font-family: var(--font-chrome);
    font-size: 10px;
    color: var(--warn);
  }

  .detail {
    font-family: var(--font-body);
    font-size: 11.5px;
    line-height: 1.6;
    color: var(--fg-agent);
  }

  .actions {
    display: flex;
    gap: 8px;
    padding-top: 2px;
  }

  .actions button {
    padding: 5px 14px;
    cursor: pointer;
    font-size: 10.5px;
    font-family: var(--font-chrome);
    border: 1px solid transparent;
    transition:
      background-color 0.15s,
      border-color 0.15s,
      color 0.15s;
  }
  .go {
    background: var(--warn);
    color: var(--bg);
  }
  .go:hover {
    background: #f2d488;
  }
  .cancel {
    border-color: var(--line-strong);
    color: var(--fg-dim);
    background: none;
  }
  .cancel:hover {
    border-color: rgba(255, 255, 255, 0.3);
  }
</style>
