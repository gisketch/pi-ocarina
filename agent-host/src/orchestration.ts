import { Type } from "@sinclair/typebox";
import { SupervisionStore } from "./supervision.js";

type ChildStatus = "waiting" | "running" | "completed" | "failed" | "canceled";
export type ChildAction = "create" | "list" | "read" | "message" | "supervise" | "cancel";
export type ChildPayload = Record<string, unknown> & { threadId?: string; prompt?: string; gate?: string; evidence?: string; evidenceType?: string };
type ChildHandler = (parent: string, action: ChildAction, payload: ChildPayload) => Promise<unknown> | unknown;
type ParentRef = { current: string };

const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], details: value });

export class OrchestrationRuntime {
  children = new Map<string, Set<string>>();
  status = new Map<string, ChildStatus>();
  contexts = new Map<string, Record<string, unknown>>();
  handler: ChildHandler | null = null;
  supervision: SupervisionStore;

  constructor(supervisionPath: string) { this.supervision = new SupervisionStore(supervisionPath); }
  setHandler(handler: ChildHandler) { this.handler = handler; }
  link(parent: string, child: string) { this.children.set(parent, new Set([...(this.children.get(parent) ?? []), child])); this.setStatus(child, "waiting"); this.supervision.schedule(child, async () => this.status.get(child) ?? "failed"); }
  setStatus(child: string, status: ChildStatus) { this.status.set(child, status); this.supervision.reconcile(child, status); }
  owns(parent: string, child: string) { return this.children.get(parent)?.has(child) ?? false; }
  list(parent: string) { return [...(this.children.get(parent) ?? [])].map((threadId) => ({ threadId, status: this.status.get(threadId) ?? "waiting" })); }
  async run(parent: string, action: ChildAction, payload: ChildPayload = {}) {
    if (!this.handler) throw new Error("Orchestration is unavailable");
    if (action !== "create" && action !== "list" && (!payload.threadId || !this.owns(parent, payload.threadId))) throw new Error("Child thread is outside orchestrator scope");
    return this.handler(parent, action, payload);
  }
  async cancelChildren(parent: string) {
    const handler = this.handler;
    if (!handler) return;
    await Promise.all(this.list(parent).filter(({ status }) => status === "running").map(({ threadId }) => handler(parent, "cancel", { threadId })));
  }
  tools(parent: ParentRef) {
    const execute = (action: ChildAction) => async (_id: string, params: ChildPayload) => result(await this.run(parent.current, action, params));
    return [
      { name: "create_child_thread", label: "Create child thread", description: "Create an isolated child Pi thread.", parameters: Type.Object({ prompt: Type.Optional(Type.String()) }), execute: execute("create") },
      { name: "list_child_threads", label: "List child threads", description: "List child threads and live statuses.", parameters: Type.Object({}), execute: execute("list") },
      { name: "read_child_thread", label: "Read child thread", description: "Read a child transcript summary.", parameters: Type.Object({ threadId: Type.String() }), execute: execute("read") },
      { name: "message_child_thread", label: "Message child thread", description: "Send or queue a follow-up for a child thread.", parameters: Type.Object({ threadId: Type.String(), prompt: Type.String() }), execute: execute("message") },
      { name: "supervise_child_thread", label: "Supervise child thread", description: "Apply a continue, stop, or wake gate and record bounded evidence.", parameters: Type.Object({ threadId: Type.String(), gate: Type.Optional(Type.Union([Type.Literal("continue"), Type.Literal("stop"), Type.Literal("wake")])), evidenceType: Type.Optional(Type.Union([Type.Literal("report"), Type.Literal("acceptance"), Type.Literal("observation"), Type.Literal("action")])), evidence: Type.Optional(Type.String()) }), execute: execute("supervise") },
    ];
  }
}
