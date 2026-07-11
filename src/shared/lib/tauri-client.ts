import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isAppStateSnapshot, isRecord, isWorkspaceState } from "@/shared/contracts/app";
import type { TauriCommandMap, TauriEventMap } from "@/shared/contracts/tauri";

const workspaceCommands = new Set<keyof TauriCommandMap>(["add_workspace", "select_workspace", "rename_workspace", "remove_workspace", "register_worktree", "remove_worktree"]);

function validateCommandResult(command: keyof TauriCommandMap, value: unknown) {
  if (command === "app_state_snapshot" && !isAppStateSnapshot(value)) throw new Error("Invalid app state response");
  if (workspaceCommands.has(command) && !isWorkspaceState(value)) throw new Error(`Invalid ${command} response`);
  if (command === "open_terminal" && typeof value !== "string") throw new Error("Invalid terminal response");
  if (["search_workspace_files", "prepare_attachments", "repository_changes", "workspace_files"].includes(command) && !Array.isArray(value)) throw new Error(`Invalid ${command} response`);
  return value;
}

function validateEvent<K extends keyof TauriEventMap>(event: K, value: unknown): TauriEventMap[K] {
  if (event === "app-state://changed" && !isWorkspaceState(value)) throw new Error("Invalid app state event");
  if (event === "terminal://output" && (!isRecord(value) || typeof value.terminalId !== "string" || typeof value.data !== "string")) throw new Error("Invalid terminal output event");
  if (event === "terminal://error" && (!isRecord(value) || typeof value.message !== "string")) throw new Error("Invalid terminal error event");
  if (event === "terminal://closed" && (!isRecord(value) || typeof value.terminalId !== "string")) throw new Error("Invalid terminal close event");
  return value as TauriEventMap[K];
}

export function invokeTauri<K extends keyof TauriCommandMap>(
  command: K,
  args?: TauriCommandMap[K]["args"],
): Promise<TauriCommandMap[K]["result"]> {
  return invoke<unknown>(command, args).then((value) => validateCommandResult(command, value) as TauriCommandMap[K]["result"]);
}

export function listenTauri<K extends keyof TauriEventMap>(
  event: K,
  handler: (event: { payload: TauriEventMap[K] }) => void,
): Promise<UnlistenFn> {
  return listen<unknown>(event, ({ payload }) => handler({ payload: validateEvent(event, payload) }));
}
