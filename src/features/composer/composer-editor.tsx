import { useLayoutEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import bookOpen from "pixelarticons/svg/book-open.svg";

import { deleteSkillTokenAt, skillTokenRanges } from "./commands";
import type { ThreadSkill } from "@/shared/contracts/app";

type ComposerEditorProps = {
  value: string;
  cursor: number;
  skills: ThreadSkill[];
  disabled?: boolean | undefined;
  placeholder: string;
  suggestionsOpen: boolean;
  suggestionMenuId: string;
  activeSuggestionId?: string | undefined;
  onChange: (value: string, cursor: number) => void;
  onBlur?: (() => void) | undefined;
  onCursor: (cursor: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLDivElement>) => void;
};

export function ComposerEditor({ value, cursor, skills, disabled, placeholder, suggestionsOpen, suggestionMenuId, activeSuggestionId, onChange, onBlur, onCursor, onKeyDown, onPaste }: ComposerEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const skipNextKeyUp = useRef(false);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const ranges = skillTokenRanges(value, skills);
    const signature = ranges.map(({ start, name }) => `${start}:${name}`).join("|");
    if ((editor.textContent ?? "") === value && editor.dataset.skillSignature === signature) return;
    renderEditor(editor, value, ranges);
    editor.dataset.skillSignature = signature;
    setCaret(editor, cursor);
  }, [cursor, skills, value]);

  function commit() {
    const editor = editorRef.current;
    if (!editor) return;
    const cursor = caretOffset(editor);
    onCursor(cursor);
    onChange(editor.textContent ?? "", cursor);
  }

  function insertText(text: string) {
    const editor = editorRef.current;
    if (!editor) return;
    const range = editorSelectionRange(editor) ?? rangeAtEnd(editor);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    replaceSelection(range);
    commit();
  }

  function writeSelection(event: ClipboardEvent<HTMLDivElement>, cut = false) {
    const editor = editorRef.current;
    const range = editor && editorSelectionRange(editor);
    if (!editor || !range || range.collapsed) return;
    const { start, end } = selectionOffsets(editor, range);
    event.preventDefault();
    event.clipboardData.setData("text/plain", value.slice(start, end));
    if (!cut) return;
    range.deleteContents();
    range.collapse(true);
    replaceSelection(range);
    commit();
  }

  return <div
    ref={editorRef}
    aria-disabled={disabled || undefined}
    aria-label="Message"
    aria-multiline="true"
    aria-controls={suggestionsOpen ? suggestionMenuId : undefined}
    aria-expanded={suggestionsOpen}
    aria-activedescendant={activeSuggestionId}
    aria-haspopup="listbox"
    className="pb-composer-editor"
    contentEditable={!disabled}
    data-placeholder={placeholder}
    role="textbox"
    tabIndex={disabled ? -1 : 0}
    suppressContentEditableWarning
    onBlur={onBlur}
    onCopy={writeSelection}
    onCut={(event) => writeSelection(event, true)}
    onInput={commit}
    onMouseDown={(event) => {
      const chip = (event.target as HTMLElement).closest<HTMLElement>(".pb-skill-chip");
      if (!chip || !editorRef.current?.contains(chip)) return;
      event.preventDefault();
      selectNode(chip);
    }}
    onKeyUp={() => {
      if (skipNextKeyUp.current) { skipNextKeyUp.current = false; return; }
      if (editorRef.current) onCursor(caretOffset(editorRef.current));
    }}
    onMouseUp={() => editorRef.current && onCursor(caretOffset(editorRef.current))}
    onKeyDown={(event) => {
      onKeyDown(event);
      if (event.defaultPrevented) skipNextKeyUp.current = true;
      const shortcut = (event.metaKey || event.ctrlKey) ? event.key.toLowerCase() : "";
      if (!event.defaultPrevented && (shortcut === "c" || shortcut === "x" || shortcut === "v")) {
        const editor = editorRef.current;
        const range = editor && editorSelectionRange(editor);
        if (!editor || !range || (shortcut !== "v" && range.collapsed)) return;
        const { start, end } = selectionOffsets(editor, range);
        event.preventDefault();
        skipNextKeyUp.current = true;
        if (shortcut === "v") {
          void readText().then((text) => {
            if ((editor.textContent ?? "") !== value) return;
            const nextCursor = start + text.length;
            onCursor(nextCursor);
            onChange(value.slice(0, start) + text + value.slice(end), nextCursor);
          });
          return;
        }
        void writeText(value.slice(start, end)).then(() => {
          if (shortcut !== "x" || (editor.textContent ?? "") !== value) return;
          onCursor(start);
          onChange(value.slice(0, start) + value.slice(end), start);
        });
        return;
      }
      if (!event.defaultPrevented && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        skipNextKeyUp.current = true;
        if (editorRef.current) selectNodeContents(editorRef.current);
        return;
      }
      if (!event.defaultPrevented && (event.key === "Backspace" || event.key === "Delete")) {
        const editor = editorRef.current;
        const range = editor && editorSelectionRange(editor);
        if (range && !range.collapsed) {
          event.preventDefault();
          skipNextKeyUp.current = true;
          range.deleteContents();
          range.collapse(true);
          replaceSelection(range);
          commit();
          return;
        }
        const deletion = editor && deleteSkillTokenAt(editor.textContent ?? "", caretOffset(editor), event.key === "Backspace" ? "backward" : "forward", skills);
        if (deletion) {
          event.preventDefault();
          skipNextKeyUp.current = true;
          onCursor(deletion.cursor);
          onChange(deletion.value, deletion.cursor);
          return;
        }
      }
      if (!event.defaultPrevented && event.key === "Enter" && event.shiftKey) { event.preventDefault(); insertText("\n"); }
    }}
    onPaste={(event) => {
      onPaste(event);
      if (event.defaultPrevented) return;
      event.preventDefault();
      insertText(event.clipboardData.getData("text/plain"));
    }}
  />;
}

