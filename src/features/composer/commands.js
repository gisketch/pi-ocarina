// @ts-check

export const HOST_COMMANDS = [
  { name: "model", description: "Choose the model for this session", mode: "model" },
  { name: "thinking", description: "Set the reasoning level", mode: "thinking" },
];

/** @param {Array<{ name: string, description?: string, source?: string }>} runtime */
export function mergeCommands(runtime = []) {
  const seen = new Set();
  return [...runtime, ...HOST_COMMANDS].filter(({ name }) => {
    const key = name.replace(/^\/+/, "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** @param {string} value @param {Array<{ name: string, description?: string, source?: string, mode?: string }>} commands */
export function slashSuggestions(value, commands) {
  if (!value.startsWith("/") || value.includes("\n")) return [];
  const query = value.slice(1).toLowerCase();
  return mergeCommands(commands).filter(({ name }) => name.toLowerCase().startsWith(query));
}

/** @param {string} value @returns {{type: "thinking", value: string} | {type: "model", provider: string, id: string} | null} */
export function parseComposerControl(value) {
  const [command, argument = ""] = value.trim().split(/\s+/, 2);
  if (command === "/thinking" && argument) return { type: "thinking", value: argument };
  if (command === "/model" && argument.includes("/")) {
    const [provider, ...id] = argument.split("/");
    if (provider && id.length) return { type: "model", provider, id: id.join("/") };
  }
  return null;
}
