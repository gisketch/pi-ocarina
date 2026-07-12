import type { ReactNode } from "react";
import { MarkdownMessage } from "./markdown-message";
export { ToolCall } from "./tool-call";

export function ChatBubble({ role, children }: { role: "user" | "assistant"; children: ReactNode }) {
  return <div className={`pb-chat-message pb-chat-message-${role}`}>{role === "assistant" ? (typeof children === "string" ? <MarkdownMessage>{children}</MarkdownMessage> : children) : <p className="break-words">{children}</p>}</div>;
}
