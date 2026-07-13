import { highlightCode } from "@/shared/lib/code-highlight";
import { numberEditorLines, type EditorLine, type EditorSourceLine } from "./editor-model";

export function EditorDiff({ lines, path, truncated = false, density = "compact" }: { lines: EditorSourceLine[] | EditorLine[]; path: string; truncated?: boolean; density?: "compact" | "workbench" }) {
  const numbered = lines.length > 0 && "oldLine" in lines[0]! ? lines as EditorLine[] : numberEditorLines(lines as EditorSourceLine[]);
  return <div className="pb-editor" data-density={density}><pre className="pb-tool-pre pb-tool-diff"><span className="pb-tool-diff-canvas">{numbered.map((line, index) => <span className={`pb-tool-diff-${line.kind}`} key={`${index}-${line.text}`}><span className="pb-tool-line-number" aria-hidden>{line.oldLine ?? line.newLine ?? ""}</span><HighlightedCode content={line.text} path={path} />{"\n"}</span>)}</span></pre>{truncated && <p className="pb-tool-truncated">Output truncated</p>}</div>;
}

export function EditorCode({ content, path, truncated = false, density = "compact" }: { content: string; path: string; truncated?: boolean; density?: "compact" | "workbench" }) {
  return <div className="pb-editor" data-density={density}><pre className="pb-tool-pre"><HighlightedCode content={content || "(empty file)"} path={path} /></pre>{truncated && <p className="pb-tool-truncated">Output truncated</p>}</div>;
}

function HighlightedCode({ content, path }: { content: string; path: string }) {
  const highlighted = highlightCode(content, path);
  return highlighted === undefined ? <code>{content}</code> : <code dangerouslySetInnerHTML={{ __html: highlighted }} />;
}
