import { Type } from "@sinclair/typebox";

const result = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }], details: value });

export class OrchestrationRuntime {
  constructor() { this.children = new Map(); this.status = new Map(); this.contexts = new Map(); this.handler = null; }
  setHandler(handler) { this.handler = handler; }
  link(parent, child) { this.children.set(parent, new Set([...(this.children.get(parent) ?? []), child])); this.status.set(child, "waiting"); }
  owns(parent, child) { return this.children.get(parent)?.has(child) ?? false; }
  list(parent) { return [...(this.children.get(parent) ?? [])].map((threadId) => ({ threadId, status: this.status.get(threadId) ?? "waiting" })); }
  async run(parent, action, payload = {}) {
    if (!this.handler) throw new Error("Orchestration is unavailable");
    if (action !== "create" && action !== "list" && !this.owns(parent, payload.threadId)) throw new Error("Child thread is outside orchestrator scope");
    return this.handler(parent, action, payload);
  }
  async cancelChildren(parent) {
    if (!this.handler) return;
    await Promise.all(this.list(parent).filter(({ status }) => status === "running").map(({ threadId }) => this.handler(parent, "cancel", { threadId })));
  }
  tools(parent) {
    const execute = (action) => async (_id, params) => result(await this.run(parent.current, action, params));
    return [
      { name: "create_child_thread", label: "Create child thread", description: "Create an isolated child Pi thread.", parameters: Type.Object({ prompt: Type.Optional(Type.String()) }), execute: execute("create") },
      { name: "list_child_threads", label: "List child threads", description: "List child threads and live statuses.", parameters: Type.Object({}), execute: execute("list") },
      { name: "read_child_thread", label: "Read child thread", description: "Read a child transcript summary.", parameters: Type.Object({ threadId: Type.String() }), execute: execute("read") },
      { name: "message_child_thread", label: "Message child thread", description: "Send or queue a follow-up for a child thread.", parameters: Type.Object({ threadId: Type.String(), prompt: Type.String() }), execute: execute("message") },
    ];
  }
}
