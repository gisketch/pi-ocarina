export function pendingThreadFile(value: string | null, workspaceId: string) {
  if (!value) return undefined;
  try {
    const target: unknown = JSON.parse(value);
    if (!target || typeof target !== "object") return undefined;
    const record = target as Record<string, unknown>;
    return record.workspaceId === workspaceId && typeof record.sessionFile === "string" ? record.sessionFile : undefined;
  } catch {
    return undefined;
  }
}
