import { isModelCatalog, isRecord, isThread, isThreadSummary, isWorkspaceResources, type Attachment, type ModelCatalog, type QueueItem, type RunOutcome, type Thread, type ThreadSummary, type ThreadTreeNode, type WorkspaceResources } from "./app";

export type ToolLifecycleStatus = "preparing" | "running" | "completed" | "failed";
export type ToolCallPayload = { threadId: string; runId?: string | undefined; toolCallId?: string | undefined; toolName?: string | undefined; status?: ToolLifecycleStatus | undefined; input?: unknown; output?: unknown };
export type RunEventPayload = { threadId: string; runId: string; kind: "start" | "turnStart" | "content" | "end"; timestamp?: number; turn?: number; message?: number; contentIndex?: number; contentKind?: "thinking" | "text"; text?: string; phase?: "commentary" | "final_answer"; outcome?: RunOutcome };
export type RuntimePromptPayload = { threadId: string; promptId: string; kind: "select" | "confirm" | "input" | "editor"; title?: string | undefined; message?: string | undefined; options?: string[] | undefined };
export type AgentStreamEvent =
  | { version: 1; requestId: string; type: "messageDelta"; payload: { threadId: string; delta: string } }
  | { version: 1; requestId: string; type: "runEvent"; payload: RunEventPayload }
  | { version: 1; requestId: string; type: "toolCall"; payload: ToolCallPayload }
  | { version: 1; requestId: string; type: "runtimePrompt"; payload: RuntimePromptPayload }
  | { version: 1; requestId: string; type: "runtimeNotice"; payload: { threadId: string; type: "info" | "warning" | "error"; message: string } }
  | { version: 1; requestId: string; type: "editorText"; payload: { threadId: string; mode: "append" | "replace"; text: string } }
  | { version: 1; requestId: string; type: "extensionDock"; payload: { threadId: string; kind: string; key?: string | undefined; value?: unknown } }
  | { version: 1; requestId: string; type: "compatibilityIssue"; payload: { threadId: string; extensionPath: string; commandName: string; capability?: string | undefined; message: string } }
  | { version: 1; requestId: string; type: "sessionChanged"; payload: Thread };

export type AgentHostEvent =
  | { version: 1; requestId: string; type: "started"; payload: Record<string, unknown> }
  | { version: 1; requestId: string; type: "completed"; payload: unknown }
  | { version: 1; requestId: string; type: "failed" | "cancelled"; payload: { message?: string } }
  | { version: 1; requestId: string; type: "catalog"; payload: ModelCatalog }
  | AgentStreamEvent;

const string = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`Invalid agent-host ${key}`);
  return value;
};
const optionalString = (record: Record<string, unknown>, key: string) => typeof record[key] === "string" ? record[key] as string : undefined;
const optionalToolStatus = (record: Record<string, unknown>) => {
  const status = optionalString(record, "status");
  if (status === undefined) return undefined;
  if (!["preparing", "running", "completed", "failed"].includes(status)) throw new Error("Invalid agent-host tool status");
  return status as ToolLifecycleStatus;
};

