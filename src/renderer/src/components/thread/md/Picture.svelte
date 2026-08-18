<script lang="ts">
  /** Every picture in the transcript, wherever it came from.
   *
   *  One component on purpose: an image attached to a message, one pasted from
   *  the clipboard, one the agent read, and one written into an answer as
   *  markdown are the same thing to a reader, and four previews that differed
   *  would be four bugs waiting to be reported.
   *
   *  Takes `src` and `alt` rather than a markdown node, so a ledger body can
   *  use it without inventing a node to pass. */
  const {
    src,
    alt = '',
    caption = '',
  }: { src: string; alt?: string; caption?: string } = $props()

  let failed = $state(false)
</script>

<!-- The seam a screenshot arrives through. An image that will not load says so
     rather than leaving a gap the reader cannot explain. -->
{#if failed}
  <div class="missing">image unavailable{alt ? ` — ${alt}` : ''}</div>
{:else}
  <figure>
    <img {src} {alt} loading="lazy" onerror={() => (failed = true)} />
    {#if caption}
      <!-- What pi saw, and how big it was. Under the picture rather than in
           the row: the row is a line and this is about the picture. -->
      <figcaption>{caption}</figcaption>
    {/if}
  </figure>
{/if}

<style>
  figure {
    margin: 0;
    max-width: 100%;
  }
  img {
    display: block;
    max-width: 100%;
    border: 1px solid var(--line-faint);
  }
  figcaption {
    padding: 4px 2px 0;
    font-family: var(--font-chrome);
    font-size: 9.5px;
    color: var(--fg-dimmest);
  }
  .missing {
    padding: 8px 10px;
    border: 1px dashed var(--line-mid);
    color: var(--fg-dimmest);
    font-size: 11.5px;
  }
</style>
