import { CpuIcon, Icon, RobotIcon, XIcon } from "@/shared/ui/icon";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { invokeTauri } from "@/shared/lib/tauri-client";

import { extensionMentions, nextSuggestionIndex, replaceComposerTrigger, skillName, skillSuggestions, slashSuggestions, type ExtensionMention, type RuntimeCommand } from "./commands";
import { Button } from "@/shared/ui/button";
import { ComposerEditor } from "./composer-editor";
import { ComposerSuggestionMenu, type ComposerSuggestion } from "./composer-suggestion-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { MatrixSpinner } from "@/shared/ui/cell-matrix";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { importAttachments, prepareAttachments, type Attachment } from "./attachments";
import type { Model, ThreadSkill } from "@/shared/contracts/app";

const composerSuggestionMenuId = "composer-suggestions";

type ComposerProps = {
  workspaceId: string; value: string; running: boolean; disabled?: boolean;
  commands?: RuntimeCommand[]; extensions?: ExtensionMention[]; models: Model[]; model: Model | null;
  skills?: ThreadSkill[];
  attachments?: Attachment[]; onAttachments: (value: Attachment[]) => void; onAttachmentError: (message: string) => void;
  thinkingLevel?: string; thinkingLevels?: string[]; onChange: (value: string) => void; onDraftBlur?: () => void;
  onSend: () => void; onSteer: () => void; onStop: () => void; onModelChange: (model: Model) => void; onThinkingChange: (level: string) => void;
};