export function parseAgentHostEvent(value: unknown): AgentHostEvent {
  if (!isRecord(value) || value.version !== 1 || typeof value.requestId !== "string" || typeof value.type !== "string") throw new Error("Invalid agent-host event envelope");
  const base = { version: 1 as const, requestId: value.requestId };
  if (value.type === "completed") return { ...base, type: "completed", payload: value.payload };
  if (value.type === "failed" || value.type === "cancelled") {
    if (!isRecord(value.payload)) throw new Error("Invalid agent-host failure payload");
    const message = optionalString(value.payload, "message");
    return { ...base, type: value.type, payload: { ...(message === undefined ? {} : { message }) } };
  }
  if (value.type === "catalog") {
    if (!isModelCatalog(value.payload)) throw new Error("Invalid agent-host catalog payload");
    return { ...base, type: "catalog", payload: value.payload };
  }
  if (!isRecord(value.payload)) throw new Error("Invalid agent-host event payload");
  const payload = value.payload;
  if (value.type === "started") return { ...base, type: "started", payload };
  const threadId = string(payload, "threadId");
  switch (value.type) {
    case "messageDelta": return { ...base, type: value.type, payload: { threadId, delta: string(payload, "delta") } };
    case "runEvent": {
      const kind = string(payload, "kind");
      if (!["start", "turnStart", "content", "end"].includes(kind)) throw new Error("Invalid run event kind");
      const phase = optionalString(payload, "phase");
      const contentKind = optionalString(payload, "contentKind");
      const outcome = optionalString(payload, "outcome");
      return { ...base, type: value.type, payload: { threadId, runId: string(payload, "runId"), kind: kind as RunEventPayload["kind"], ...(typeof payload.timestamp === "number" ? { timestamp: payload.timestamp } : {}), ...(typeof payload.turn === "number" ? { turn: payload.turn } : {}), ...(typeof payload.message === "number" ? { message: payload.message } : {}), ...(typeof payload.contentIndex === "number" ? { contentIndex: payload.contentIndex } : {}), ...(contentKind === "thinking" || contentKind === "text" ? { contentKind } : {}), ...(typeof payload.text === "string" ? { text: payload.text } : {}), ...(phase === "commentary" || phase === "final_answer" ? { phase } : {}), ...(outcome && ["completed", "stopped", "failed", "interrupted"].includes(outcome) ? { outcome: outcome as RunOutcome } : {}) } };
    }
    case "toolCall": {
      const status = optionalToolStatus(payload);
      return { ...base, type: value.type, payload: { threadId, ...(optionalString(payload, "runId") ? { runId: optionalString(payload, "runId") } : {}), ...(optionalString(payload, "toolCallId") ? { toolCallId: optionalString(payload, "toolCallId") } : {}), ...(optionalString(payload, "toolName") ? { toolName: optionalString(payload, "toolName") } : {}), ...(status ? { status } : {}), input: payload.input, output: payload.output } };
    }
    case "runtimePrompt": {
      const kind = string(payload, "kind");
      if (!["select", "confirm", "input", "editor"].includes(kind)) throw new Error("Invalid runtime prompt kind");
      const options = Array.isArray(payload.options) && payload.options.every((item) => typeof item === "string") ? payload.options : undefined;
      return { ...base, type: value.type, payload: { threadId, promptId: string(payload, "promptId"), kind: kind as RuntimePromptPayload["kind"], ...(optionalString(payload, "title") ? { title: optionalString(payload, "title") } : {}), ...(optionalString(payload, "message") ? { message: optionalString(payload, "message") } : {}), ...(options ? { options } : {}) } };
    }
    case "runtimeNotice": {
      const noticeType = string(payload, "type");
      if (!["info", "warning", "error"].includes(noticeType)) throw new Error("Invalid runtime notice type");
      return { ...base, type: value.type, payload: { threadId, type: noticeType as "info" | "warning" | "error", message: string(payload, "message") } };
    }
    case "editorText": return { ...base, type: value.type, payload: { threadId, mode: string(payload, "mode") === "append" ? "append" : "replace", text: string(payload, "text") } };
    case "extensionDock": return { ...base, type: value.type, payload: { threadId, kind: string(payload, "kind"), ...(optionalString(payload, "key") ? { key: optionalString(payload, "key") } : {}), value: payload.value } };
    case "compatibilityIssue": return { ...base, type: value.type, payload: { threadId, extensionPath: string(payload, "extensionPath"), commandName: string(payload, "commandName"), message: string(payload, "message"), ...(optionalString(payload, "capability") ? { capability: optionalString(payload, "capability") } : {}) } };
    case "sessionChanged": {
      if (!isThread(payload)) throw new Error("Invalid session change payload");
      return { ...base, type: value.type, payload };
    }
    default: throw new Error(`Unsupported agent-host event: ${value.type}`);
  }
}

