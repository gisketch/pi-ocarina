import { useEffect, useState } from "react";
import { ChevronRightIcon } from "@/shared/ui/icon";
import { AnimatedProceduralAvatar } from "@/shared/ui/cell-matrix";
import { Typewriter } from "@/shared/ui/typewriter";
import type { RunMetadata, ThreadMessage } from "@/shared/contracts/app";
import { MarkdownMessage } from "./markdown-message";
import { ToolCall } from "./chat-message";
import { presentRun, runDisclosureLabel } from "./run-presentation";

export function RunDisclosure({ metadata, messages, onOpenFile }: { metadata: RunMetadata; messages: ThreadMessage[]; onOpenFile?: (path: string) => void }) {
  const active = metadata.endedAt === undefined;
  const [open, setOpen] = useState(active);
  const [handoffReady, setHandoffReady] = useState(!active);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) { setOpen(false); const timer = setTimeout(() => setHandoffReady(true), 240); return () => clearTimeout(timer); }
    setHandoffReady(false);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const presentation = presentRun(messages, handoffReady);
  const label = runDisclosureLabel(metadata, now);
  return <div className="pb-run-block" data-active={active}>
    <button className="pb-run-summary" type="button" aria-expanded={open} aria-live="polite" onClick={() => setOpen((value) => !value)}>{active && <AnimatedProceduralAvatar seed={metadata.runId} color="currentColor" running />}<Typewriter onceKey={metadata.runId} trailing={<ChevronRightIcon className="pb-run-chevron" />}>{label}</Typewriter></button>
    <div className="pb-run-details" data-open={open}><div className="pb-run-details-inner">{presentation.process.map((message, index) => message.role === "tool"
      ? <ToolCall key={message.toolCallId ?? index} tool={message} {...(onOpenFile ? { onOpenFile } : {})} />
      : <div className={message.role === "thinking" ? "pb-run-thinking" : "pb-run-commentary"} key={message.contentKey ?? index}>{message.role === "thinking" && <span className="sr-only">Provider reasoning summary</span>}<MarkdownMessage>{message.text ?? ""}</MarkdownMessage></div>)}</div></div>
    {presentation.final.map((message, index) => <div className="pb-chat-message pb-chat-message-assistant" key={message.contentKey ?? index}><MarkdownMessage>{message.text ?? ""}</MarkdownMessage></div>)}
  </div>;
}
