export type RuntimeCommand = { name: string; description?: string; source?: string; mode?: string; extensionPath?: string };
export type ExtensionMention = { source: string; enabled: boolean; label: string };

export const HOST_COMMANDS = [
  { name: "model", description: "Choose the model for this session", mode: "model" },
  { name: "thinking", description: "Set the reasoning level", mode: "thinking" },
] satisfies RuntimeCommand[];

/** @param {Array<{ name: string, description?: string, source?: string }>} runtime */
export function mergeCommands(runtime: RuntimeCommand[] = []) {
  const seen = new Set<string>();
  return [...runtime, ...HOST_COMMANDS].filter(({ name }) => {
    const key = name.replace(/^\/+/, "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** @param {string} value @param {Array<{ name: string, description?: string, source?: string, mode?: string }>} commands */
export function slashSuggestions(value: string, commands: RuntimeCommand[]) {
  if (!value.startsWith("/") || value.includes("\n")) return [];
  const query = value.slice(1).toLowerCase();
  return mergeCommands(commands).filter(({ name }) => name.toLowerCase().startsWith(query));
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