export type AgentOperationMap = {
  createSession: { payload: Record<string, never>; result: Record<string, unknown> };
  workspaceResources: { payload: { cwd: string }; result: WorkspaceResources };
  cancel: { payload: { requestId: string }; result: { cancelled: string } };
  createThread: { payload: { cwd: string; provider: string; modelId: string; thinkingLevel?: string }; result: Thread };
  listThreads: { payload: { cwd: string }; result: ThreadSummary[] };
  openThread: { payload: { cwd: string; sessionFile: string }; result: Thread };
  recoverThread: { payload: { cwd: string; threadId: string; sessionFile: string }; result: Thread };
  refreshThread: { payload: { cwd: string; threadId: string; sessionFile: string }; result: Thread };
  watchThread: { payload: { threadId: string }; result: Record<string, unknown> };
  promptThread: { payload: { threadId: string; prompt: string; attachments: Attachment[] }; result: Thread };
  queueThread: { payload: { threadId: string; prompt: string; attachments: Attachment[]; mode: "steer" | "followUp" }; result: { items: QueueItem[] } };
  replaceThreadQueue: { payload: { threadId: string; items: QueueItem[] }; result: { items: QueueItem[] } };
  threadQueue: { payload: { threadId: string }; result: { items: QueueItem[] } };
  setThreadModel: { payload: { threadId: string; provider: string; modelId: string }; result: Thread };
  setThreadThinking: { payload: { threadId: string; thinkingLevel: string }; result: Thread };
  generateThreadTitle: { payload: { threadId: string; prompt: string }; result: { title?: string } };
  renameThread: { payload: { threadId: string; title: string }; result: { title: string } };
  reloadResources: { payload: { threadId: string }; result: Thread };
  setExtensionEnabled: { payload: { threadId: string; source: string; enabled: boolean }; result: Thread };
  getThreadTree: { payload: { threadId: string }; result: { nodes: ThreadTreeNode[] } };
  forkThread: { payload: { threadId: string; entryId: string; cwd: string }; result: Thread };
  navigateThread: { payload: { threadId: string; entryId: string; summarize: boolean }; result: Thread };
  resolveRuntimePrompt: { payload: { promptId: string; threadId: string; value?: unknown; cancelled: boolean }; result: { resolved: string } };
  watchCatalog: { payload: { workspaceId?: string }; result: Record<string, unknown> };
  saveProviderCredential: { payload: { provider: string; apiKey?: string }; result: ModelCatalog };
  saveCustomEndpoint: { payload: Record<string, unknown>; result: ModelCatalog };
  deleteCustomEndpoint: { payload: Record<string, unknown>; result: ModelCatalog };
};

export type AgentOperation = keyof AgentOperationMap;
export type AgentPayload<K extends AgentOperation> = AgentOperationMap[K]["payload"];
export type AgentResult<K extends AgentOperation> = AgentOperationMap[K]["result"];
export type AgentHostRequest<K extends AgentOperation = AgentOperation> = {
  version: 1;
  requestId: string;
  operation: K;
  payload: AgentPayload<K>;
};

export function parseAgentResult<K extends AgentOperation>(operation: K, value: unknown): AgentResult<K> {
  const threadOperations: AgentOperation[] = ["createThread", "openThread", "recoverThread", "refreshThread", "promptThread", "setThreadModel", "setThreadThinking", "reloadResources", "setExtensionEnabled", "forkThread", "navigateThread"];
  if (threadOperations.includes(operation)) {
    if (!isThread(value)) throw new Error(`Invalid ${operation} response`);
  } else if (operation === "listThreads") {
    if (!Array.isArray(value) || !value.every(isThreadSummary)) throw new Error("Invalid listThreads response");
  } else if (operation === "workspaceResources") {
    if (!isWorkspaceResources(value)) throw new Error("Invalid workspaceResources response");
  } else if (["queueThread", "replaceThreadQueue", "threadQueue"].includes(operation)) {
    if (!isRecord(value) || !Array.isArray(value.items)) throw new Error(`Invalid ${operation} response`);
  } else if (!isRecord(value)) throw new Error(`Invalid ${operation} response`);
  return value as AgentResult<K>;
}
