import { getCurrentWindow } from "@tauri-apps/api/window";
import { requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { ArchiveIcon, ArrowDownIcon, ArrowUpIcon, FolderFilledIcon, FolderGit2Icon, FolderOpenIcon, GitBranchIcon, ListTreeIcon, MessageSquarePlusIcon, MoreHorizontalIcon, PencilIcon, PinIcon, PlusIcon, RefreshCwIcon, RotateCcwIcon, SettingsIcon, Trash2Icon } from "@/shared/ui/icon";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { invokeTauri, listenTauri } from "@/shared/lib/tauri-client";

import { Button } from "@/shared/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup, useResizablePanelRef } from "@/shared/ui/resizable";
import { Input } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Composer } from "@/features/composer/composer";
import { projectColor, projectColorVariables } from "@/features/appearance/project-color";
import { ChangesPanel } from "@/features/review/changes-panel";
import { expandCommandInvocation, expandSkillInvocation, parseComposerControl } from "@/features/composer/commands";
import { importAttachments, type Attachment } from "@/features/composer/attachments";
import { ExtensionDock } from "@/features/extensions/extension-dock-panel";
import { EMPTY_DOCK, reduceDock, type DockState } from "@/features/extensions/extension-dock.js";
import { blockedCommand, loadCompatibility, saveCompatibility, type CompatibilityRecords } from "@/features/extensions/compatibility.js";
import { notificationCategories, shouldNotify, shouldRequestPermission } from "@/features/notifications/notification-policy.js";
import { Textarea } from "@/shared/ui/textarea";
import { AnimatedProceduralAvatar } from "@/shared/ui/cell-matrix";
import { MarkdownMessage } from "./markdown-message";
import { ChatBubble, ToolCall } from "./chat-message";
import { RunDisclosure } from "./run-disclosure";
import { reduceRunEvent, reduceRunTool, settleLiveRun, type LiveRun } from "./run-presentation";
import { TranscriptViewport } from "./transcript-viewport";
import { isThreadUnread, markThreadRead, movePinned, organizeThreads, togglePinned } from "./thread-organization";
import { createCoalescedTask } from "./coalesced-task";
import { cachedThreadSummaries, cachedWorkspaceThreads, cacheThreadSummaries } from "./thread-summary-cache";
import { pendingNewThread, pendingThreadFile as pendingThreadHandoff } from "./thread-navigation";
import { requestAgent } from "@/shared/lib/agent-client";
import { reconcileToolMessages, settleActiveToolMessages } from "./tool-presentation";
import type { AgentStreamEvent, RuntimePromptPayload, ToolCallPayload } from "@/shared/contracts/agent";
import type { Model, QueueItem, Thread, ThreadMessage as Message, ThreadMetadata, ThreadSummary, ThreadTreeNode, Workspace, WorkspaceResources } from "@/shared/contracts/app";

export type WorkspaceSidebarActions = {
  collapsedWorkspaceIds: ReadonlySet<string>;
  onToggleWorkspace: (workspaceId: string) => void;
  canCreateWorktree: boolean;
  onRenameWorkspace: (workspace: Workspace) => void;
  onRevealWorkspace: (workspace: Workspace) => void;
  onCreateWorktree: (workspace: Workspace) => void;
  onRemoveWorkspace: (workspace: Workspace) => void;
};

