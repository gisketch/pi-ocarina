<script lang="ts">
  /** The composer's field: a contenteditable whose chips are real elements.
   *
   *  This replaces the textarea-and-mirror pair. The mirror could only give a
   *  chip what the text donated — an icon had to stand on a character cell, a
   *  gap had to *be* a character — which is exactly why marks came out tiny,
   *  uneven, and absent at position 0. Here a chip is an element with padding
   *  and an icon of its own, `contenteditable="false"`, so the browser keeps
   *  it atomic: no caret inside it, no deleting half of it.
   *
   *  The invariant that replaces glyph alignment: **the DOM serializes to
   *  exactly the composer string** (`chip-field.ts`). Menus, folds and staged
   *  names keep thinking in that string through the `CaretField` handle.
   *
   *  Typing never rebuilds the DOM — the browser owns it, which keeps IME and
   *  ordinary editing native. Only a programmatic value change (menu insert,
   *  fold, staged names) re-renders, and its caller places the caret. */
  import {
    caretOffset,
    caretPosition,
    chipNode,
    serialize,
    type CaretField,
    type ChipSpec,
  } from '$lib/chip-field'
  import { segment, type Segment } from '$lib/composer-segments'
  import { fileIcon } from '$lib/icons'
  import type { Fold } from '$lib/paste'

  interface Props {
    value: string
    folds: readonly Fold[]
    /** Names of files staged for this message, drawn as chips. */
    files?: readonly string[]
    /** Skill names this workspace loaded, so `/name` can be told from a path. */
    skills?: readonly string[]
    /** The caret interface the composer's consumers speak. */
    handle?: CaretField | null
    /** The editable element, for the shell's focus targeting. */
    element?: HTMLElement | null
    placeholder: string
    onkeydown: (event: KeyboardEvent) => void
    onpaste: (event: ClipboardEvent) => void
    /** Any event that could have moved the caret or changed the text. */
    onmove: () => void
    oninput: () => void
    onfocus: () => void
    onblur: () => void
  }

  let {
    value = $bindable(),
    folds,
    files = [],
    skills = [],
    handle = $bindable(null),
    element = $bindable(null),
    placeholder,
    onkeydown,
    onpaste,
    onmove,
    oninput,
    onfocus,
    onblur,
  }: Props = $props()

  let box = $state<HTMLDivElement | null>(null)

  // The shell focuses the composer by element; the caret ops go through the
  // handle. One node, two doors.
  $effect(() => {
    element = box
  })

  /** What each chip kind is, displays, and wears. The token is the exact
   *  slice of the composer string; the label drops the syntax — `/`, `@`,
   *  a fold's brackets — because the chip's box already says "reference". */
  function specFor(part: Segment & { lead: number }): ChipSpec {
    const token = part.text
    if (part.kind === 'skill') {
      return { token, label: token.slice(1), icon: 'tool-skill', tone: 'warn' }
    }
    if (part.kind === 'fold') {
      const label = /^\[.*\]$/.test(token) ? token.slice(1, -1) : token
      return { token, label, icon: 'tool-write', tone: 'dim' }
    }
    if (part.kind === 'mention') {
      const path = token.slice(1)
      return { token, label: path, icon: fileIcon(path), tone: 'accent' }
    }
    return { token, label: token, icon: fileIcon(token), tone: 'accent' }
  }

  function render(next: string): void {
    if (!box) return
    const doc = box.ownerDocument
    box.replaceChildren(
      ...segment(next, folds, files, skills).map((part) =>
        part.kind === 'plain'
          ? doc.createTextNode(part.text)
          : chipNode(doc, specFor(part)),
      ),
    )
  }

  // Only a value the DOM does not already hold re-renders: a programmatic
  // change. The reader's own typing serialized into `value` a moment ago, so
  // for it this is a no-op and the browser's DOM — and IME state — survive.
  $effect(() => {
    void value
    void folds
    void files
    void skills
    if (box && serialize(box) !== value) render(value)
  })

  function selection(): { start: number; end: number } {
    if (!box) return { start: 0, end: 0 }
    const sel = box.ownerDocument.getSelection()
    if (!sel || sel.rangeCount === 0 || !box.contains(sel.anchorNode)) {
      // Unfocused: the honest answer for "where would this land" is the end,
      // which is where a drop with no caret has always gone.
      const at = serialize(box).length
      return { start: at, end: at }
    }
    const range = sel.getRangeAt(0)
    return {
      start: caretOffset(box, range.startContainer, range.startOffset),
      end: caretOffset(box, range.endContainer, range.endOffset),
    }
  }

  handle = {
    get value(): string {
      return box ? serialize(box) : ''
    },
    get selectionStart(): number {
      return selection().start
    },
    get selectionEnd(): number {
      return selection().end
    },
    setSelectionRange(start: number, end: number): void {
      if (!box) return
      const doc = box.ownerDocument
      const sel = doc.getSelection()
      if (!sel) return
      const from = caretPosition(box, start)
      const to = start === end ? from : caretPosition(box, end)
      const range = doc.createRange()
      range.setStart(from.node, from.offset)
      range.setEnd(to.node, to.offset)
      sel.removeAllRanges()
      sel.addRange(range)
    },
    focus(): void {
      box?.focus()
    },
  }

  function sync(): void {
    if (box) value = serialize(box)
    oninput()
  }

  /** A newline the composer allows (`shift+enter`) is written by hand: the
   *  browser's own Enter would wrap lines in elements this model does not
   *  speak. Inserted as a text node at the selection, then serialized. */
  function newline(): void {
    if (!box) return
    const { start, end } = selection()
    const text = serialize(box)
    value = text.slice(0, start) + '\n' + text.slice(end)
    render(value)
    handle?.setSelectionRange(start + 1, start + 1)
    oninput()
  }

  function keydown(event: KeyboardEvent): void {
    onkeydown(event)
    if (event.defaultPrevented) return
    if (event.key === 'Enter') {
      event.preventDefault()
      if (event.shiftKey) newline()
    }
  }
</script>

<div class="field">
  <div
    bind:this={box}
    class="editor field-metrics"
    class:bare={value === ''}
    contenteditable="true"
    role="textbox"
    tabindex="0"
    aria-multiline="true"
    aria-label={placeholder}
    data-placeholder={placeholder}
    onkeydown={keydown}
    {onpaste}
    {onfocus}
    {onblur}
    oninput={sync}
    onclick={onmove}
    onkeyup={onmove}
  ></div>
</div>

<style>
  .field {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
  }

  .editor {
    font-family: var(--font-body);
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    padding: 0;
    margin: 0;
    border: none;
    flex: 1;
    min-width: 0;
    outline: none;
    color: var(--fg-body);
    caret-color: var(--accent);
    /* The old field's own bound: grows to a few lines, then scrolls. */
    max-height: 140px;
    overflow-y: auto;
    scrollbar-width: none;
  }
  .editor::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  /* The placeholder is painted, not present: `:empty` misses the `<br>` the
     browser seats the caret on, so emptiness is the serialized value's. */
  .editor.bare::before {
    content: attr(data-placeholder);
    color: var(--fg-dimmest);
    pointer-events: none;
    position: absolute;
  }

  /* A chip sits in a line of text; its padding may not stretch the line into
     jumping. Kept tight here rather than trusting the global default. */
  .editor :global(.inline-chip) {
    padding: 0 6px;
  }
</style>
