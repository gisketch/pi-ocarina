<script lang="ts">
  import Backdrop from './Backdrop.svelte'

  const { onclose }: { onclose: () => void } = $props()

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
    </div>
  </div>
</Backdrop>

<style>
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
