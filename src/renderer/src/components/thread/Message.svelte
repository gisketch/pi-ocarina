<script lang="ts">
  import { parseInline } from '$lib/thread'

  interface Props {
    role: 'user' | 'agent'
    text: string
    streaming?: boolean
  }

  const { role, text, streaming = false }: Props = $props()
  const segments = $derived(parseInline(text))
</script>

<div class="message {role}">
  <div class="label">{role === 'user' ? 'YOU' : '■ PI'}</div>
  <div class="text">{#each segments as segment, i (i)}{#if segment.code}<code>{segment.text}</code
      >{:else}{segment.text}{/if}{/each}{#if streaming}<span class="caret"></span>{/if}</div>
</div>

<style>
  .message {
    display: flex;
    flex-direction: column;
  }
  .user {
    gap: 6px;
  }
  .agent {
    gap: 8px;
  }

  .label {
    font-family: var(--font-chrome);
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--fg-dim);
  }
  .agent .label {
    color: var(--accent);
  }

  .text {
    font-family: var(--font-body);
    font-size: 12.5px;
  }
  .user .text {
    color: var(--fg-body);
    line-height: 1.65;
  }
  .agent .text {
    color: var(--fg-agent);
    line-height: 1.7;
  }

  code {
    background: var(--bg-chip);
    padding: 1px 5px;
    font-size: 12px;
    color: var(--fg-body);
    font-family: var(--font-body);
  }

  .caret {
    display: inline-block;
    width: 7px;
    height: 14px;
    background: var(--accent);
    margin-left: 5px;
    vertical-align: text-bottom;
    animation: caret 1s step-end infinite;
  }
</style>
