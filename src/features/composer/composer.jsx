// @ts-check
import { SendIcon, StopCircleIcon } from "lucide-react";

import { extensionMentions, slashSuggestions } from "./commands";
import { Button } from "@/shared/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { Textarea } from "@/shared/ui/textarea";

const DEFAULT_THINKING = ["off", "minimal", "low", "medium", "high", "xhigh"];

/** @param {{ value: string, running: boolean, disabled?: boolean, commands?: Array<any>, extensions?: Array<any>, models: Array<any>, model: any, thinkingLevel?: string, thinkingLevels?: string[], onChange: (value: string) => void, onSend: () => void, onStop: () => void, onModelChange: (model: any) => void, onThinkingChange: (level: string) => void }} props */
export function Composer({ value, running, disabled, commands = [], extensions = [], models, model, thinkingLevel = "medium", thinkingLevels = DEFAULT_THINKING, onChange, onSend, onStop, onModelChange, onThinkingChange }) {
  const suggestions = slashSuggestions(value, commands);
  const mentions = extensionMentions(value, extensions);
  return <div className="space-y-2" data-testid="composer">
    {suggestions.length > 0 && <div className="rounded-md border bg-popover p-1" role="listbox" aria-label="Slash commands">
      {suggestions.map((command) => <Button className="w-full justify-start" key={`${"source" in command ? command.source : "host"}:${command.name}`} type="button" variant="ghost" role="option" onClick={() => onChange(`/${command.name} `)}>
        <span>/{command.name}</span><span className="ml-2 truncate text-muted-foreground">{command.description}</span>
      </Button>)}
    </div>}
    {mentions.length > 0 && <div className="rounded-md border bg-popover p-1" role="listbox" aria-label="Extension mentions">{mentions.map((extension) => <Button className="w-full justify-start" key={extension.source} type="button" variant="ghost" role="option" onClick={() => onChange(value.replace(/@[^\s]*$/, `@${extension.source} `))}>@{extension.label}</Button>)}</div>}
    <Textarea
      aria-label="Message"
      className={undefined}
      value={value}
      disabled={disabled}
      placeholder="Ask Pi anything, use / for commands and skills"
      onChange={(/** @type {React.ChangeEvent<HTMLTextAreaElement>} */ event) => onChange(event.target.value)}
      onKeyDown={(/** @type {React.KeyboardEvent<HTMLTextAreaElement>} */ event) => {
        if (event.key === "Escape" && running) { event.preventDefault(); onStop(); }
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSend(); }
      }}
    />
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu><DropdownMenuTrigger render={<Button type="button" size="sm" variant="outline" disabled={running} />}>{model?.name ?? "Choose model"}</DropdownMenuTrigger>
        <DropdownMenuContent className={undefined}>{models.map((item) => <DropdownMenuItem className={undefined} inset={false} key={`${item.provider}/${item.id}`} onClick={() => onModelChange(item)}>{item.name}</DropdownMenuItem>)}</DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu><DropdownMenuTrigger render={<Button type="button" size="sm" variant="outline" disabled={running} />}>Thinking: {thinkingLevel}</DropdownMenuTrigger>
        <DropdownMenuContent className={undefined}>{thinkingLevels.map((level) => <DropdownMenuItem className={undefined} inset={false} key={level} onClick={() => onThinkingChange(level)}>{level}</DropdownMenuItem>)}</DropdownMenuContent>
      </DropdownMenu>
      <span className="text-xs text-muted-foreground">Enter sends · Shift+Enter adds a line{running ? " · Esc stops" : ""}</span>
      {running
        ? <Button className="ml-auto" type="button" variant="destructive" onClick={onStop}><StopCircleIcon />Stop</Button>
        : <Button className="ml-auto" type="button" disabled={disabled || !value.trim() || !model} onClick={onSend}><SendIcon />Send</Button>}
    </div>
  </div>;
}
