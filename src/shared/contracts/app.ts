export type Preferences = {
  theme: "dark";
  transparency: boolean;
  sidebar_visible: boolean;
  reviewer_width?: number;
  terminal_shell?: string;
  terminal_height?: number;
  terminal_maximized?: boolean;
};

export type Workspace = {
  id: string;
  path: string;
  name?: string | null;
  root_workspace_id?: string | null;
  branch?: string | null;
};

export type WorkspaceState = {
  workspaces: Workspace[];
  selected_workspace: string | null;
  preferences?: Preferences;
  windows?: Record<string, WorkspaceProjection & { workspace_id?: string | null; workspace_views?: Record<string, WorkspaceProjection> }>;
};

export type WorkspaceProjection = {
  revision?: number;
  active_thread_id?: string | null;
  session_file?: string | null;
  run_status?: string;
  draft?: string;
  drafts?: Record<string, string>;
  attachments?: Attachment[];
  draft_attachments?: Record<string, Attachment[]>;
  scroll_positions?: Record<string, number>;
  thread_metadata?: ThreadMetadata;
};

export type AppState = WorkspaceState & { preferences: Preferences };
export type AppStateSnapshot = { state: AppState };

export type Model = { provider: string; id: string; name: string; available?: boolean; input?: string[]; reasoning?: boolean };
export type Provider = { id: string; name: string; configured: boolean; source?: string; label?: string };
export type CustomEndpoint = { id: string; name: string; baseUrl: string; credentialReference: string; models: Array<{ id: string; name: string }> };
export type ModelCatalog = { providers: Provider[]; models: Model[]; customEndpoints?: CustomEndpoint[]; errors: string[] };

export function isModelCatalog(value: unknown): value is ModelCatalog {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.providers) && Array.isArray(record.models) && Array.isArray(record.errors);
}

export type Attachment = { path: string; name: string; size: number; kind: "image" | "file" };
export type ThreadMetadata = Record<string, { pin_order?: number; archived?: boolean; read_message_count?: number }>;
export type ThreadMessage = { role: string; text?: string | undefined; toolCallId?: string | undefined; toolName?: string | undefined; status?: string | undefined; input?: unknown; output?: unknown };
export type ThreadCommand = { name: string; description?: string; source?: string; mode?: string; extensionPath?: string };
export type ThreadSkill = { path: string; aliases: string[]; description: string; source: string; available: boolean };
export type ThreadExtension = { source: string; label: string; scope: string; managed: boolean; enabled: boolean };
export type Thread = {
  threadId: string; sessionFile: string; title?: string; messages: ThreadMessage[]; model?: Model | null;
  thinkingLevel?: string; thinkingLevels?: string[]; commands?: ThreadCommand[]; skills?: ThreadSkill[]; extensions?: ThreadExtension[];
  schema?: { fileVersion?: number; runtimeVersion: number; newer: boolean }; runStatus?: string; editorText?: string;
};
export type ThreadSummary = { threadId?: string; sessionFile: string; title: string; modified?: string; messageCount?: number };
export type QueueItem = { prompt?: string; attachments?: Attachment[]; mode?: "steer" | "followUp"; [key: string]: unknown };
export type ThreadTreeNode = { entryId: string; parentId?: string; type: string; role?: string; preview?: string; active?: boolean; children: ThreadTreeNode[] };

export const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
export function isThread(value: unknown): value is Thread { return isRecord(value) && typeof value.threadId === "string" && typeof value.sessionFile === "string" && Array.isArray(value.messages); }
export function isThreadSummary(value: unknown): value is ThreadSummary { return isRecord(value) && typeof value.sessionFile === "string" && typeof value.title === "string"; }
