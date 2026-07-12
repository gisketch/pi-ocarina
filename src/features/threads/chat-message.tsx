import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { MarkdownMessage } from "./markdown-message";
import type { ThreadMessage } from "@/shared/contracts/app";

export function ChatBubble({ role, children }: { role: "user" | "assistant"; children: ReactNode }) {
  return <div className={`pb-chat-message pb-chat-message-${role}`}>{role === "assistant" ? (typeof children === "string" ? <MarkdownMessage>{children}</MarkdownMessage> : children) : <p className="break-words">{children}</p>}</div>;
}

export function ToolCall({ tool, onOpenFile }: { tool: ThreadMessage; onOpenFile?: (path: string) => void }) {
  const content = preview(tool.output ?? tool.input);
  const path = typeof tool.input === "object" && tool.input && "path" in tool.input && typeof tool.input.path === "string" ? tool.input.path : "";
  return <details className="rounded-md border bg-card px-3 py-2 text-sm" data-testid="tool-call">
    <summary className="cursor-pointer font-medium">{tool.toolName ?? "Tool"} · {tool.status}{path && onOpenFile && <Button className="ml-2" size="sm" variant="ghost" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenFile(path); }}>Open in Changes</Button>}</summary>
    {content && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">{content}</pre>}
  </details>;
}

function preview(value: unknown) {
  if (value == null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > 4000 ? `${text.slice(0, 4000)}\n…` : text;
}
