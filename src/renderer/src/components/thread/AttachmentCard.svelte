<script lang="ts">
  /** One attachment, expanded from the chip that names it.
   *
   *  Under the message rather than inside the sentence: the sentence keeps its
   *  line height, and a picture that pushed the words apart would be the
   *  separate row this design removes, only worse. */
  import { bridge } from '$lib/bridge'
  import Icon from '../Icon.svelte'
  import type { MessageAttachment } from '$lib/thread'

  const { attachment }: { attachment: MessageAttachment } = $props()

  const isImage = $derived((attachment.mime ?? '').startsWith('image/'))
</script>

<div class="card">
  {#if isImage && attachment.path}
    <!-- Main wrote this file, or the reader chose it; the renderer is showing
         a path it was handed, never one it went looking for. -->
    <img src={`file://${attachment.path}`} alt={attachment.name} />
  {/if}
  <div class="foot">
    <span class="name">{attachment.name}</span>
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
    border: 1px solid var(--line-soft, rgb(255 255 255 / 0.06));
    background: var(--bg-sunk, #0a0a0c);
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
    border-top: 1px solid var(--line-soft, rgb(255 255 255 / 0.04));
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
