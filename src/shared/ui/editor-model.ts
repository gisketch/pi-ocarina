export type EditorLineKind = "add" | "remove" | "context" | "meta";
export type EditorSourceLine = { kind: EditorLineKind; text: string };
export type EditorLine = EditorSourceLine & { oldLine: number | null; newLine: number | null };
export type EditorDiffModel = { lines: EditorLine[]; additions: number; deletions: number; truncated: boolean };

const contentLimit = 12_000;
const lineLimit = 500;

export function editorStats(lines: EditorSourceLine[]) {
  return lines.reduce((counts, line) => ({ additions: counts.additions + Number(line.kind === "add"), deletions: counts.deletions + Number(line.kind === "remove") }), { additions: 0, deletions: 0 });
}

export function numberEditorLines(lines: EditorSourceLine[], oldStart = 1, newStart = 1): EditorLine[] {
  let oldLine = oldStart;
  let newLine = newStart;
  return lines.map((line) => {
    if (line.kind === "remove") return { ...line, oldLine: oldLine++, newLine: null };
    if (line.kind === "add") return { ...line, oldLine: null, newLine: newLine++ };
    if (line.kind === "meta" || line.text === "⋯") return { ...line, oldLine: null, newLine: null };
    return { ...line, oldLine: oldLine++, newLine: newLine++ };
  });
}

export function parseUnifiedDiff(content: string): EditorDiffModel {
  const bounded = content.slice(0, contentLimit);
  const source = bounded.split("\n").slice(0, lineLimit);
  const lines: EditorLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  for (const raw of source) {
    if (!raw) continue;
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      oldLine = Number(hunk[1]); newLine = Number(hunk[2]);
    } else if (/^(?:diff --git |index |--- |\+\+\+ |(?:old|new|deleted file) mode |similarity index |rename (?:from|to) )/.test(raw)) {
      continue;
    } else if (raw.startsWith("+") && !raw.startsWith("+++")) {
      lines.push({ kind: "add", text: raw.slice(1), oldLine: null, newLine: newLine++ });
    } else if (raw.startsWith("-") && !raw.startsWith("---")) {
      lines.push({ kind: "remove", text: raw.slice(1), oldLine: oldLine++, newLine: null });
    } else if (raw.startsWith(" ")) {
      lines.push({ kind: "context", text: raw.slice(1), oldLine: oldLine++, newLine: newLine++ });
    } else {
      lines.push({ kind: "meta", text: raw, oldLine: null, newLine: null });
    }
  }
  return { lines, ...editorStats(lines), truncated: content.length > bounded.length || bounded.split("\n").length > lineLimit };
}

export function additionEditorModel(content: string): EditorDiffModel {
  const bounded = content.slice(0, contentLimit);
  const source = bounded.split("\n");
  const visible = source.slice(0, lineLimit).map((text) => ({ kind: "add" as const, text }));
  const lines = numberEditorLines(visible);
  return { lines, additions: lines.length, deletions: 0, truncated: content.length > bounded.length || source.length > lineLimit };
}
