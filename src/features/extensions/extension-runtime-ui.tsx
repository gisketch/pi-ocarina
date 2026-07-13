import type { ChangeEvent } from "react";

import type { RuntimeNoticePayload, RuntimePromptPayload } from "@/shared/contracts/agent";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { noticePresentation } from "./extension-runtime-ui-model";

export function ExtensionNotice({ notice, onDismiss }: { notice: RuntimeNoticePayload; onDismiss: () => void }) {
  const presentation = noticePresentation(notice.type);
  return <div className={`flex items-center justify-between gap-3 rounded-md border p-3 text-sm ${presentation.className}`} role={presentation.role}>
    <p>{notice.message}</p>
    <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>
  </div>;
}

export function ExtensionPromptDialog({ prompt, value, onValueChange, onResolve }: {
  prompt: RuntimePromptPayload | null;
  value: string;
  onValueChange: (value: string) => void;
  onResolve: (cancelled: boolean) => void;
}) {
  return <Dialog open={Boolean(prompt)} onOpenChange={(open: boolean) => { if (!open) onResolve(true); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{prompt?.title || "Extension request"}</DialogTitle>{prompt?.message && <DialogDescription>{prompt.message}</DialogDescription>}</DialogHeader>
      {prompt?.kind === "select" && <select aria-label={prompt.title || "Extension selection"} className="h-9 rounded-md border bg-background px-3 text-sm" value={value} onChange={(event: ChangeEvent<HTMLSelectElement>) => onValueChange(event.target.value)}>{prompt.options?.map((option) => <option key={option}>{option}</option>)}</select>}
      {prompt?.kind === "editor" && <Textarea aria-label={prompt.title || "Extension editor"} className="min-h-48 font-mono" value={value} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onValueChange(event.target.value)} />}
      {prompt?.kind === "input" && <Input aria-label={prompt.title || "Extension input"} type="text" value={value} onChange={(event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value)} />}
      <DialogFooter><Button variant="outline" onClick={() => onResolve(true)}>Cancel</Button><Button onClick={() => onResolve(false)}>{prompt?.kind === "confirm" ? "Confirm" : "Continue"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
