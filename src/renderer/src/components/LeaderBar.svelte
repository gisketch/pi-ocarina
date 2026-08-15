<script lang="ts">
  const chords: [string, string][] = [
    ['1–3', 'jump workspace'],
    ['h/l', 'prev / next thread'],
    ['w', 'switcher'],
    ['n', 'new thread'],
    ['t', 'terminal'],
    ['m', 'model'],
    ['s', 'settings'],
    ['k', 'keymap'],
  ]
</script>

<div class="leader" role="status">
  <span class="label">LEADER</span>
  {#each chords as [key, description] (key)}
    <span class="chord"><span class="kbd">{key}</span>{description}</span>
  {/each}
  <span class="cancel"><span class="kbd plain">esc</span> cancel</span>
</div>

<style>
  .leader {
    position: fixed;
    left: 0;
    right: 0;
    bottom: var(--statusbar-h);
    z-index: 40;
    background: var(--bg-panel);
    border-top: 1px solid var(--line-strong);
    padding: 10px 18px;
    display: flex;
    align-items: center;
    gap: 18px;
    font-size: 10.5px;
    animation: slideup 0.15s ease;
    box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.4);
  }

  .label {
    color: var(--accent);
    letter-spacing: 0.1em;
    font-size: 10px;
  }

  .chord {
    color: var(--fg-agent);
  }

  .kbd {
    border: 1px solid rgba(255, 255, 255, 0.11);
    padding: 1px 6px;
    color: var(--fg-bright);
    margin-right: 6px;
  }

  .cancel {
    margin-left: auto;
    color: var(--fg-dimmest);
  }
  .kbd.plain {
    border-color: rgba(255, 255, 255, 0.09);
    color: inherit;
    margin-right: 0;
  }
</style>
