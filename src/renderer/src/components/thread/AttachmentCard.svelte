<script lang="ts">
  /** One attachment, expanded from the chip that names it.
   *
   *  Under the message rather than inside the sentence: the sentence keeps its
   *  line height, and a picture that pushed the words apart would be the
   *  separate row this design removes, only worse. */
  import Icon from '../Icon.svelte'
  import { bridge } from '$lib/bridge'
  import type { MessageAttachment } from '$lib/thread'

  const { attachment }: { attachment: MessageAttachment } = $props()

  const isImage = $derived((attachment.mime ?? '').startsWith('image/'))

  /** Bytes, not a path. The app's CSP is `img-src 'self' data:` — a `file://`
   *  URL here draws nothing, and the reader would be told a picture expanded
   *  and shown an empty box. */
  let src = $state<string | null>(null)
  let size = $state('')
  let picture = $state<HTMLImageElement | null>(null)

  $effect(() => {
    const path = attachment.path
    if (!isImage || !path) return

    let alive = true
    void bridge?.files.image(path).then((uri) => {
      if (alive) src = uri
    })
    return () => {
      alive = false
    }
  })
</script>

<div class="card">
  {#if src}
    <img
      {src}
      alt={attachment.name}
      bind:this={picture}
      onload={() => {
        if (picture) size = `${picture.naturalWidth}×${picture.naturalHeight}`
      }}
    />
  {/if}
  <div class="foot">
    <Icon name={isImage ? 'image' : 'file'} />
    <span class="name">{attachment.name}</span>
    {#if size}<span class="size">{size}</span>{/if}
    <span class="from">expanded from chip</span>
    {#if attachment.path}
      <button type="button" onclick={() => void bridge?.files.open(attachment.path ?? '')}>
        open <Icon name="open" />
      </button>
    {:else}
      <!-- A replayed message knows the name its prompt recorded and nothing
           more: the file lived in a temporary directory that may be gone, and
           offering to open it would be a promise this cannot keep. -->
      <span class="gone">not kept</span>
    {/if}
  </div>
</div>

<style>
  .card {
    background: var(--bg-deep);
    margin: 6px 0;
    max-width: 520px;
  }
  img {
    display: block;
    width: 100%;
    max-height: 240px;
    object-fit: cover;
    object-position: top;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.03);
    font-family: var(--font-chrome);
    font-size: 10px;
    color: var(--fg-dimmest);
  }
  .name {
    color: var(--fg-dim);
  }
  .from,
  .gone {
    margin-left: auto;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    background: none;
    border: none;
    font: inherit;
    color: var(--fg-muted);
    cursor: pointer;
  }
  button:hover {
    color: var(--fg-bright);
  }
</style>
