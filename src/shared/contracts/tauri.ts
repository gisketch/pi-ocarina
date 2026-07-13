import type { AgentHostRequest } from "./agent";
import type { AppState, AppStateSnapshot, Attachment, Model, Preferences, Workspace, WorkspaceProjection, WorkspaceState } from "./app";

export type ChangedFile = { path: string; status: string };
export type FileDiff = { content: string; binary: boolean };
export type WorkspaceFile = { path: string; reviewed: boolean };
export type OpenWorkspaceFile = WorkspaceFile & FileDiff;

export type TauriCommandMap = {
  start_agent_host: { args: undefined; result: void };
  send_agent_request: { args: { request: AgentHostRequest }; result: void };
  app_state_snapshot: { args: undefined; result: AppStateSnapshot };
  set_preferences: { args: { preferences: Preferences }; result: { preferences: Preferences } };
  appearance_support: { args: undefined; result: { transparency: boolean } };
  system_font_families: { args: undefined; result: { families: string[] } };
  set_workspace_projection: { args: { workspaceId: string; projection: WorkspaceProjection }; result: void };
  add_workspace: { args: { path: string }; result: WorkspaceState };
  select_workspace: { args: { workspaceId: string }; result: WorkspaceState };
  rename_workspace: { args: { workspaceId: string; name: string }; result: WorkspaceState };
  remove_workspace: { args: { workspaceId: string }; result: WorkspaceState };
  reveal_workspace: { args: { workspaceId: string }; result: void };
  create_worktree: { args: { rootWorkspaceId: string }; result: { workspace: Workspace } };
  register_worktree: { args: { workspace: Workspace }; result: WorkspaceState };
  rollback_worktree: { args: { workspace: Workspace }; result: void };
  remove_worktree: { args: { workspaceId: string }; result: WorkspaceState };
  model_selection: { args: { workspaceId: string }; result: { scope: string; model: Model | null } };
  set_model_scope: { args: { workspaceId: string; scope: string }; result: { scope: string; model: Model | null } };
  set_model_preference: { args: { workspaceId: string; model: Pick<Model, "provider" | "id"> }; result: { scope: string; model: Model | null } };
  search_workspace_files: { args: { workspaceId: string; query: string }; result: string[] };
  prepare_attachments: { args: { paths: string[] }; result: Attachment[] };
  import_attachment: { args: { name: string; bytes: number[] }; result: Attachment };
  open_external_url: { args: { url: string }; result: void };
  open_notification_settings: { args: undefined; result: void };
  open_terminal: { args: { workspaceId: string; cols: number; rows: number }; result: string };
  close_terminal: { args: { terminalId: string }; result: void };
  write_terminal: { args: { terminalId: string; data: string }; result: void };
  resize_terminal: { args: { terminalId: string; cols: number; rows: number }; result: void };
  set_terminal_shell: { args: { shell: string }; result: void };
  set_panel_layout: { args: { terminalHeight?: number; terminalMaximized?: boolean; reviewerWidth?: number }; result: void };
  repository_changes: { args: { workspaceId: string }; result: ChangedFile[] };
  file_diff: { args: { workspaceId: string; path: string }; result: FileDiff };
  workspace_files: { args: { workspaceId: string }; result: WorkspaceFile[] };
  read_workspace_file: { args: { workspaceId: string; path: string }; result: OpenWorkspaceFile };
  set_file_reviewed: { args: { workspaceId: string; path: string; reviewed: boolean }; result: void };
  reveal_skill: { args: { workspace: string; path: string }; result: void };
};

export type TauriEventMap = {
  "agent-host-event": unknown;
  "app-state://changed": AppState;
  "workspace://open-picker": undefined;
  "terminal://output": { terminalId: string; data: string };
  "terminal://error": { message: string };
  "terminal://closed": { terminalId: string };
};
