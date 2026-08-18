<script lang="ts">
  import Backdrop from './Backdrop.svelte'
  import { isAction } from '$lib/keymap'
  import { config } from '$lib/state/config.svelte'

  const { onclose }: { onclose: () => void } = $props()

  // The reader's own bindings, when there are any. The groups below are what
  // the app ships; a screen that showed only those would be wrong for exactly
  // the reader who changed something.
  const mine = $derived(config.config.keys.filter((one) => isAction(one.action)))

  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: 'NAVIGATE',
      rows: [
        ['jump workspace', '1–3'],
        ['prev/next thread', 'h / l'],
        ['switcher', 'w'],
        ['commands', '⌘K'],
        ['search threads', '/'],
        ['model', 'm'],
        ['voice', '⇧M'],
        ['terminal column', 't'],
        ['move column', '⇧H/⇧L'],
        ['settings', ','],
        ['workspace settings', '<'],
      ],
    },
    {
      title: 'LEADER ␣',
      rows: [
        ['␣ 1–3 jump', 'chord'],
        ['␣ n new thread', 'chord'],
        ['␣ x close column', 'chord'],
        ['␣ c compact', 'chord'],
        ['␣ p permission', 'chord'],
        ['␣ f find thread', 'chord'],
        ['␣ m model', 'chord'],
        ['␣ M voice', 'chord'],
        ['␣ s settings', 'chord'],
        ['␣ S workspace', 'chord'],
        ['␣ k keymap', 'chord'],
      ],
    },
    {
      title: 'READ',
      rows: [
        ['enter · move block', 'j / k'],
        ['expand · collapse', 'l / h'],
        ['half page', '^d / ^u'],
        ['leap to block', 's'],
        ['block actions', 'a'],
        ['back to strip', 'esc'],
        ['yank last code', 'y'],
        ['see the change', 'd'],
      ],
    },
    {
      title: 'DIFF',
      rows: [
        ['file · hunk', 'j / k'],
        ['switch pane', 'tab'],
        ['next · prev hunk', 'n / N'],
        ['top · bottom', 'gg / G'],
        ['filter files', '/'],
        ['copy the line', 'y'],
        ['close', 'esc'],
      ],
    },
    {
      title: 'COMPOSE',
      rows: [
        ['insert mode', 'i'],
        ['normal mode', 'esc'],
        ['send', '⏎'],
      ],
    },
  ]
</script>

<Backdrop {onclose} z={55} label="Keymap">
  <div class="keymap">
    <div class="heading">KEYMAP <span class="sub">— play it like a song</span></div>
    <div class="grid">
      {#each groups as group (group.title)}
        <div class="group">
          <div class="group-title">{group.title}</div>
          {#each group.rows as [label, key] (label)}
            <div class="row"><span>{label}</span><span class="key">{key}</span></div>
          {/each}
        </div>
      {/each}

      {#if mine.length > 0}
        <div class="group">
          <div class="group-title">YOURS</div>
          <!-- Said rather than merged into the groups above: those are a
               written list, so a shipped key the reader has taken over still
               reads there as if it did what it always did. -->
          <div class="row note">these replace the shipped keys above</div>
          {#each mine as binding (`${binding.mode} ${binding.key}`)}
            <div class="row">
              <span>{binding.action} <span class="where">{binding.mode.toLowerCase()}</span></span>
              <span class="key">{binding.key === ' ' ? '␣' : binding.key}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</Backdrop>

<style>
  .note {
    color: var(--dim);
    font-size: 10px;
  }

  .where {
    color: var(--dim);
    font-size: 10px;
  }

  .keymap {
    width: var(--column-w);
    border: 1px solid rgba(255, 255, 255, 0.055);
    background: var(--bg-panel);
    padding: 26px 30px;
    animation: rise 0.2s ease;
  }

  .heading {
    font-size: 16px;
    color: var(--fg-bright);
    margin-bottom: 18px;
  }
  .sub {
    color: var(--fg-dimmer);
    font-size: 11px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 24px;
    font-size: 11px;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .group-title {
    color: var(--accent);
    font-size: 10px;
    letter-spacing: 0.12em;
  }

  .row {
    display: flex;
    justify-content: space-between;
    color: var(--fg-agent);
  }
  .key {
    color: var(--fg-dim);
  }
</style>
