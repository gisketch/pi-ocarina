<script lang="ts"></script>

<!-- The agent's name, said once per turn.
     It belongs to the turn rather than to a message, because a turn is often
     tool calls first and words last — and the reader is being told who is
     acting, not which of pi's internal messages this happens to be. -->
<div class="label">■ PI</div>

<style>
  .label {
    font-family: var(--font-chrome);
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--accent);
  }
</style>
