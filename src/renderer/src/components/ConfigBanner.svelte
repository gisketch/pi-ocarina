<script lang="ts">
  /** What did not load out of the reader's configuration file.
   *
   *  Loud on purpose. A binding that quietly failed is a key that does nothing
   *  for a reason nobody can see, and the reader's next move is to press it
   *  again harder. Dismissible, because the same list is in settings and a
   *  banner that cannot be closed is a banner that gets ignored.
   *
   *  `where` and `message` come out of a file on disk, so they render as text.
   *  Nothing here uses `{@html}`. */
  import { config } from '$lib/state/config.svelte'

  let dismissed = $state(false)

  $effect(() => {
    void config.load()
  })
</script>

{#if config.broken && !dismissed}
  <div class="banner" role="status">
    <span class="pip"></span>
    <span class="text">
      {config.problems.length === 1 ? '1 problem' : `${config.problems.length} problems`} in
      {config.path} — {config.problems[0].where}: {config.problems[0].message}
    </span>
    <button type="button" onclick={() => (dismissed = true)}>dismiss</button>
  </div>
{/if}

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 14px;
    background: color-mix(in srgb, var(--bad) 12%, var(--bg));
    border-bottom: 1px solid color-mix(in srgb, var(--bad) 35%, transparent);
    font-family: var(--font-chrome);
    font-size: 10px;
    letter-spacing: 0.06em;
    color: var(--fg);
  }

  .pip {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--bad);
    flex: none;
  }

  .text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button {
    background: none;
    border: 0;
    font: inherit;
    letter-spacing: inherit;
    color: var(--dim);
    cursor: pointer;
  }

  button:hover {
    color: var(--fg);
  }
</style>
