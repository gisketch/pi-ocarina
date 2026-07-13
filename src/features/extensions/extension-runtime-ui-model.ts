import type { RuntimeNoticePayload } from "@/shared/contracts/agent";

const noticeStyle: Record<RuntimeNoticePayload["type"], string> = {
  info: "border-border bg-muted text-foreground",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function noticePresentation(type: RuntimeNoticePayload["type"]) {
  return { className: noticeStyle[type], role: type === "error" ? "alert" as const : "status" as const };
}