function renderEditor(editor: HTMLDivElement, value: string, ranges: ReturnType<typeof skillTokenRanges>) {
  const fragment = document.createDocumentFragment();
  let offset = 0;
  for (const range of ranges) {
    fragment.append(document.createTextNode(value.slice(offset, range.start)));
    const chip = document.createElement("span");
    chip.className = "pb-skill-chip";
    chip.contentEditable = "false";
    chip.dataset.skill = range.name;
    const hiddenPrefix = document.createElement("span");
    hiddenPrefix.className = "sr-only";
    hiddenPrefix.textContent = "$";
    const icon = document.createElement("span");
    icon.className = "pb-skill-chip-icon";
    icon.style.setProperty("--pb-skill-icon", `url("${bookOpen}")`);
    const label = document.createElement("span");
    label.textContent = range.name;
    chip.append(hiddenPrefix, icon, label);
    fragment.append(chip);
    offset = range.end;
  }
  fragment.append(document.createTextNode(value.slice(offset)));
  editor.replaceChildren(fragment);
}

function caretOffset(editor: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) return (editor.textContent ?? "").length;
  return boundaryOffset(editor, selection.anchorNode!, selection.anchorOffset).offset;
}

function editorSelectionRange(editor: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer) ? range : null;
}

function selectionOffsets(editor: HTMLDivElement, range: Range) {
  const start = boundaryOffset(editor, range.startContainer, range.startOffset).offset;
  const end = boundaryOffset(editor, range.endContainer, range.endOffset).offset;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function rangeAtEnd(editor: HTMLDivElement) {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  return range;
}

function selectNode(node: Node) {
  const range = document.createRange();
  range.selectNode(node);
  replaceSelection(range);
}

function selectNodeContents(node: Node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  replaceSelection(range);
}

function replaceSelection(range: Range) {
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

function boundaryOffset(node: Node, boundary: Node, boundaryOffsetValue: number): { found: boolean; offset: number } {
  if (node === boundary) {
    if (node.nodeType === Node.TEXT_NODE) return { found: true, offset: boundaryOffsetValue };
    return { found: true, offset: [...node.childNodes].slice(0, boundaryOffsetValue).reduce((length, child) => length + (child.textContent?.length ?? 0), 0) };
  }
  let offset = 0;
  for (const child of node.childNodes) {
    const result = boundaryOffset(child, boundary, boundaryOffsetValue);
    if (result.found) return { found: true, offset: offset + result.offset };
    offset += child.textContent?.length ?? 0;
  }
  return { found: false, offset };
}

function setCaret(editor: HTMLDivElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= length;
  }
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
