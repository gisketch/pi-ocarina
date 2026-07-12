import { Button } from "@/shared/ui/button";
import { CheckIcon, ChevronRightIcon, CircleIcon, FileDiffIcon, FolderOpenIcon, PencilIcon, SearchIcon, TerminalIcon, XIcon } from "@/shared/ui/icon";
import { MatrixSpinner } from "@/shared/ui/cell-matrix";
import { useButtonField } from "@/shared/ui/button-field";
import type { ThreadMessage } from "@/shared/contracts/app";
import { presentTool, type ToolDetail, type ToolStatus } from "./tool-presentation";

export function ToolCall({ tool, onOpenFile, defaultOpen = false }: { tool: ThreadMessage; onOpenFile?: (path: string) => void; defaultOpen?: boolean }) {
  const presentation = presentTool(tool);
  const summaryRef = useButtonField<HTMLElement>();
  return <details className={`group/tool pb-tool-call pb-tool-call-${presentation.status}`} data-testid="tool-call" open={defaultOpen || undefined}>
    <summary ref={summaryRef} className="pb-button-interaction pb-tool-summary" data-effects="default">
      <span className="pb-tool-kind-icon"><ToolIcon name={presentation.name} /></span>
      <span className="min-w-0 flex-1 truncate"><span className="font-medium">{presentation.verb}</span>{presentation.subject && <> <span className="text-muted-foreground">{presentation.subject}</span></>}</span>
      <span className="sr-only">{presentation.status}</span>
      <StatusIcon status={presentation.status} />
      {presentation.detail.kind !== "none" && <ChevronRightIcon className="text-muted-foreground transition-transform group-open/tool:rotate-90" />}
    </summary>
    {presentation.detail.kind !== "none" && <div className="pb-tool-details">
      {presentation.path && onOpenFile && <Button className="mb-2" size="sm" variant="ghost" onClick={() => onOpenFile(presentation.path ?? "")}><FileDiffIcon />Open in Changes</Button>}
      <ToolDetails detail={presentation.detail} />
    </div>}
  </details>;
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
  if (status === "running") return <span className="pb-tool-status-icon grid size-4 place-items-center"><MatrixSpinner className="text-inherit" size={2} gap={1} label="Tool running" /></span>;
  if (status === "failed") return <XIcon className="pb-tool-status-icon" />;
  return <CheckIcon className="pb-tool-status-icon" />;
}

function ToolDetails({ detail }: { detail: Exclude<ToolDetail, { kind: "none" }> }) {
  if (detail.kind === "terminal") return <div className="pb-tool-terminal"><div className="pb-tool-detail-header"><TerminalIcon /><code>{detail.command}</code></div><ToolPre content={detail.content || "(no output)"} truncated={detail.truncated} /></div>;
  if (detail.kind === "code") return <div className="pb-tool-code"><div className="pb-tool-detail-header"><FileDiffIcon /><code>{detail.path}</code></div><ToolPre content={detail.content || "(empty file)"} truncated={detail.truncated} /></div>;
  if (detail.kind === "diff") return <div className="pb-tool-code"><div className="pb-tool-detail-header"><FileDiffIcon /><code>{detail.path}</code></div><pre className="pb-tool-pre">{detail.lines.map((line, index) => <span className={`pb-tool-diff-${line.kind}`} key={`${index}-${line.text}`}><span aria-hidden>{line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " "}</span>{line.text}{"\n"}</span>)}</pre>{detail.truncated && <p className="pb-tool-truncated">Output truncated</p>}</div>;
  if (detail.kind === "list") return <ToolPre content={detail.content || "(no results)"} truncated={detail.truncated} />;
  return <div className="space-y-2">{detail.fields.length > 0 && <dl className="pb-tool-fields">{detail.fields.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}{detail.content && <ToolPre content={detail.content} truncated={detail.truncated} />}</div>;
}

function ToolPre({ content, truncated }: { content: string; truncated: boolean }) {
  return <><pre className="pb-tool-pre">{content}</pre>{truncated && <p className="pb-tool-truncated">Output truncated</p>}</>;
}
