import { Icon, XIcon } from "@/shared/ui/icon";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react";
import { invokeTauri } from "@/shared/lib/tauri-client";

import { extensionMentions, slashSuggestions, type ExtensionMention, type RuntimeCommand } from "./commands";
import { Button } from "@/shared/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { Textarea } from "@/shared/ui/textarea";
import { MatrixSpinner } from "@/shared/ui/cell-matrix";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { importAttachments, prepareAttachments, type Attachment } from "./attachments";
import type { Model } from "@/shared/contracts/app";

type ComposerProps = {
  workspaceId: string; value: string; running: boolean; disabled?: boolean;
  commands?: RuntimeCommand[]; extensions?: ExtensionMention[]; models: Model[]; model: Model | null;
  attachments?: Attachment[]; onAttachments: (value: Attachment[]) => void; onAttachmentError: (message: string) => void;
  thinkingLevel?: string; thinkingLevels?: string[]; onChange: (value: string) => void; onDraftBlur?: () => void;
  onSend: () => void; onSteer: () => void; onStop: () => void; onModelChange: (model: Model) => void; onThinkingChange: (level: string) => void;
};

export function Composer({ workspaceId, value, running, disabled, commands = [], extensions = [], models, model, attachments = [], onAttachments, onAttachmentError, onChange, onDraftBlur, onSend, onSteer, onStop, onModelChange }: ComposerProps) {
  const suggestions = slashSuggestions(value, commands);
  const mentions = extensionMentions(value, extensions);
  const [files, setFiles] = useState<string[]>([]);
  const fileQuery = value.match(/(?:^|\s)@([^\s@]*)$/)?.[1];
  useEffect(() => { if (fileQuery == null || mentions.length) { setFiles([]); return; } const timer = setTimeout(() => void invokeTauri("search_workspace_files", { workspaceId, query: fileQuery }).then(setFiles).catch(() => setFiles([])), 100); return () => clearTimeout(timer); }, [fileQuery, mentions.length, workspaceId]);
  return <form className="pb-composer pb-noisy-surface mx-auto w-full max-w-3xl rounded-md border border-border text-card-foreground" data-testid="composer" onSubmit={(event) => { event.preventDefault(); if (running) onSteer(); else onSend(); }}>
    {suggestions.length > 0 && <div className="rounded-md border bg-popover p-1" role="listbox" aria-label="Slash commands">
      {suggestions.map((command) => <Button className="w-full justify-start" key={`${"source" in command ? command.source : "host"}:${command.name}`} type="button" variant="ghost" role="option" onClick={() => onChange(`/${command.name} `)}>
        <span>/{command.name}</span><span className="ml-2 truncate text-muted-foreground">{command.description}</span>
      </Button>)}
    </div>}
    {mentions.length > 0 && <div className="rounded-md border bg-popover p-1" role="listbox" aria-label="Extension mentions">{mentions.map((extension) => <Button className="w-full justify-start" key={extension.source} type="button" variant="ghost" role="option" onClick={() => onChange(value.replace(/@[^\s]*$/, `@${extension.source} `))}>@{extension.label}</Button>)}</div>}
    {mentions.length === 0 && files.length > 0 && <div className="max-h-48 overflow-auto rounded-md border bg-popover p-1" role="listbox" aria-label="File mentions">{files.map((path) => <Button className="w-full justify-start" key={path} type="button" variant="ghost" role="option" onClick={() => onChange(value.replace(/@[^\s]*$/, `@${path} `))}>@{path}</Button>)}</div>}
    <div className="relative"><Textarea
      aria-label="Message"
      className="resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
      value={value}
      disabled={disabled}
      name="message"
      placeholder="Ask for follow-up changes"
      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
      onBlur={onDraftBlur}
      onPaste={(event: ClipboardEvent<HTMLTextAreaElement>) => {
        const files = Array.from(event.clipboardData.files);
        if (!files.length) return;
        event.preventDefault();
        void importAttachments(files).then((items) => onAttachments([...attachments, ...items])).catch((cause) => onAttachmentError(String(cause)));
      }}
      onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
          event.preventDefault();
          event.currentTarget.setSelectionRange(0, event.currentTarget.value.length);
          return;
        }
        if (event.key === "Escape" && running) { event.preventDefault(); onStop(); }
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (event.metaKey || event.ctrlKey) onSteer(); else onSend(); }
      }}
    /></div>
    {attachments.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Attachments">{attachments.map((item) => <span className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs" key={item.path}>{item.name}<Button aria-label={`Remove ${item.name}`} size="icon-xs" variant="ghost" onClick={() => onAttachments(attachments.filter((value) => value.path !== item.path))}><XIcon /></Button></span>)}</div>}
    <div className="pb-composer-footer mt-4 flex flex-wrap items-center gap-1">
      <Tooltip><TooltipTrigger asChild><Button aria-label="Add attachment" type="button" size="icon-lg" variant="ghost" disabled={disabled} onClick={() => void open({ multiple: true, directory: false }).then((paths) => Array.isArray(paths) && paths.length ? prepareAttachments(paths) : []).then((items) => items.length && onAttachments([...attachments, ...items])).catch((cause) => onAttachmentError(String(cause)))}><Icon name="plus" /></Button></TooltipTrigger><TooltipContent className={undefined}>Add attachment</TooltipContent></Tooltip>
      <div className="min-w-4 flex-1" />
      {running && <MatrixSpinner size={3} gap={1} label="Agent working" className="mx-2 text-muted-foreground" />}
      <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" disabled={running}><span>{model?.name ?? "Choose model"}</span><Icon name="chevron-down" size={16} className="text-muted-foreground" /></Button></DropdownMenuTrigger>
        {models.length > 0 && <DropdownMenuContent align="end" sideOffset={8} className="z-[100]">{models.map((item) => <DropdownMenuItem className={undefined} inset={false} key={`${item.provider}/${item.id}`} onSelect={() => onModelChange(item)}>{item.name}</DropdownMenuItem>)}</DropdownMenuContent>}
      </DropdownMenu>
      {running
        ? <Tooltip><TooltipTrigger asChild><Button type="button" size="icon-lg" variant="ghost" aria-label="Queue message" disabled={!value.trim() && !attachments.length} onClick={onSend}><Icon name="send" /></Button></TooltipTrigger><TooltipContent className={undefined}>Queue message</TooltipContent></Tooltip>
        : <Tooltip><TooltipTrigger asChild><Button type="button" size="icon-lg" variant="ghost" aria-label="Voice input coming later" aria-disabled="true"><Icon name="mic" /></Button></TooltipTrigger><TooltipContent className={undefined}>Voice input coming later</TooltipContent></Tooltip>}
      <Tooltip><TooltipTrigger asChild><Button type={running ? "button" : "submit"} size="icon-lg" variant={running ? "destructive" : "default"} aria-label={running ? "Stop agent" : "Send message"} disabled={!running && (disabled || (!value.trim() && !attachments.length) || !model)} onClick={running ? onStop : undefined}><Icon name={running ? "stop" : "send"} /></Button></TooltipTrigger><TooltipContent className={undefined}>{running ? "Stop agent" : "Send message"}</TooltipContent></Tooltip>
    </div>
  </form>;
}