export function ThreadRunner({ workspace, workspaces, models, model, workspaceActions, changesOpen, onChangesOpenChange, changesTreeVisible, onModelChange, onThreadTitleChange, onOpenWorkspace, onOpenSettings, onSelectWorkspace, sidebarVisible = true }: { workspace: Workspace; workspaces: Workspace[]; models: Model[]; model: Model | null; workspaceActions: WorkspaceSidebarActions; changesOpen: boolean; onChangesOpenChange: (open: boolean) => void; changesTreeVisible: boolean; onModelChange: (model: Model | null) => void; onThreadTitleChange: (title: string) => void; onOpenWorkspace: () => void; onOpenSettings: () => void; onSelectWorkspace: (workspaceId: string) => Promise<boolean>; sidebarVisible?: boolean }) {
  const windowLabel = getCurrentWindow().label;
  const [thread, setThread] = useState<Thread | null>(null);
  const [workspaceResources, setWorkspaceResources] = useState<WorkspaceResources>({ commands: [], skills: [], extensions: [] });
  const [threads, setThreads] = useState<ThreadSummary[]>(() => cachedThreadSummaries(workspace.id));
  const [workspaceThreads, setWorkspaceThreads] = useState<Record<string, ThreadSummary[]>>(() => cachedWorkspaceThreads(workspaces.map(({ id }) => id)));
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [stream, setStream] = useState("");
  const [liveRun, setLiveRun] = useState<LiveRun | null>(null);
  const [error, setError] = useState("");
  const [runningThreads, setRunningThreads] = useState(new Set<string>());
  const [attentionThreads, setAttentionThreads] = useState(new Set<string>());
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [runtimePrompt, setRuntimePrompt] = useState<RuntimePromptPayload | null>(null);
  const [runtimeValue, setRuntimeValue] = useState("");
  const [notice, setNotice] = useState("");
  const compatibilityRef = useRef<CompatibilityRecords>(loadCompatibility(workspace.id));
  const [newThinking, setNewThinking] = useState("medium");
  const [renameTarget, setRenameTarget] = useState<ThreadSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [tree, setTree] = useState<ThreadTreeNode[]>([]);
  const [treeOpen, setTreeOpen] = useState(false);
  const [query] = useState("");
  const [threadMetadata, setThreadMetadata] = useState<ThreadMetadata>({});
  const [threadMetadataReady, setThreadMetadataReady] = useState(false);
  const [pendingThreadFile, setPendingThreadFile] = useState<string | undefined>(() => pendingThreadHandoff(sessionStorage.getItem("pi-ocarina:open-thread"), workspace.id));
  const revision = useRef(0);
  const selectedThreadRef = useRef<string | null>(null);
  const runIdsRef = useRef(new Map<string, string>());
  const streamsRef = useRef(new Map<string, string>());
  const consumeAgentEventRef = useRef<(event: AgentStreamEvent, threadId: string) => void>(() => {});
  const runtimePromptsRef = useRef(new Map<string, RuntimePromptPayload>());
  const docksRef = useRef(new Map<string, DockState>());
  const [dock, setDock] = useState<DockState>({ ...EMPTY_DOCK });
  const draftsRef = useRef<Record<string, string>>({});
  const draftAttachmentsRef = useRef<Record<string, Attachment[]>>({});
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const draftPersistence = useRef<ReturnType<typeof createCoalescedTask<() => Promise<void>>> | null>(null);
  if (!draftPersistence.current) draftPersistence.current = createCoalescedTask((write) => write(), 300);
  const threadMetadataRef = useRef<ThreadMetadata>({});
  const [dismissedSkew, setDismissedSkew] = useState<string | null>(null);
  const [changePath, setChangePath] = useState("");
  const reviewerWidthRef = useRef(560);
  const reviewerPanelRef = useResizablePanelRef();
  const clearChangePath = useCallback(() => setChangePath(""), []);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  useEffect(() => {
    const openChanges = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "g") { event.preventDefault(); onChangesOpenChange(true); } };
    window.addEventListener("keydown", openChanges);
    return () => window.removeEventListener("keydown", openChanges);
  }, [onChangesOpenChange]);
  useEffect(() => { void invokeTauri("app_state_snapshot").then(({ state }) => { reviewerWidthRef.current = Math.max(320, state.preferences.reviewer_width || 560); }); }, []);
  useEffect(() => { if (changesOpen) reviewerPanelRef.current?.resize(`${reviewerWidthRef.current}px`); else reviewerPanelRef.current?.collapse(); }, [changesOpen, reviewerPanelRef]);
  const threadModel = thread?.model;
  const running = thread ? runningThreads.has(thread.threadId) : false;
  const activeProjectColor = projectColor(workspace);
  const chatTheme = projectColorVariables(activeProjectColor) as CSSProperties;
  const activeModel = thread
    ? threadModel && models.some((item) => item.provider === threadModel.provider && item.id === threadModel.id) ? threadModel : null
    : model;
  const composerCommands = [...(thread?.commands ?? []), ...workspaceResources.commands];
  const composerSkills = thread?.skills?.length ? thread.skills : workspaceResources.skills;
  const composerExtensions = thread?.extensions ?? workspaceResources.extensions;
  useEffect(() => { cacheThreadSummaries(workspace.id, threads); }, [threads, workspace.id]);
  useEffect(() => {
    setWorkspaceResources({ commands: [], skills: [], extensions: [] });
    void requestAgent("workspaceResources", { cwd: workspace.path }).then(setWorkspaceResources).catch((cause) => setError(String(cause)));
  }, [workspace.id, workspace.path]);
  useEffect(() => onThreadTitleChange(thread?.title ?? "New thread"), [onThreadTitleChange, thread?.title]);

  useEffect(() => {
    const backgrounded = () => {
      if (runningThreads.size === 0) return;
      const permission = Notification.permission;
      if (shouldRequestPermission({ backgrounded: true, running: true, categories: notificationCategories(), permission })) void requestPermission();
    };
    addEventListener("blur", backgrounded); document.addEventListener("visibilitychange", backgrounded);
    return () => { removeEventListener("blur", backgrounded); document.removeEventListener("visibilitychange", backgrounded); };
  }, [runningThreads]);

  useEffect(() => {
    const clearSelected = () => selectedThreadRef.current && setAttentionThreads((items) => { const next = new Set(items); next.delete(selectedThreadRef.current ?? ""); return next; });
    addEventListener("focus", clearSelected); return () => removeEventListener("focus", clearSelected);
  }, []);

  /** @param {string} threadId @param {"completed" | "failed" | "attention"} category @param {string} title */
  function signalAttention(threadId: string, category: "completed" | "failed" | "attention", title: string) {
    const selected = selectedThreadRef.current === threadId;
    const focused = document.hasFocus();
    if (focused && selected) return;
    setAttentionThreads((items) => new Set(items).add(threadId));
    const categories = notificationCategories();
    if (!shouldNotify({ focused, selected, category, categories })) return;
    if (Notification.permission === "granted") sendNotification({ title, body: `Thread ${category}` });
  }

  useEffect(() => {
    /** @type {string | undefined} */
    let watchId: string | undefined;
    void invokeTauri("app_state_snapshot").then(async ({ state }) => {
      const legacy = state.windows?.[windowLabel];
      const saved = legacy?.workspace_views?.[workspace.id] ?? (legacy?.workspace_id === workspace.id ? legacy : null);
      const available = await requestAgent("listThreads", { cwd: workspace.path });
      setThreads(available);
      setWorkspaceThreads((current) => ({ ...current, [workspace.id]: available }));
      revision.current = saved?.revision ?? 0;
      draftsRef.current = saved?.drafts ?? {};
      draftAttachmentsRef.current = saved?.draft_attachments ?? (saved?.attachments ? { [saved.active_thread_id ?? "new"]: saved.attachments } : {});
      scrollPositionsRef.current = saved?.scroll_positions ?? {};
      threadMetadataRef.current = saved?.thread_metadata ?? {};
      setThreadMetadata(threadMetadataRef.current);
      setThreadMetadataReady(true);
      const requestedNewThread = sessionStorage.getItem("pi-ocarina:new-thread");
      if (pendingNewThread(requestedNewThread, workspace.id)) {
        sessionStorage.removeItem("pi-ocarina:new-thread");
        selectedThreadRef.current = null;
        setThread(null);
        const draft = draftsRef.current.new ?? "";
        const draftAttachments = draftAttachmentsRef.current.new ?? [];
        setPrompt(draft);
        setAttachments(draftAttachments);
        await invokeTauri("set_workspace_projection", { workspaceId: workspace.id, projection: { ...saved, active_thread_id: null, session_file: null, draft, attachments: draftAttachments, revision: ++revision.current, run_status: "idle" } });
        return;
      }
      const requested = sessionStorage.getItem("pi-ocarina:open-thread");
      if (requested) {
        const requestedFile = pendingThreadHandoff(requested, workspace.id);
        const item = requestedFile ? available.find(({ sessionFile }) => sessionFile === requestedFile) : undefined;
        if (item) {
          sessionStorage.removeItem("pi-ocarina:open-thread");
          const opened = await requestAgent("openThread", { cwd: workspace.path, sessionFile: item.sessionFile });
          setThread(opened); selectedThreadRef.current = opened.threadId;
          setPendingThreadFile(undefined);
          markRead(item);
          setPrompt(draftsRef.current[opened.threadId] ?? "");
          setAttachments(draftAttachmentsRef.current[opened.threadId] ?? []);
          await invokeTauri("set_workspace_projection", { workspaceId: workspace.id, projection: {
            ...saved, active_thread_id: opened.threadId, session_file: opened.sessionFile,
            revision: ++revision.current, run_status: "idle", thread_metadata: threadMetadataRef.current,
          } });
          return;
        }
        if (requestedFile) {
          sessionStorage.removeItem("pi-ocarina:open-thread");
          setPendingThreadFile(undefined);
        }
      }
      if (!saved) return;
      setPrompt(saved.drafts?.[saved.active_thread_id ?? "new"] ?? saved.draft ?? "");
      setAttachments(draftAttachmentsRef.current[saved.active_thread_id ?? "new"] ?? []);
      if (!saved.active_thread_id || !saved.session_file) return;
      const recovered = await requestAgent("recoverThread", {
        cwd: workspace.path, threadId: saved.active_thread_id, sessionFile: saved.session_file,
      });
      setThread(recovered);
      selectedThreadRef.current = recovered.threadId;
      const recoveredSummary = available.find(({ sessionFile }) => sessionFile === recovered.sessionFile);
      if (recoveredSummary) markRead(recoveredSummary);
      if (recovered.runStatus === "running") {
        setRunningThreads((items) => new Set(items).add(recovered.threadId));
        void requestAgent("threadQueue", { threadId: recovered.threadId }).then((result) => setQueue(result.items)).catch(() => {});
        watchId = crypto.randomUUID();
        void requestAgent("watchThread", { threadId: recovered.threadId }, (event) => {
          if (event.payload.threadId !== saved.active_thread_id) return;
          consumeAgentEventRef.current(event, recovered.threadId);
        }, watchId).catch(() => {});
      }
      if (["interrupted", "missing"].includes(recovered.runStatus ?? "")) setError(recovered.runStatus === "missing" ? "Saved session is missing. Start a new thread." : "The previous run was interrupted. You can continue this thread.");
    }).catch((cause) => { setPendingThreadFile(undefined); setError(String(cause)); });
    return () => { if (watchId) void requestAgent("cancel", { requestId: watchId }).catch(() => {}); };
  }, [windowLabel, workspace.id, workspace.path]);

  useEffect(() => {
    void Promise.all(workspaces.filter(({ id }) => id !== workspace.id).map(async (item) => [item.id, await requestAgent("listThreads", { cwd: item.path })] as const))
      .then((entries) => {
        entries.forEach(([id, items]) => cacheThreadSummaries(id, items));
        setWorkspaceThreads((current) => ({ ...current, ...Object.fromEntries(entries) }));
      })
      .catch((cause) => setError(String(cause)));
  }, [workspace.id, workspaces]);

  useEffect(() => {
    let stop = () => {};
    void listenTauri("app-state://changed", ({ payload: state }) => {
      const saved = state.windows?.[windowLabel]?.workspace_views?.[workspace.id];
      const threadId = selectedThreadRef.current;
      if (!threadId || saved?.active_thread_id !== threadId) return;
      const draft = saved.drafts?.[threadId] ?? saved.draft ?? "";
      setPrompt((current) => current === draft ? current : draft);
    }).then((unlisten) => { stop = unlisten; });
    return () => stop();
  }, [windowLabel, workspace.id]);

  useEffect(() => {
    let stop = () => {};
    void getCurrentWindow().onCloseRequested(async (event) => {
      if (runtimePromptsRef.current.size === 0 && !draftPersistence.current?.pending()) return;
      event.preventDefault();
      await draftPersistence.current?.flush();
      await Promise.all([...runtimePromptsRef.current.values()].map((item) => requestAgent("resolveRuntimePrompt", {
        promptId: item.promptId, threadId: item.threadId, cancelled: true,
      }).catch(() => {})));
      await getCurrentWindow().destroy();
    }).then((unlisten) => { stop = unlisten; });
    return () => stop();
  }, []);

  useEffect(() => {
    if (!thread || running) return;
    const refresh = () => {
      void requestAgent("refreshThread", {
        cwd: workspace.path, threadId: thread.threadId, sessionFile: thread.sessionFile,
      }).then(setThread).catch((cause) => setError(String(cause)));
      void requestAgent("listThreads", { cwd: workspace.path }).then(setThreads).catch(() => {});
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [thread, running, workspace.path]);

  async function submit() {
    if ((!prompt.trim() && !attachments.length)) return;
    await flushDraftSave();
    const commandPrompt = expandCommandInvocation(prompt, composerCommands);
    const blocked = blockedCommand(commandPrompt, composerCommands, compatibilityRef.current);
    if (blocked) { setError(blocked.message); return; }
    if (running) { await enqueue("followUp"); return; }
    const control = parseComposerControl(commandPrompt);
    if (control?.type === "thinking") { await applyThinking(control.value); setPrompt(""); void saveProjection(thread, "idle", ""); return; }
    if (control?.type === "model") {
      const selected = models.find((item) => item.provider === control.provider && item.id === control.id);
      if (!selected) { setError("That model is unavailable. Choose an available model."); return; }
      await applyModel(selected); setPrompt(""); void saveProjection(thread, "idle", ""); return;
    }
    if (!activeModel) { setError("Choose an available model to continue."); return; }
    setError("");
    setStream("");
    /** @type {string | null} */
    let startedThreadId: string | null = null;
    /** @type {string | null} */
    let activeRunId: string | null = null;
    try {
      const active = thread ?? await requestAgent("createThread", {
        cwd: workspace.path,
        provider: activeModel.provider,
        modelId: activeModel.id,
        thinkingLevel: newThinking,
      });
      const text = prompt;
      const submittedText = expandSkillInvocation(expandCommandInvocation(text, active.commands), active.skills);
      const submittedAttachments = attachments;
      startedThreadId = active.threadId;
      selectedThreadRef.current = active.threadId;
      setPrompt("");
      setThread({ ...active, messages: [...active.messages, { role: "user", text: text || submittedAttachments.map((item) => item.name).join(", ") }] });
      if (!thread) {
        setThreads((items) => [{ threadId: active.threadId, sessionFile: active.sessionFile, title: "New thread", messageCount: 1 }, ...items]);
        void requestAgent("generateThreadTitle", { threadId: active.threadId, prompt: text }).then((result) => {
          if (!result.title) return;
          const title = result.title;
          setThreads((items) => items.map((item) => item.threadId === active.threadId ? { ...item, title } : item));
          setThread((value) => value?.threadId === active.threadId ? { ...value, title } : value);
        }).catch(() => {});
      }
      void saveProjection(active, "running", "");
      activeRunId = crypto.randomUUID();
      runIdsRef.current.set(active.threadId, activeRunId);
      setRunningThreads((items) => new Set(items).add(active.threadId));
      const completed = await requestAgent("promptThread", { threadId: active.threadId, prompt: submittedText, attachments: submittedAttachments }, (event) => {
        if (["messageDelta", "runEvent", "toolCall"].includes(event.type) && selectedThreadRef.current === active.threadId) consumeAgentEvent(event, active.threadId);
        if (event.type === "editorText" && event.payload.threadId === active.threadId) {
          setPrompt((value) => {
            const next = event.payload.mode === "append" ? value + event.payload.text : event.payload.text;
            void saveProjection(active, "running", next);
            return next;
          });
        }
        if (event.type === "runtimePrompt") { runtimePromptsRef.current.set(active.threadId, event.payload); signalAttention(active.threadId, "attention", active.title ?? "Pi Ocarina"); if (selectedThreadRef.current === active.threadId) { setRuntimeValue(event.payload.options?.[0] ?? ""); setRuntimePrompt(event.payload); } }
        if (event.type === "runtimeNotice" && selectedThreadRef.current === active.threadId) {
          if (event.payload.type === "error") setError(event.payload.message);
          else setNotice(event.payload.message);
        }
        if (event.type === "compatibilityIssue") {
          const key = `${event.payload.extensionPath}::${event.payload.commandName}`;
          compatibilityRef.current = { ...compatibilityRef.current, [key]: event.payload };
          saveCompatibility(workspace.id, compatibilityRef.current);
        }
        if (event.type === "sessionChanged") {
          selectedThreadRef.current = event.payload.threadId;
          setThread(event.payload);
          setThreads((items) => [{ threadId: event.payload.threadId, sessionFile: event.payload.sessionFile, title: event.payload.title ?? "New thread" }, ...items.filter((item) => item.threadId !== event.payload.threadId)]);
          setPrompt(draftsRef.current[event.payload.threadId] ?? "");
        }
        if (event.type === "extensionDock") {
          const next = reduceDock(docksRef.current.get(active.threadId), event.payload);
          docksRef.current.set(active.threadId, next);
          if (selectedThreadRef.current === active.threadId) setDock(next);
        }
      }, activeRunId);
      if (selectedThreadRef.current === active.threadId) { setThread(completed); setLiveRun(null); }
      signalAttention(active.threadId, "completed", completed.title ?? "Pi Ocarina");
      draftAttachmentsRef.current[active.threadId] = [];
      const refreshed = await requestAgent("listThreads", { cwd: workspace.path });
      setThreads(refreshed);
      const summary = refreshed.find((item) => item.threadId === completed.threadId || item.sessionFile === completed.sessionFile);
      if (selectedThreadRef.current === active.threadId) {
        setAttachments([]);
        if (summary) markRead(summary);
        void saveProjection(completed, "idle", "", []);
      }
      streamsRef.current.delete(active.threadId);
      if (selectedThreadRef.current === active.threadId) setStream("");
    } catch (cause) {
      if (startedThreadId) signalAttention(startedThreadId, "failed", thread?.title ?? "Pi Ocarina");
      if (!startedThreadId || selectedThreadRef.current === startedThreadId) {
        setError(String(cause));
        setLiveRun((current) => settleLiveRun(current, String(cause).toLowerCase().includes("cancel") ? "stopped" : "failed"));
        setThread((value) => value && ({ ...value, messages: settleActiveToolMessages(value.messages, String(cause)) }));
      }
    } finally {
      const completedThreadId = activeRunId ? [...runIdsRef.current].find(([, id]) => id === activeRunId)?.[0] : undefined;
      if (completedThreadId) {
        runIdsRef.current.delete(completedThreadId);
        setRunningThreads((items) => { const next = new Set(items); next.delete(completedThreadId); return next; });
        if (selectedThreadRef.current === completedThreadId) setQueue([]);
      }
    }
  }

  /** @param {string} threadId @param {string} delta */
  function appendStream(threadId: string, delta: string) {
    const next = (streamsRef.current.get(threadId) ?? "") + delta;
    streamsRef.current.set(threadId, next);
    if (selectedThreadRef.current === threadId) setStream(next);
  }

  function consumeAgentEvent(event: AgentStreamEvent, threadId: string) {
    if (event.type === "runEvent") { setLiveRun((current) => reduceRunEvent(current, event.payload)); return; }
    if (event.type === "toolCall" && event.payload.runId) { setLiveRun((current) => reduceRunTool(current, event.payload)); return; }
    if (event.type === "messageDelta") appendStream(threadId, event.payload.delta);
    if (event.type === "toolCall") setThread((value) => value && ({ ...value, messages: reconcileTool(value.messages, event.payload) }));
  }
  consumeAgentEventRef.current = consumeAgentEvent;

  /** @param {"steer" | "followUp"} mode */
  async function enqueue(mode: "steer" | "followUp") {
    if (!thread || (!prompt.trim() && !attachments.length)) return;
    try {
      const result = await requestAgent("queueThread", { threadId: thread.threadId, prompt: expandSkillInvocation(expandCommandInvocation(prompt, thread.commands), thread.skills), attachments, mode });
      setQueue(result.items); setPrompt(""); setAttachments([]);
      void saveProjection(thread, "running", "", []);
    } catch (cause) { setError(String(cause)); }
  }

  /** @param {{provider: string, id: string, name?: string}} nextModel */
  async function applyModel(nextModel: Model) {
    setError("");
    onModelChange(nextModel);
    if (!thread) return;
    try { setThread(await requestAgent("setThreadModel", { threadId: thread.threadId, provider: nextModel.provider, modelId: nextModel.id })); }
    catch (cause) { setError(String(cause)); }
  }

  /** @param {string} level */
  async function applyThinking(level: string) {
    setError("");
    if (!thread) { setNewThinking(level); return; }
    try { setThread(await requestAgent("setThreadThinking", { threadId: thread.threadId, thinkingLevel: level })); }
    catch (cause) { setError(String(cause)); }
  }

  async function reloadResources() {
    if (!thread) return;
    try {
      setDock(EMPTY_DOCK); docksRef.current.delete(thread.threadId);
      setThread(await requestAgent("reloadResources", { threadId: thread.threadId }));
      compatibilityRef.current = {}; saveCompatibility(workspace.id, {});
    }
    catch (cause) { setError(String(cause)); }
  }

  function saveProjection(active: Thread | null = thread, status = running ? "running" : "idle", draft = prompt, draftAttachment: Attachment[] = attachments) {
    const key = active?.threadId ?? "new";
    const nextDrafts = { ...draftsRef.current, [key]: draft };
    draftsRef.current = nextDrafts;
    const nextAttachments = { ...draftAttachmentsRef.current, [key]: draftAttachment };
    draftAttachmentsRef.current = nextAttachments;
    const nextRevision = ++revision.current;
    return invokeTauri("set_workspace_projection", { workspaceId: workspace.id, projection: {
      active_thread_id: active?.threadId ?? null, session_file: active?.sessionFile ?? null,
      draft, drafts: nextDrafts, run_status: status, revision: nextRevision,
      draft_attachments: nextAttachments,
      scroll_positions: scrollPositionsRef.current,
      thread_metadata: threadMetadataRef.current,
    } });
  }

  /** @param {string} value */
  function scheduleDraftSave(value: string) {
    const active = thread;
    const status = running ? "running" : "idle";
    const draftAttachment = attachments;
    const key = active?.threadId ?? "new";
    draftsRef.current = { ...draftsRef.current, [key]: value };
    draftPersistence.current?.schedule(() => saveProjection(active, status, value, draftAttachment).catch((cause) => setError(String(cause))));
  }

  const flushDraftSave = () => draftPersistence.current?.flush() ?? Promise.resolve();

  /** @param {ThreadSummary} item */
  async function selectThread(item: ThreadSummary) {
    if (item.threadId === thread?.threadId) return;
    setPendingThreadFile(item.sessionFile);
    try {
      await flushDraftSave();
      setError(""); setStream("");
      const opened = await requestAgent("openThread", { cwd: workspace.path, sessionFile: item.sessionFile });
      setThread(opened);
      selectedThreadRef.current = opened.threadId;
      setAttentionThreads((items) => { const next = new Set(items); next.delete(opened.threadId); return next; });
      setStream(streamsRef.current.get(opened.threadId) ?? "");
      const pendingPrompt = runtimePromptsRef.current.get(opened.threadId) ?? null;
      setRuntimePrompt(pendingPrompt);
      setRuntimeValue(pendingPrompt?.options?.[0] ?? "");
      setDock(docksRef.current.get(opened.threadId) ?? EMPTY_DOCK);
      setQueue((await requestAgent("threadQueue", { threadId: opened.threadId })).items);
      markRead(item);
      setPrompt(draftsRef.current[opened.threadId] ?? "");
      setAttachments(draftAttachmentsRef.current[opened.threadId] ?? []);
      await saveProjection(opened, "idle", draftsRef.current[opened.threadId] ?? "");
    } catch (cause) { setError(String(cause)); }
    finally { setPendingThreadFile((current) => current === item.sessionFile ? undefined : current); }
  }

  async function selectWorkspaceThread(workspaceId: string, item: ThreadSummary) {
    if (workspaceId === workspace.id) { await selectThread(item); return; }
    sessionStorage.setItem("pi-ocarina:open-thread", JSON.stringify({ workspaceId, sessionFile: item.sessionFile }));
    if (!await onSelectWorkspace(workspaceId)) sessionStorage.removeItem("pi-ocarina:open-thread");
  }

  /** @param {ThreadSummary} item */
  function markRead(item: ThreadSummary) {
    const next = markThreadRead(item, threadMetadataRef.current);
    threadMetadataRef.current = next;
    setThreadMetadata(next);
  }

  function setOrganization(next: ThreadMetadata) {
    threadMetadataRef.current = next;
    setThreadMetadata(next);
    void saveProjection();
  }

  /** @param {ThreadSummary} item */
  function toggleArchive(item: ThreadSummary) {
    setOrganization({ ...threadMetadataRef.current, [item.sessionFile]: { ...threadMetadataRef.current[item.sessionFile], archived: !threadMetadataRef.current[item.sessionFile]?.archived } });
  }

  async function newThread() {
    await flushDraftSave();
    selectedThreadRef.current = null; setThread(null); setStream(""); setDock(EMPTY_DOCK); setError(""); setQueue([]); setPrompt(draftsRef.current.new ?? ""); setAttachments(draftAttachmentsRef.current.new ?? []);
  }

  async function newThreadInWorkspace(workspaceId: string) {
    if (workspaceId === workspace.id) { await newThread(); return; }
    sessionStorage.removeItem("pi-ocarina:open-thread");
    sessionStorage.setItem("pi-ocarina:new-thread", workspaceId);
    if (!await onSelectWorkspace(workspaceId)) sessionStorage.removeItem("pi-ocarina:new-thread");
  }

  function stopRun() {
    const id = thread && runIdsRef.current.get(thread.threadId);
    if (id) void requestAgent("cancel", { requestId: id }).catch((cause) => setError(String(cause)));
  }

  function resolvePrompt(cancelled = false) {
    if (!runtimePrompt) return;
    void requestAgent("resolveRuntimePrompt", { promptId: runtimePrompt.promptId, threadId: runtimePrompt.threadId, value: runtimePrompt.kind === "confirm" ? true : runtimeValue, cancelled });
    runtimePromptsRef.current.delete(runtimePrompt.threadId);
    setRuntimePrompt(null);
  }

  async function renameActiveThread() {
    if (!renameTarget?.threadId || !renameValue.trim()) return;
    try {
      const result = await requestAgent("renameThread", { threadId: renameTarget.threadId, title: renameValue });
      setThreads((items) => items.map((item) => item.threadId === renameTarget.threadId ? { ...item, title: result.title } : item));
      setThread((value) => value && value.threadId === renameTarget.threadId ? { ...value, title: result.title } : value);
      setRenameTarget(null);
    } catch (cause) { setError(String(cause)); }
  }

  async function openTree() {
    if (!thread) return;
    try { const result = await requestAgent("getThreadTree", { threadId: thread.threadId }); setTree(result.nodes); setTreeOpen(true); }
    catch (cause) { setError(String(cause)); }
  }

  /** @param {string} entryId */
  async function forkAt(entryId: string) {
    if (!thread) return;
    try {
      const forked = await requestAgent("forkThread", { threadId: thread.threadId, entryId, cwd: workspace.path });
      setThread(forked); setTreeOpen(false); setStream("");
      setThreads(await requestAgent("listThreads", { cwd: workspace.path }));
      await saveProjection(forked, "idle", draftsRef.current[forked.threadId] ?? "");
    } catch (cause) { setError(String(cause)); }
  }

  /** @param {string} entryId @param {boolean} summarize */
  async function navigateTo(entryId: string, summarize: boolean) {
    if (!thread) return;
    try {
      const result = await requestAgent("navigateThread", { threadId: thread.threadId, entryId, summarize });
      setThread(result); setTreeOpen(false); setStream("");
      if (result.editorText != null) setPrompt(result.editorText);
      await saveProjection(result, "idle", result.editorText ?? prompt);
    } catch (cause) { setError(String(cause)); }
  }

  /** @param {number} top */
  function rememberScroll(top: number) {
    const key = thread?.threadId ?? "new";
    scrollPositionsRef.current[key] = top;
    clearTimeout(scrollSaveTimer.current);
    scrollSaveTimer.current = setTimeout(() => void saveProjection(), 250);
  }

  const organized = useMemo(() => organizeThreads(threads, threadMetadata, query), [threads, threadMetadata, query]);
  const noThreads = organized.active.length === 0 && organized.archived.length === 0 && workspaces.every(({ id }) => id === workspace.id || !workspaceThreads[id]?.length);
  const messages = thread?.messages;
  const transcriptItems = useMemo(() => {
    const renderedRuns = new Set<string>();
    return messages?.flatMap((message, index) => {
      if (message.role === "user") return [<ChatBubble key={`${message.role}-${index}`} role="user">{message.text}</ChatBubble>];
      if (message.runId) {
        if (renderedRuns.has(message.runId)) return [];
        renderedRuns.add(message.runId);
        const metadata = thread?.runs?.find((run) => run.runId === message.runId) ?? { runId: message.runId, startedAt: Date.now(), outcome: "interrupted" as const, startMessageIndex: 0, endMessageIndex: 0 };
        return [<RunDisclosure key={message.runId} metadata={metadata} messages={messages.filter((item) => item.runId === message.runId)} onOpenFile={(path) => { setChangePath(path); onChangesOpenChange(true); }} />];
      }
      return [message.role === "tool"
        ? <ToolCall key={message.toolCallId ?? index} tool={message} onOpenFile={(path) => { setChangePath(path); onChangesOpenChange(true); }} />
        : <ChatBubble key={`${message.role}-${index}`} role="assistant">{message.text ?? ""}</ChatBubble>];
    });
  }, [messages, onChangesOpenChange, thread?.runs]);

  return (
    <section className="pb-thread-shell grid min-h-0 flex-1" data-sidebar-visible={sidebarVisible} aria-label="Thread" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const files = Array.from(event.dataTransfer.files); if (files.length) void importAttachments(files).then((items) => { const next = [...attachments, ...items]; setAttachments(next); draftAttachmentsRef.current[thread?.threadId ?? "new"] = next; void saveProjection(thread, running ? "running" : "idle", prompt, next); }).catch((cause) => setError(String(cause))); }}>
      <nav className="pb-sidebar flex min-h-0 min-w-0 flex-col overflow-hidden border-r p-3" aria-hidden={!sidebarVisible} inert={!sidebarVisible} aria-label="Threads">
        <h1 className="px-2 pb-4 pt-1 font-heading text-xl text-foreground">Pi<span style={{ color: activeProjectColor.primary }}>Ocarina</span></h1>
        <Button data-sidebar-row className="grid w-full grid-cols-[14px_minmax(0,1fr)] justify-start gap-2 px-2 text-left text-foreground" effects="row-highlight" size="sm" variant="ghost" onClick={() => void newThread()}><MessageSquarePlusIcon /><span>New thread</span></Button>
        <div className="flex items-center pb-3 pt-6" data-workspace-header><h2 className="flex-1 px-2 text-sm text-muted-foreground" data-sidebar-heading>Workspaces</h2><div className="flex w-14 justify-end"><Button className="pb-workspace-add shrink-0 text-foreground" aria-label="Open workspace" title="Open workspace" size="icon-sm" variant="ghost" onClick={onOpenWorkspace}><PlusIcon /></Button></div></div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {workspaces.map((entry) => { const entryColor = projectColor(entry); const collapsed = workspaceActions.collapsedWorkspaceIds.has(entry.id); const label = entry.name || entry.path.split("/").filter(Boolean).at(-1) || entry.path; const WorkspaceIcon = collapsed ? FolderFilledIcon : FolderOpenIcon; return <section className="space-y-1" key={entry.id} style={entry.id === workspace.id ? projectColorVariables(entryColor) as CSSProperties : undefined}>
          <div className="pb-workspace-row group/workspace relative">
            <Button aria-expanded={!collapsed} aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`} className="pb-workspace-disclosure grid w-full grid-cols-[14px_minmax(0,1fr)] justify-start gap-2 px-2 pr-16 text-left text-foreground" effects="row-highlight" size="sm" variant="ghost" onClick={() => workspaceActions.onToggleWorkspace(entry.id)}><WorkspaceIcon className={entry.id === workspace.id ? "text-primary" : "text-foreground"} /><span className="truncate">{label}</span></Button>
            <div className="pb-workspace-actions invisible absolute inset-y-0 right-0 flex w-14 opacity-0 transition-opacity group-hover/workspace:visible group-hover/workspace:opacity-100 group-focus-within/workspace:visible group-focus-within/workspace:opacity-100">
              <DropdownMenu><DropdownMenuTrigger asChild><Button aria-label={`Actions for ${label}`} size="icon-sm" variant="ghost"><MoreHorizontalIcon /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className={undefined}>
                <DropdownMenuItem className={undefined} onSelect={() => workspaceActions.onRenameWorkspace(entry)}>Rename</DropdownMenuItem>
                <DropdownMenuItem className={undefined} onSelect={() => workspaceActions.onRevealWorkspace(entry)}>Reveal in Finder</DropdownMenuItem>
                {entry.root_workspace_id ? <DropdownMenuItem className={undefined} variant="destructive" onSelect={() => workspaceActions.onRemoveWorkspace(entry)}><Trash2Icon />Remove Worktree</DropdownMenuItem> : <><DropdownMenuItem className={undefined} disabled={!workspaceActions.canCreateWorktree} onSelect={() => workspaceActions.onCreateWorktree(entry)}><FolderGit2Icon />Create Worktree</DropdownMenuItem><DropdownMenuItem className={undefined} variant="destructive" onSelect={() => workspaceActions.onRemoveWorkspace(entry)}><Trash2Icon />Remove Project</DropdownMenuItem></>}
              </DropdownMenuContent></DropdownMenu>
              <Button aria-label={`New thread in ${label}`} size="icon-sm" variant="ghost" onClick={() => void newThreadInWorkspace(entry.id)}><PlusIcon /></Button>
            </div>
          </div>
          {!collapsed && <div className="space-y-1">{(entry.id === workspace.id ? organized.active : workspaceThreads[entry.id] ?? []).map((item) => entry.id !== workspace.id
            ? <Button data-sidebar-row className="w-full justify-start px-2 pl-8 text-left text-foreground" effects="row-highlight" key={item.sessionFile} size="sm" variant="ghost" onClick={() => void selectWorkspaceThread(entry.id, item)}><span className="truncate">{item.title}</span></Button>
            : <div className="group flex items-center [&>button:not(:first-child)]:opacity-0 [&>button:not(:first-child)]:focus:opacity-100 [&>button:not(:first-child)]:group-hover:opacity-100" key={item.sessionFile}>
          <Button data-sidebar-row aria-current={item.threadId === thread?.threadId || item.sessionFile === thread?.sessionFile ? "page" : undefined} className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_14px] justify-start gap-2 px-2 pl-8 text-left text-foreground" effects="row-highlight" size="sm" variant="ghost" onClick={() => void selectThread(item)}><span className="truncate">{item.title}</span><span className="relative grid place-items-center"><AnimatedProceduralAvatar seed={item.threadId || item.sessionFile} color={activeProjectColor.primary} running={runningThreads.has(item.threadId ?? "")} />{attentionThreads.has(item.threadId ?? "") && <span aria-label="Needs attention" className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-primary" />}</span>{runningThreads.has(item.threadId ?? "") && <span className="sr-only">Running</span>}</Button>
          {isThreadUnread(item, threadMetadata, thread?.sessionFile, pendingThreadFile, threadMetadataReady) && <span className="mt-3 size-2 rounded-full bg-primary" aria-label="Unread" />}
          <Button className="opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`${threadMetadata[item.sessionFile]?.pin_order == null ? "Pin" : "Unpin"} ${item.title}`} size="icon-sm" variant="ghost" onClick={() => setOrganization(togglePinned(threadMetadataRef.current, item.sessionFile))}><PinIcon /></Button>
          {threadMetadata[item.sessionFile]?.pin_order != null && <><Button aria-label={`Move ${item.title} up`} size="icon-sm" variant="ghost" onClick={() => setOrganization(movePinned(threadMetadataRef.current, item.sessionFile, -1))}><ArrowUpIcon /></Button><Button aria-label={`Move ${item.title} down`} size="icon-sm" variant="ghost" onClick={() => setOrganization(movePinned(threadMetadataRef.current, item.sessionFile, 1))}><ArrowDownIcon /></Button></>}
          <Button aria-label={`Archive ${item.title}`} size="icon-sm" variant="ghost" onClick={() => toggleArchive(item)}><ArchiveIcon /></Button>
          <Button aria-label={`Rename ${item.title}`} size="icon-sm" variant="ghost" onClick={() => { setRenameTarget(item); setRenameValue(item.title); }}><PencilIcon /></Button>
        </div>)}</div>}
        </section>; })}
        {organized.archived.length > 0 && <details><summary className="px-2 py-1 text-xs text-muted-foreground">Archived ({organized.archived.length})</summary>{organized.archived.map((item) => <div className="flex" key={item.sessionFile}><Button className="min-w-0 flex-1 justify-start truncate" size="sm" variant="ghost" onClick={() => void selectThread(item)}>{item.title}</Button><Button aria-label={`Restore ${item.title}`} size="icon-sm" variant="ghost" onClick={() => toggleArchive(item)}><RotateCcwIcon /></Button></div>)}</details>}
        {noThreads && <p className="px-2 pt-3 text-muted-foreground">No matching threads.</p>}
        </div>
        <div className="border-t pt-2"><Button data-sidebar-row className="grid w-full grid-cols-[14px_minmax(0,1fr)] justify-start gap-2 px-2 text-left text-foreground" effects="row-highlight" size="sm" variant="ghost" onClick={onOpenSettings}><SettingsIcon /><span>Settings</span></Button></div>
      </nav>
      <ResizablePanelGroup className="pb-review-panel-group" orientation="horizontal" onLayoutChanged={(_, meta) => { if (meta.isUserInteraction && reviewerWidthRef.current >= 320) void invokeTauri("set_panel_layout", { reviewerWidth: Math.round(reviewerWidthRef.current) }); }}>
      <ResizablePanel id="chat" minSize="40%"><div className="pb-main-surface flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 px-6 pb-4 pt-8" style={chatTheme}>
      <div hidden>{thread && <><Button size="sm" variant="ghost" onClick={() => setResourcesOpen(true)}>Resources</Button><Button size="sm" variant="ghost" disabled={running} onClick={() => void openTree()}><ListTreeIcon />Tree</Button></>}</div>
      {thread?.schema?.newer && dismissedSkew !== thread.sessionFile && <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">
        <span>This session was written by Pi schema {thread.schema.fileVersion}; this app supports {thread.schema.runtimeVersion}. It is read-only.</span>
        <Button type="button" variant="ghost" onClick={() => setDismissedSkew(thread.sessionFile)}>Dismiss</Button>
      </div>}
      <TranscriptViewport
        threadKey={thread?.threadId ?? "new"}
        {...(scrollPositionsRef.current[thread?.threadId ?? "new"] === undefined ? {} : { savedTop: scrollPositionsRef.current[thread?.threadId ?? "new"] })}
        contentKey={`${thread?.messages.length ?? 0}:${stream.length}:${liveRun?.messages.length ?? 0}`}
        onPosition={rememberScroll}
      >
        {!thread && <p className="text-sm text-muted-foreground">Start a new thread in this workspace.</p>}
        {transcriptItems}
        {liveRun && <RunDisclosure metadata={liveRun.metadata} messages={liveRun.messages} onOpenFile={(path) => { setChangePath(path); onChangesOpenChange(true); }} />}
        {!liveRun && stream && <ChatBubble role="assistant"><MarkdownMessage data-testid="streaming-response">{stream}</MarkdownMessage></ChatBubble>}
      </TranscriptViewport>
      <Composer
        workspaceId={workspace.id}
        value={prompt} running={running} disabled={Boolean(thread?.schema?.newer)}
        attachments={attachments} onAttachments={(items) => { setAttachments(items); draftAttachmentsRef.current[thread?.threadId ?? "new"] = items; void saveProjection(thread, running ? "running" : "idle", prompt, items); }} onAttachmentError={(message) => setError(message)}
        commands={composerCommands} skills={composerSkills} extensions={composerExtensions} models={models} model={activeModel}
        thinkingLevel={thread?.thinkingLevel ?? newThinking} {...(thread?.thinkingLevels === undefined ? {} : { thinkingLevels: thread.thinkingLevels })}
        onChange={(value) => { setPrompt(value); scheduleDraftSave(value); }} onDraftBlur={() => void flushDraftSave()}
        onSend={() => void submit()} onSteer={() => void enqueue("steer")} onStop={stopRun}
        onModelChange={(next) => void applyModel(next)} onThinkingChange={(level) => void applyThinking(level)}
      />
      <div hidden><ExtensionDock dock={dock} /></div>
      {notice && <p className="rounded-md border bg-muted p-2 text-sm" role="status">{notice}<Button className="ml-2" size="sm" variant="ghost" onClick={() => setNotice("")}>Dismiss</Button></p>}
      {queue.length > 0 && <div hidden aria-label="Queued messages" />}
      {thread && <Dialog open={resourcesOpen} onOpenChange={setResourcesOpen}><DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto"><DialogHeader className={undefined}><DialogTitle className={undefined}>Resources</DialogTitle><DialogDescription className={undefined}>Skills and extensions available to this thread.</DialogDescription></DialogHeader><section className="rounded-md border bg-card p-3 text-sm">
        <h3 className="font-medium">Skills ({thread.skills?.length ?? 0})</h3>
        <div className="mt-2 space-y-2">
          {thread.skills?.map((skill) => <div className="flex items-start justify-between gap-3" key={skill.path}>
            <div className="min-w-0"><p className="font-medium">/{skill.aliases[0]}</p><p className="text-muted-foreground">{skill.description}</p><p className="truncate text-xs text-muted-foreground">{skill.source} · {skill.path} · {skill.available ? "available" : "unavailable"}</p></div>
            <Button size="sm" variant="outline" onClick={() => void invokeTauri("reveal_skill", { workspace: workspace.path, path: skill.path }).catch((cause) => setError(String(cause)))}>Reveal</Button>
          </div>)}
          <Button size="sm" variant="ghost" onClick={() => void reloadResources()}><RefreshCwIcon />Reload</Button>
        </div>
      </section>
      <section className="rounded-md border bg-card p-3 text-sm">
        <h3 className="font-medium">Extensions ({thread.extensions?.length ?? 0})</h3>
        <div className="mt-2 space-y-2">{thread.extensions?.map((extension) => <div className="flex items-center justify-between gap-3" key={extension.source}><div className="min-w-0"><p className="font-medium">{extension.label}</p><p className="truncate text-xs text-muted-foreground">{extension.source} · {extension.scope}</p></div>{extension.managed && <Button size="sm" variant="outline" onClick={() => void requestAgent("setExtensionEnabled", { threadId: thread.threadId, source: extension.source, enabled: !extension.enabled }).then(setThread).catch((cause) => setError(String(cause)))}>{extension.enabled ? "Disable" : "Enable"}</Button>}</div>)}</div>
      </section></DialogContent></Dialog>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Dialog open={Boolean(runtimePrompt)} onOpenChange={(open: boolean) => { if (!open) resolvePrompt(true); }}>
        <DialogContent className={undefined}>
          <DialogHeader className={undefined}><DialogTitle className={undefined}>{runtimePrompt?.title}</DialogTitle><DialogDescription className={undefined}>{runtimePrompt?.message}</DialogDescription></DialogHeader>
          {runtimePrompt?.kind === "select" ? <select className="h-9 rounded-md border bg-background px-3" value={runtimeValue} onChange={(event: ChangeEvent<HTMLSelectElement>) => setRuntimeValue(event.target.value)}>{runtimePrompt.options?.map((option) => <option key={option}>{option}</option>)}</select> : runtimePrompt?.kind === "editor" ? <Textarea aria-label="Runtime editor" className={undefined} value={runtimeValue} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setRuntimeValue(event.target.value)} /> : runtimePrompt?.kind !== "confirm" && <Input aria-label="Runtime input" className={undefined} type="text" value={runtimeValue} onChange={(event: ChangeEvent<HTMLInputElement>) => setRuntimeValue(event.target.value)} />}
          <DialogFooter className={undefined}><Button variant="outline" onClick={() => resolvePrompt(true)}>Cancel</Button><Button onClick={() => resolvePrompt(false)}>Continue</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(renameTarget)} onOpenChange={(open: boolean) => { if (!open) setRenameTarget(null); }}>
        <DialogContent className={undefined}>
          <DialogHeader className={undefined}><DialogTitle className={undefined}>Rename thread</DialogTitle><DialogDescription className={undefined}>This name is saved in the Pi session.</DialogDescription></DialogHeader>
          <Input aria-label="Thread name" className={undefined} type="text" value={renameValue} onChange={(event: ChangeEvent<HTMLInputElement>) => setRenameValue(event.target.value)} />
          <DialogFooter className={undefined}><Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button><Button disabled={!renameValue.trim()} onClick={() => void renameActiveThread()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={treeOpen} onOpenChange={setTreeOpen}>
        <DialogContent className="max-h-[80vh] overflow-auto">
          <DialogHeader className={undefined}><DialogTitle className={undefined}>Session tree</DialogTitle><DialogDescription className={undefined}>Navigate within this Pi session or fork a new session.</DialogDescription></DialogHeader>
          <TreeNodes nodes={tree} onFork={forkAt} onNavigate={navigateTo} />
        </DialogContent>
      </Dialog>
      </div></ResizablePanel>
      <ResizableHandle className={changesOpen ? "" : "pb-review-handle-hidden"} disabled={!changesOpen} />
      <ResizablePanel className="pb-review-resizable-panel" id="changes" panelRef={reviewerPanelRef} collapsible collapsedSize={0} defaultSize={0} minSize="30%" maxSize="60%" onResize={(size) => { if (size.inPixels > 0) reviewerWidthRef.current = size.inPixels; else if (changesOpen) onChangesOpenChange(false); }}><ChangesPanel workspaceId={workspace.id} open={changesOpen} treeVisible={changesTreeVisible} onSelectedPathHandled={clearChangePath} {...(changePath ? { selectedPath: changePath } : {})} /></ResizablePanel>
      </ResizablePanelGroup>
    </section>
  );
}

function TreeNodes({ nodes, onFork, onNavigate, depth = 0 }: { nodes: ThreadTreeNode[]; onFork: (id: string) => Promise<void>; onNavigate: (id: string, summarize: boolean) => Promise<void>; depth?: number }) {
  return <div className="space-y-1">{nodes.map((node) => <div key={node.entryId}>
    <div className="flex items-center gap-1 rounded-md border p-2" style={{ marginLeft: `${Math.min(depth, 6) * 12}px` }}>
      <Button className="min-w-0 flex-1 justify-start" size="sm" variant={node.active ? "secondary" : "ghost"} onClick={() => void onNavigate(node.entryId, false)}>
        <span className="truncate">{node.role ?? node.type}: {node.preview || "Empty"}</span>
      </Button>
      <Button aria-label="Navigate and summarize abandoned branch" size="sm" variant="outline" onClick={() => void onNavigate(node.entryId, true)}>Summarize</Button>
      {node.role === "assistant" && <Button aria-label="Fork from response" size="icon-sm" variant="ghost" onClick={() => void onFork(node.entryId)}><GitBranchIcon /></Button>}
    </div>
    {node.children?.length > 0 && <TreeNodes nodes={node.children} onFork={onFork} onNavigate={onNavigate} depth={depth + 1} />}
  </div>)}</div>;
}

/** @param {Message[]} messages @param {Message} tool */
function reconcileTool(messages: Message[], tool: ToolCallPayload): Message[] { return reconcileToolMessages(messages, { ...tool, role: "tool" }); }
