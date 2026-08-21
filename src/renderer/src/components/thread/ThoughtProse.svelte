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
    padding: 3px 6px;
  }
</style>
