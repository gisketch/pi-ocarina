// @ts-check
import { Icon, XIcon } from "@/shared/ui/icon";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

import { extensionMentions, slashSuggestions } from "./commands";
import { Button } from "@/shared/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { Textarea } from "@/shared/ui/textarea";
import { CellMatrix } from "@/shared/ui/cell-matrix";
import { MatrixSpinner } from "@/shared/ui/cell-matrix";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { importAttachments, prepareAttachments } from "./attachments";

const DEFAULT_THINKING = ["off", "minimal", "low", "medium", "high", "xhigh"];

/** @param {{ textarea: HTMLTextAreaElement | null }} props */
function ComposerCaret({ textarea }) {
  const [position, setPosition] = useState({ left: 0, top: 0, visible: false });
  useEffect(() => {
    if (!textarea) return;
    const mirror = document.createElement("div"), marker = document.createElement("span");
    mirror.style.cssText = "position:fixed;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word";
    document.body.append(mirror);
    let frame = 0;
    const syncMirrorStyle = () => {
      const style = getComputedStyle(textarea);
      Object.assign(mirror.style, { width: `${textarea.clientWidth}px`, font: style.font, letterSpacing: style.letterSpacing, lineHeight: style.lineHeight, padding: style.padding, border: style.border });
    };
    const measure = () => {
      frame = 0;
      mirror.replaceChildren(document.createTextNode(textarea.value.slice(0, textarea.selectionStart)), marker);
      marker.textContent = textarea.value.slice(textarea.selectionStart, textarea.selectionStart + 1) || " ";
      const next = { left: marker.offsetLeft - textarea.scrollLeft, top: marker.offsetTop - textarea.scrollTop, visible: document.activeElement === textarea };
      setPosition((current) => current.left === next.left && current.top === next.top && current.visible === next.visible ? current : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(() => { syncMirrorStyle(); schedule(); });
    const events = ["input", "click", "select", "scroll", "focus", "blur"];
    syncMirrorStyle(); resize.observe(textarea); events.forEach((event) => textarea.addEventListener(event, schedule)); schedule();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); events.forEach((event) => textarea.removeEventListener(event, schedule)); mirror.remove(); };
  }, [textarea]);
  return position.visible ? <CellMatrix cells="11" columns={2} rows={1} glow={false} toneSeed="composer-caret" className="pb-composer-caret absolute" style={{ left: position.left, top: position.top }} /> : null;
}

