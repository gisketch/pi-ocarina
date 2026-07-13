import { useLayoutEffect, useRef } from "react";

import { BookOpenIcon, CpuIcon, RobotIcon, TerminalIcon } from "@/shared/ui/icon";
import { Button } from "@/shared/ui/button";
import { skillName, type RuntimeCommand, type SkillMention } from "./commands";

export type ComposerSuggestion =
  | { kind: "command"; command: RuntimeCommand }
  | { kind: "skill"; skill: SkillMention };

type ComposerSuggestionMenuProps = {
  id: string;
  label: string;
  options: ComposerSuggestion[];
  selectedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (option: ComposerSuggestion) => void;
};

export function ComposerSuggestionMenu({ id, label, options, selectedIndex, onHighlight, onSelect }: ComposerSuggestionMenuProps) {
  const activeOptionRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    activeOptionRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return <div
    id={id}
    className="absolute inset-x-0 bottom-[calc(100%+.5rem)] z-[100] max-h-72 overflow-y-auto overscroll-contain rounded-md border bg-[var(--pb-noisy-surface-background)] p-1 shadow-md"
    data-slot="dropdown-menu-content"
    role="listbox"
    aria-label={label}
  >
    {options.map((option, index) => <Button
      ref={index === selectedIndex ? activeOptionRef : null}
      id={`${id}-${index}`}
      aria-selected={index === selectedIndex}
      data-active={index === selectedIndex}
      className="grid w-full grid-cols-[1rem_auto_minmax(0,1fr)] justify-start gap-2 text-left"
      effects="row-highlight"
      key={suggestionKey(option)}
      type="button"
      variant="ghost"
      role="option"
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => onHighlight(index)}
      onClick={() => onSelect(option)}
    >
      {option.kind === "command"
        ? <><CommandIcon command={option.command} /><span>/{option.command.name}</span><span className="truncate text-muted-foreground">{option.command.description}</span></>
        : <><BookOpenIcon /><span>${skillName(option.skill)}</span><span className="truncate text-muted-foreground">{option.skill.description}</span></>}
    </Button>)}
  </div>;
}

function suggestionKey(option: ComposerSuggestion) {
  return option.kind === "command"
    ? `${option.command.source ?? "host"}:${option.command.name}`
    : option.skill.path ?? option.skill.aliases[0];
}

function CommandIcon({ command }: { command: RuntimeCommand }) {
  if (command.mode === "model" || command.name === "model") return <RobotIcon />;
  if (command.mode === "thinking" || command.name === "thinking") return <CpuIcon />;
  return <TerminalIcon />;
}
