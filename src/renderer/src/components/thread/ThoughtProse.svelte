<script lang="ts">
  /** A thought, said as prose.
   *
   *  Not a tool row (turn-accordion spec): a thought is the model narrating
   *  its own work, and the narration is what separates one run of calls from
   *  the next — so it reads as a quiet message, not as a call that happened.
   *  No icon, no label, no clamp: the words are the whole row.
   *
   *  Muted and italic, full text always. `Thought` already parses the inline
   *  markdown a model writes while thinking; this wraps it in the message
   *  posture. */
  import Thought from './md/Thought.svelte'

  const { text }: { text: string } = $props()
</script>

<div class="prose-thought">
  <Thought {text} />
</div>

<style>
  .prose-thought {
    font-style: italic;
    padding: 3px 0;
  }
  /* The message's own size, not a tool body's: the prose stands beside PI's
     answers, and eleven-pixel narration next to twelve-and-a-half-pixel
     speech read as a different program talking. Colour stays a step down —
     narration, not the answer. */
  .prose-thought :global(.thought) {
    font-size: 12.5px;
    line-height: 1.65;
    color: var(--fg-dim);
  }
</style>
