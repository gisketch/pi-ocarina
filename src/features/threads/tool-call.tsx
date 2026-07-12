import { Button } from "@/shared/ui/button";
import { CheckIcon, ChevronRightIcon, CircleIcon, CopyIcon, FileDiffIcon, FolderOpenIcon, PencilIcon, SearchIcon, TerminalIcon, XIcon } from "@/shared/ui/icon";
import { MatrixSpinner } from "@/shared/ui/cell-matrix";
import { useButtonField } from "@/shared/ui/button-field";
import { useEffect, useReducer } from "react";
import type { ThreadMessage } from "@/shared/contracts/app";
import { highlightCode } from "./code-highlight";
import { initialToolDisclosure, reduceToolDisclosure } from "./tool-disclosure";
import { diffStats, numberDiffLines, presentTool, type ToolDetail, type ToolStatus } from "./tool-presentation";

export function ToolCall({ tool, onOpenFile, defaultOpen = false }: { tool: ThreadMessage; onOpenFile?: (path: string) => void; defaultOpen?: boolean }) {
  const presentation = presentTool(tool);
  const summaryRef = useButtonField<HTMLButtonElement>();
  const [disclosure, updateDisclosure] = useReducer(reduceToolDisclosure, defaultOpen, initialToolDisclosure);
  const progressive = (presentation.status === "preparing" || presentation.status === "running") && ["write", "edit", "bash"].includes(presentation.name.toLowerCase()) && presentation.detail.kind !== "none";
  useEffect(() => { updateDisclosure({ type: "activity", active: progressive }); }, [progressive]);
  return <div className={`pb-tool-call pb-tool-call-${presentation.status}`} data-testid="tool-call" data-open={disclosure.open}>
    <button ref={summaryRef} className="pb-button-interaction pb-tool-summary" data-effects="default" type="button" aria-expanded={disclosure.open} onClick={() => updateDisclosure({ type: "user-toggle" })}>
      <span className="pb-tool-kind-icon"><ToolIcon name={presentation.name} /></span>
      <span className="min-w-0 flex-1 truncate"><span className="font-medium">{presentation.verb}</span>{presentation.subject && <> <span className="text-muted-foreground">{presentation.subject}</span></>}</span>
      <span className="sr-only">{presentation.status}</span>
      <StatusIcon status={presentation.status} />
      {presentation.detail.kind !== "none" && <ChevronRightIcon className="pb-tool-chevron text-muted-foreground" />}
    </button>
    {presentation.detail.kind !== "none" && <div className="pb-tool-details-shell"><div className="pb-tool-details-clip"><div className="pb-tool-details">
      <ToolDetails detail={presentation.detail} {...(onOpenFile ? { onOpenFile } : {})} />
    </div></div></div>}
  </div>;
}

function ToolIcon({ name }: { name: string }) {
  if (name === "bash") return <TerminalIcon />;
  if (name === "edit") return <PencilIcon />;
  if (name === "read" || name === "write") return <FileDiffIcon />;
  if (name === "grep" || name === "find") return <SearchIcon />;
  if (name === "ls") return <FolderOpenIcon />;
  return <CircleIcon />;
}

function StatusIcon({ status }: { status: ToolStatus }) {
  if (status === "preparing" || status === "running") return <span className="pb-tool-status-icon grid size-4 place-items-center"><MatrixSpinner className="text-inherit" size={2} gap={1} label={status === "preparing" ? "Tool preparing" : "Tool running"} /></span>;
  if (status === "failed") return <XIcon className="pb-tool-status-icon" />;
  return <CheckIcon className="pb-tool-status-icon" />;
}

function ToolDetails({ detail, onOpenFile }: { detail: Exclude<ToolDetail, { kind: "none" }>; onOpenFile?: (path: string) => void }) {
  if (detail.kind === "terminal") return <div className="pb-tool-terminal"><div className="pb-tool-detail-header"><TerminalIcon /><code>{detail.command}</code></div><ToolPre content={detail.content || "(no output)"} truncated={detail.truncated} /></div>;
  if (detail.kind === "code") return <div className="pb-tool-code"><FileHeader path={detail.path} copyContent={detail.content} {...(onOpenFile ? { onOpenFile } : {})} /><CodePre content={detail.content || "(empty file)"} path={detail.path} truncated={detail.truncated} /></div>;
  if (detail.kind === "diff") {
    const stats = diffStats(detail.lines);
    const content = detail.lines.map((line) => `${line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " "}${line.text}`).join("\n");
    return <div className="pb-tool-code"><FileHeader path={detail.path} copyContent={content} {...(onOpenFile ? { onOpenFile } : {})} {...stats} /><pre className="pb-tool-pre pb-tool-diff">{numberDiffLines(detail.lines).map((line, index) => <span className={`pb-tool-diff-${line.kind}`} key={`${index}-${line.text}`}><span className="pb-tool-line-number" aria-hidden>{line.oldLine ?? line.newLine ?? ""}</span><HighlightedCode content={line.text} path={detail.path} />{"\n"}</span>)}</pre>{detail.truncated && <p className="pb-tool-truncated">Output truncated</p>}</div>;
  }
  if (detail.kind === "list") return <ToolPre content={detail.content || "(no results)"} truncated={detail.truncated} />;
  return <div className="space-y-2">{detail.fields.length > 0 && <dl className="pb-tool-fields">{detail.fields.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}{detail.content && <ToolPre content={detail.content} truncated={detail.truncated} />}</div>;
}

function FileHeader({ path, copyContent, onOpenFile, additions, deletions }: { path: string; copyContent: string; onOpenFile?: (path: string) => void; additions?: number; deletions?: number }) {
  const filename = path.split("/").at(-1) || path;
  return <div className="pb-tool-detail-header">
    {onOpenFile ? <button className="pb-tool-file-link min-w-0 truncate" type="button" title={path} onClick={() => onOpenFile(path)}>{filename}</button> : <span className="min-w-0 truncate" title={path}>{filename}</span>}
    {additions !== undefined && <span className="pb-tool-diff-additions">+{additions}</span>}
    {deletions !== undefined && <span className="pb-tool-diff-deletions">-{deletions}</span>}
    <Button className="ml-auto" size="icon-xs" variant="ghost" aria-label={`Copy ${filename}`} onClick={() => void navigator.clipboard.writeText(copyContent).catch(() => {})}><CopyIcon /></Button>
  </div>;
}

function ToolPre({ content, truncated }: { content: string; truncated: boolean }) {
  return <><pre className="pb-tool-pre">{content}</pre>{truncated && <p className="pb-tool-truncated">Output truncated</p>}</>;
}

function CodePre({ content, path, truncated }: { content: string; path: string; truncated: boolean }) {
  return <><pre className="pb-tool-pre"><HighlightedCode content={content} path={path} /></pre>{truncated && <p className="pb-tool-truncated">Output truncated</p>}</>;
}

function HighlightedCode({ content, path }: { content: string; path: string }) {
  const highlighted = highlightCode(content, path);
  return highlighted === undefined ? <code>{content}</code> : <code dangerouslySetInnerHTML={{ __html: highlighted }} />;
}