export function Composer({ workspaceId, value, running, disabled, commands = [], skills = [], extensions = [], models, model, attachments = [], thinkingLevel, thinkingLevels = [], onAttachments, onAttachmentError, onChange, onDraftBlur, onSend, onSteer, onStop, onModelChange, onThinkingChange }: ComposerProps) {
  const [cursor, setCursor] = useState(value.length);
  const suggestions = slashSuggestions(value, commands, cursor);
  const suggestedSkills = skillSuggestions(value, skills, cursor);
  const menuOptions = [...suggestions.map((command) => ({ kind: "command" as const, command })), ...suggestedSkills.map((skill) => ({ kind: "skill" as const, skill }))];
  const [selection, setSelection] = useState({ key: "", index: 0 });
  const [dismissedSuggestionKey, setDismissedSuggestionKey] = useState<string | null>(null);
  const selectionKey = `${value}:${cursor}`;
  const selectedIndex = selection.key === selectionKey ? Math.min(selection.index, Math.max(0, menuOptions.length - 1)) : 0;
  const suggestionsOpen = menuOptions.length > 0 && dismissedSuggestionKey !== selectionKey;
  const mentions = extensionMentions(value, extensions);
  const effortLevels = thinkingLevels.length ? thinkingLevels : model?.thinkingLevels ?? [];
  const [files, setFiles] = useState<string[]>([]);
  const fileQuery = value.match(/(?:^|\s)@([^\s@]*)$/)?.[1];
  useEffect(() => { if (fileQuery == null || mentions.length) { setFiles([]); return; } const timer = setTimeout(() => void invokeTauri("search_workspace_files", { workspaceId, query: fileQuery }).then(setFiles).catch(() => setFiles([])), 100); return () => clearTimeout(timer); }, [fileQuery, mentions.length, workspaceId]);
  return <form className="pb-composer pb-noisy-surface relative mx-auto w-full max-w-3xl rounded-md border border-border text-card-foreground" data-testid="composer" onSubmit={(event) => { event.preventDefault(); if (running) onSteer(); else onSend(); }}>
    {suggestionsOpen && <ComposerSuggestionMenu id={composerSuggestionMenuId} label={suggestedSkills.length ? "Skills" : "Slash commands"} options={menuOptions} selectedIndex={selectedIndex} onHighlight={(index) => setSelection({ key: selectionKey, index })} onSelect={insertSuggestion} />}
    {mentions.length > 0 && <div className="max-h-48 overflow-y-auto overscroll-contain rounded-md border bg-popover p-1" role="listbox" aria-label="Extension mentions">{mentions.map((extension) => <Button className="w-full justify-start" key={extension.source} type="button" variant="ghost" role="option" onClick={() => onChange(value.replace(/@[^\s]*$/, `@${extension.source} `))}>@{extension.label}</Button>)}</div>}
    {mentions.length === 0 && files.length > 0 && <div className="max-h-48 overflow-y-auto overscroll-contain rounded-md border bg-popover p-1" role="listbox" aria-label="File mentions">{files.map((path) => <Button className="w-full justify-start" key={path} type="button" variant="ghost" role="option" onClick={() => onChange(value.replace(/@[^\s]*$/, `@${path} `))}>@{path}</Button>)}</div>}
    <div className="relative"><ComposerEditor
      value={value}
      cursor={cursor}
      skills={skills}
      disabled={disabled}
      placeholder="Ask for follow-up changes"
      suggestionsOpen={suggestionsOpen}
      suggestionMenuId={composerSuggestionMenuId}
      activeSuggestionId={suggestionsOpen ? `${composerSuggestionMenuId}-${selectedIndex}` : undefined}
      onChange={(next, nextCursor) => { setCursor(nextCursor); onChange(next); }}
      onCursor={setCursor}
      onBlur={onDraftBlur}
      onPaste={(event: ClipboardEvent<HTMLDivElement>) => {
        const files = Array.from(event.clipboardData.files);
        if (!files.length || event.clipboardData.getData("text/plain")) return;
        event.preventDefault();
        void importAttachments(files).then((items) => onAttachments([...attachments, ...items])).catch((cause) => onAttachmentError(String(cause)));
      }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (suggestionsOpen && event.key === "Escape") {
          event.preventDefault();
          setDismissedSuggestionKey(selectionKey);
          return;
        }
        if (suggestionsOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          event.preventDefault();
          setSelection({ key: selectionKey, index: nextSuggestionIndex(selectedIndex, event.key === "ArrowDown" ? 1 : -1, menuOptions.length) });
          return;
        }
        if (suggestionsOpen && (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey))) {
          event.preventDefault();
          const option = menuOptions[selectedIndex];
          if (option) insertSuggestion(option);
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
      <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" disabled={running}><span>{model?.name ?? "Choose model"}</span>{thinkingLevel && <span className="text-muted-foreground">{labelEffort(thinkingLevel)}</span>}<Icon name="chevron-down" size={16} className="text-muted-foreground" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="z-[100] min-w-64">
          <DropdownMenuSub><DropdownMenuSubTrigger className="grid grid-cols-[1rem_auto_minmax(0,1fr)_1rem]"><RobotIcon /><span>Model</span><span className="truncate text-right text-muted-foreground">{model?.name ?? "Choose model"}</span></DropdownMenuSubTrigger><DropdownMenuSubContent className="min-w-56"><DropdownMenuRadioGroup value={model ? `${model.provider}/${model.id}` : ""} onValueChange={(value) => { const next = models.find((item) => `${item.provider}/${item.id}` === value); if (next) onModelChange(next); }}>{models.map((item) => <DropdownMenuRadioItem key={`${item.provider}/${item.id}`} value={`${item.provider}/${item.id}`}>{item.name}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuSubContent></DropdownMenuSub>
          <DropdownMenuSub><DropdownMenuSubTrigger className="grid grid-cols-[1rem_auto_minmax(0,1fr)_1rem]" disabled={!effortLevels.length}><CpuIcon /><span>Effort</span><span className="truncate text-right text-muted-foreground">{thinkingLevel ? labelEffort(thinkingLevel) : "Default"}</span></DropdownMenuSubTrigger><DropdownMenuSubContent className="min-w-44"><DropdownMenuRadioGroup value={thinkingLevel ?? ""} onValueChange={onThinkingChange}>{effortLevels.map((level) => <DropdownMenuRadioItem key={level} value={level}>{labelEffort(level)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuSubContent></DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
      {running
        ? <Tooltip><TooltipTrigger asChild><Button type="button" size="icon-lg" variant="ghost" aria-label="Queue message" disabled={!value.trim() && !attachments.length} onClick={onSend}><Icon name="send" /></Button></TooltipTrigger><TooltipContent className={undefined}>Queue message</TooltipContent></Tooltip>
        : <Tooltip><TooltipTrigger asChild><Button type="button" size="icon-lg" variant="ghost" aria-label="Voice input coming later" aria-disabled="true"><Icon name="mic" /></Button></TooltipTrigger><TooltipContent className={undefined}>Voice input coming later</TooltipContent></Tooltip>}
      <Tooltip><TooltipTrigger asChild><Button type={running ? "button" : "submit"} size="icon-lg" variant={running ? "destructive" : "default"} aria-label={running ? "Stop agent" : "Send message"} disabled={!running && (disabled || (!value.trim() && !attachments.length) || !model)} onClick={running ? onStop : undefined}><Icon name={running ? "stop" : "send"} /></Button></TooltipTrigger><TooltipContent className={undefined}>{running ? "Stop agent" : "Send message"}</TooltipContent></Tooltip>
    </div>
  </form>;

  function insertSuggestion(option: ComposerSuggestion) {
    const label = option.kind === "command" ? `/${option.command.name} ` : `$${skillName(option.skill)} `;
    const next = replaceComposerTrigger(value, cursor, label);
    setCursor(next.cursor);
    onChange(next.value);
  }
}

function labelEffort(level: string) { return level.charAt(0).toUpperCase() + level.slice(1); }
