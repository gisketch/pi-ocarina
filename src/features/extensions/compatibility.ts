import type { RuntimeCommand } from "@/features/composer/commands";

export type CompatibilityIssue = { capability?: string | undefined; message: string };
export type CompatibilityRecords = Record<string, CompatibilityIssue>;

/** @param {string} workspaceId */
export function loadCompatibility(workspaceId: string): CompatibilityRecords {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`extension-compatibility:${workspaceId}`) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value as CompatibilityRecords : {};
  }
  catch { return {}; }
}

export function saveCompatibility(workspaceId: string, records: CompatibilityRecords) {
  localStorage.setItem(`extension-compatibility:${workspaceId}`, JSON.stringify(records));
}

export function blockedCommand(prompt: string, commands: RuntimeCommand[] = [], records: CompatibilityRecords = {}) {
  const name = prompt.trim().match(/^\/([^\s]+)/)?.[1];
  const command = commands.find((item) => item.source === "extension" && item.name === name);
  return command ? records[`${command.extensionPath ?? "unknown"}::${command.name}`] : undefined;
}