/** @param {{ workspaceId: string, value: string, running: boolean, disabled?: boolean, commands?: Array<any>, extensions?: Array<any>, models: Array<any>, model: any, attachments?: Array<any>, onAttachments: (value: Array<any>) => void, onAttachmentError: (message: string) => void, thinkingLevel?: string, thinkingLevels?: string[], onChange: (value: string) => void, onDraftBlur?: () => void, onSend: () => void, onSteer: () => void, onStop: () => void, onModelChange: (model: any) => void, onThinkingChange: (level: string) => void }} props */
export function Composer({ workspaceId, value, running, disabled, commands = [], extensions = [], models, model, attachments = [], onAttachments, onAttachmentError, thinkingLevel = "medium", thinkingLevels = DEFAULT_THINKING, onChange, onDraftBlur, onSend, onSteer, onStop, onModelChange, onThinkingChange }) {
  const suggestions = slashSuggestions(value, commands);
  const mentions = extensionMentions(value, extensions);
  const [files, setFiles] = useState(/** @type {string[]} */ ([]));
  const [textarea, setTextarea] = useState(/** @type {HTMLTextAreaElement | null} */ (null));
  const fileQuery = value.match(/(?:^|\s)@([^\s@]*)$/)?.[1];
  useEffect(() => { if (fileQuery == null || mentions.length) { setFiles([]); return; } const timer = setTimeout(() => void invoke("search_workspace_files", { workspaceId, query: fileQuery }).then(setFiles).catch(() => setFiles([])), 100); return () => clearTimeout(timer); }, [fileQuery, mentions.length, workspaceId]);
  return <form className="pb-composer pb-noisy-surface mx-auto w-full max-w-4xl rounded-md border border-border text-card-foreground" data-testid="composer" onSubmit={(event) => { event.preventDefault(); running ? onSteer() : onSend(); }}>
    {suggestions.length > 0 && <div className="rounded-md border bg-popover p-1" role="listbox" aria-label="Slash commands">
      {suggestions.map((command) => <Button className="w-full justify-start" key={`${"source" in command ? command.source : "host"}:${command.name}`} type="button" variant="ghost" role="option" onClick={() => onChange(`/${command.name} `)}>
        <span>/{command.name}</span><span className="ml-2 truncate text-muted-foreground">{command.description}</span>
      </Button>)}
    </div>}
    {mentions.length > 0 && <div className="rounded-md border bg-popover p-1" role="listbox" aria-label="Extension mentions">{mentions.map((extension) => <Button className="w-full justify-start" key={extension.source} type="button" variant="ghost" role="option" onClick={() => onChange(value.replace(/@[^\s]*$/, `@${extension.source} `))}>@{extension.label}</Button>)}</div>}
    {mentions.length === 0 && files.length > 0 && <div className="max-h-48 overflow-auto rounded-md border bg-popover p-1" role="listbox" aria-label="File mentions">{files.map((path) => <Button className="w-full justify-start" key={path} type="button" variant="ghost" role="option" onClick={() => onChange(value.replace(/@[^\s]*$/, `@${path} `))}>@{path}</Button>)}</div>}
    <div className="relative"><Textarea
      ref={setTextarea}
      aria-label="Message"
      className="border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
      value={value}
      disabled={disabled}
      name="message"
      placeholder="Ask for follow-up changes"
      onChange={(/** @type {React.ChangeEvent<HTMLTextAreaElement>} */ event) => onChange(event.target.value)}
      onBlur={onDraftBlur}
      onPaste={(/** @type {React.ClipboardEvent<HTMLTextAreaElement>} */ event) => {
        const files = Array.from(event.clipboardData.files);
        if (!files.length) return;
        event.preventDefault();
        void importAttachments(files).then((items) => onAttachments([...attachments, ...items])).catch((cause) => onAttachmentError(String(cause)));
      }}
      onKeyDown={(/** @type {React.KeyboardEvent<HTMLTextAreaElement>} */ event) => {
        if (event.key === "Escape" && running) { event.preventDefault(); onStop(); }
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.metaKey || event.ctrlKey ? onSteer() : onSend(); }
      }}
    /><ComposerCaret textarea={textarea} /></div>
    {attachments.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Attachments">{attachments.map((item) => <span className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs" key={item.path}>{item.name}<Button aria-label={`Remove ${item.name}`} size="icon-xs" variant="ghost" onClick={() => onAttachments(attachments.filter((value) => value.path !== item.path))}><XIcon /></Button></span>)}</div>}
    <div className="pb-composer-footer mt-4 flex flex-wrap items-center gap-1">
      <Tooltip><TooltipTrigger asChild><Button aria-label="Add attachment" type="button" size="icon-lg" variant="ghost" disabled={disabled} onClick={() => void open({ multiple: true, directory: false }).then((paths) => paths?.length ? prepareAttachments(paths) : []).then((items) => items.length && onAttachments([...attachments, ...items])).catch((cause) => onAttachmentError(String(cause)))}><Icon name="plus" /></Button></TooltipTrigger><TooltipContent className={undefined}>Add attachment</TooltipContent></Tooltip>
      <div className="min-w-4 flex-1" />
      {running && <MatrixSpinner size={3} gap={1} label="Agent working" className="mx-2 text-muted-foreground" />}
      <DropdownMenu><DropdownMenuTrigger render={<Button type="button" variant="ghost" disabled={running} />}><span>{model?.name ?? "Choose model"}</span><Icon name="chevron-down" size={16} className="text-muted-foreground" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={undefined}>{models.map((item) => <DropdownMenuItem className={undefined} inset={false} key={`${item.provider}/${item.id}`} onClick={() => onModelChange(item)}>{item.name}</DropdownMenuItem>)}</DropdownMenuContent>
      </DropdownMenu>
      {running
        ? <Tooltip><TooltipTrigger asChild><Button type="button" size="icon-lg" variant="ghost" aria-label="Queue message" disabled={!value.trim() && !attachments.length} onClick={onSend}><Icon name="send" /></Button></TooltipTrigger><TooltipContent className={undefined}>Queue message</TooltipContent></Tooltip>
        : <Tooltip><TooltipTrigger asChild><Button type="button" size="icon-lg" variant="ghost" aria-label="Voice input coming later" aria-disabled="true" onClick={() => textarea?.focus()}><Icon name="mic" /></Button></TooltipTrigger><TooltipContent className={undefined}>Voice input coming later</TooltipContent></Tooltip>}
      <Tooltip><TooltipTrigger asChild><Button type={running ? "button" : "submit"} size="icon-lg" variant={running ? "destructive" : "default"} aria-label={running ? "Stop agent" : "Send message"} disabled={!running && (disabled || (!value.trim() && !attachments.length) || !model)} onClick={running ? onStop : undefined}><Icon name={running ? "stop" : "send"} /></Button></TooltipTrigger><TooltipContent className={undefined}>{running ? "Stop agent" : "Send message"}</TooltipContent></Tooltip>
    </div>
  </form>;
}
