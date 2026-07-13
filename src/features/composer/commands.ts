export type RuntimeCommand = { name: string; description?: string; source?: string; mode?: string; extensionPath?: string };
export type ExtensionMention = { source: string; enabled: boolean; label: string };
export type SkillMention = { aliases: string[]; description?: string; available: boolean; path?: string };

export const HOST_COMMANDS: RuntimeCommand[] = [
  { name: "model", description: "Choose the model for this session", mode: "model" },
  { name: "thinking", description: "Set the reasoning level", mode: "thinking" },
];

/** @param {Array<{ name: string, description?: string, source?: string }>} runtime */
export function mergeCommands(runtime: RuntimeCommand[] = []) {
  const seen = new Set<string>();
  return [...runtime, ...HOST_COMMANDS].filter(({ name, source }) => {
    if (source === "skill" || name.startsWith("skill:")) return false;
    const key = name.replace(/^\/+/, "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function skillSuggestions(value: string, skills: SkillMention[] = [], cursor = value.length) {
  const trigger = activeComposerTrigger(value, cursor);
  if (trigger?.prefix !== "$") return [];
  const query = trigger.query.toLowerCase();
  return skills.filter((skill) => skill.available && skillName(skill).toLowerCase().startsWith(query));
}

export function skillName(skill: SkillMention) {
  return (skill.aliases[0] ?? "").replace(/^skill:/, "").replace(/^\$/, "");
}

export function skillTokenRanges(value: string, skills: SkillMention[] = [], includeTerminal = false) {
  const available = new Map(skills.filter(({ available }) => available).map((skill) => [skillName(skill).toLowerCase(), skill]));
  return [...value.matchAll(/(?:^|\s)\$([^\s]+)/g)].flatMap((match) => {
    const name = match[1] ?? "";
    const skill = available.get(name.toLowerCase());
    const start = (match.index ?? 0) + (match[0].startsWith("$") ? 0 : 1);
    const end = start + name.length + 1;
    return skill && ((end < value.length && /\s/.test(value[end] ?? "")) || (includeTerminal && end === value.length)) ? [{ start, end, name: skillName(skill) }] : [];
  });
}

export function deleteSkillTokenAt(value: string, cursor: number, direction: "backward" | "forward", skills: SkillMention[] = []) {
  const target = skillTokenRanges(value, skills, true).find((range) => direction === "backward" ? cursor === range.end || cursor === range.end + 1 : cursor === range.start);
  if (!target) return null;
  const end = /\s/.test(value[target.end] ?? "") ? target.end + 1 : target.end;
  return { value: `${value.slice(0, target.start)}${value.slice(end)}`, cursor: target.start };
}

export function expandSkillInvocation(value: string, skills: SkillMention[] = []) {
  const match = value.match(/(?:^|\s)\$([^\s]+)/);
  if (!match) return value;
  const name = match[1] ?? "";
  const skill = skills.find((item) => item.available && skillName(item).toLowerCase() === name.toLowerCase());
  if (!skill || match.index == null) return value;
  const start = match.index + (match[0].startsWith("$") ? 0 : 1);
  const args = [value.slice(0, start).trim(), value.slice(start + name.length + 1).trim()].filter(Boolean).join(" ");
  return `/skill:${skillName(skill)}${args ? ` ${args}` : ""}`;
}

export function nextSuggestionIndex(current: number, direction: -1 | 1, count: number) {
  return count ? (current + direction + count) % count : 0;
}

/** @param {string} value @param {Array<{ name: string, description?: string, source?: string, mode?: string }>} commands */
export function slashSuggestions(value: string, commands: RuntimeCommand[], cursor = value.length) {
  const trigger = activeComposerTrigger(value, cursor);
  if (trigger?.prefix !== "/") return [];
  const query = trigger.query.toLowerCase();
  return mergeCommands(commands).filter(({ name }) => name.toLowerCase().startsWith(query));
}

export function activeComposerTrigger(value: string, cursor: number) {
  const end = Math.max(0, Math.min(cursor, value.length));
  const match = value.slice(0, end).match(/(?:^|\s)([/$])([^\s]*)$/);
  if (!match) return null;
  const prefix = match[1] as "/" | "$";
  const query = match[2] ?? "";
  return { prefix, query, start: end - query.length - 1, end };
}

export function replaceComposerTrigger(value: string, cursor: number, replacement: string) {
  const trigger = activeComposerTrigger(value, cursor);
  if (!trigger) return { value, cursor };
  const suffix = value.slice(trigger.end);
  const inserted = replacement.endsWith(" ") && suffix.startsWith(" ") ? replacement.slice(0, -1) : replacement;
  const next = `${value.slice(0, trigger.start)}${inserted}${suffix}`;
  return { value: next, cursor: trigger.start + inserted.length };
}

export function expandCommandInvocation(value: string, commands: RuntimeCommand[] = []) {
  const names = new Set(mergeCommands(commands).map(({ name }) => name.toLowerCase()));
  const match = [...value.matchAll(/(?:^|\s)\/([^\s]+)/g)].find((item) => names.has((item[1] ?? "").toLowerCase()));
  if (!match || match.index == null || match.index === 0) return value;
  const name = match[1] ?? "";
  const start = match.index + 1;
  const args = [value.slice(0, start).trim(), value.slice(start + name.length + 1).trim()].filter(Boolean).join(" ");
  return `/${name}${args ? ` ${args}` : ""}`;
}

/** Extension mentions intentionally precede future file mentions.
 * @param {string} value @param {Array<{source: string, enabled: boolean, label: string}>} extensions */
export function extensionMentions(value: string, extensions: ExtensionMention[] = []) {
  const match = value.match(/(?:^|\s)@([^\s]*)$/);
  if (!match) return [];
  const query = match[1]?.toLowerCase() ?? "";
  return extensions.filter(({ enabled, label }) => enabled && label.toLowerCase().includes(query));
}

/** @param {string} value @returns {{type: "thinking", value: string} | {type: "model", provider: string, id: string} | null} */
export function parseComposerControl(value: string): { type: "thinking"; value: string } | { type: "model"; provider: string; id: string } | null {
  const [command, argument = ""] = value.trim().split(/\s+/, 2);
  if (command === "/thinking" && argument) return { type: "thinking", value: argument };
  if (command === "/model" && argument.includes("/")) {
    const [provider, ...id] = argument.split("/");
    if (provider && id.length) return { type: "model", provider, id: id.join("/") };
  }
  return null;
}
