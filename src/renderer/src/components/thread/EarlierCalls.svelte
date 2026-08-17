<script lang="ts">
  /** How many of a child's calls the transcript is not showing.
   *
   *  A scout can make thirty calls, and thirty indented rows bury the fan-out
   *  they belong to. The transcript keeps the newest five — what a reader is
   *  looking for — and this line says what it kept back and where all of them
   *  are. */
  const { count }: { count: number } = $props()
</script>

<p class="earlier">
  {count} earlier {count === 1 ? 'call' : 'calls'} · <span class="key">l</span> to see all
</p>

<style>
  /* Sits where a row would, so the list reads as continuing above it rather
     than as a note attached to the first row shown. */
  .earlier {
    margin: 0 0 2px 0;
    padding: 3px 6px;
    font-size: 10.5px;
    color: var(--fg-dimmer);
  }
  .key {
    color: var(--fg-dim);
  }
</style>
