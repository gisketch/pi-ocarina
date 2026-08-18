<script lang="ts">
  import Icon from '../Icon.svelte'

  /** The way back to the live end of a thread.
   *
   *  Drawn only while the reader is paused *and* something has landed below
   *  them — a button offering to take someone where they can already see is
   *  noise. It carries a count rather than only an arrow, because the count is
   *  the thing that decides whether they want to go. */
  interface Props {
    unseen: number
    onjump: () => void
  }

  const { unseen, onjump }: Props = $props()
</script>

<button type="button" class="pill" onclick={onjump}>
  <span class="count"><Icon name="down" />{unseen} new</span>
  jump to latest
  <span class="key">G</span>
</button>

<style>
  .pill {
    position: absolute;
    left: 50%;
    bottom: 14px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 13px;
    border: 1px solid var(--accent-soft);
    background: var(--bg-float, var(--bg-panel));
    font: inherit;
    font-size: 10.5px;
    color: var(--fg-body);
    white-space: nowrap;
    cursor: pointer;
    /* Above the transcript, below anything modal. */
    z-index: 4;
    box-shadow: 0 8px 30px rgb(0 0 0 / 0.5);
  }
  .pill:hover {
    border-color: var(--accent);
  }
  .count {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--accent);
  }
  .key {
    font-family: var(--font-chrome);
    font-size: 9.5px;
    color: var(--fg-dimmest);
    border: 1px solid var(--line-mid);
    padding: 0 4px;
  }
</style>
