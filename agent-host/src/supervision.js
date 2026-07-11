import { readFileSync, writeFileSync } from "node:fs";

const terminal = new Set(["completed", "canceled"]);
const evidenceTypes = new Set(["report", "acceptance", "observation", "action"]);

export class SupervisionStore {
  constructor(path) { this.path = path; this.items = new Map(); this.timers = new Map(); this.load(); }
  load() { try { this.items = new Map(Object.entries(JSON.parse(readFileSync(this.path, "utf8")))); } catch { this.items = new Map(); } }
  save() { if (this.path) writeFileSync(this.path, `${JSON.stringify(Object.fromEntries(this.items), null, 2)}\n`, { mode: 0o600 }); }
  get(threadId) { return this.items.get(threadId) ?? { state: "waiting", evidence: [], lastChildStatus: null }; }
  gate(threadId, gate) {
    const item = this.get(threadId);
    if (!['continue', 'stop', 'wake'].includes(gate)) throw new Error("Invalid supervision gate");
    const state = gate === "stop" ? "canceled" : terminal.has(item.state) ? item.state : "running";
    return this.update(threadId, { ...item, state }, "action", `gate:${gate}`);
  }
  evidence(threadId, type, text) {
    if (!evidenceTypes.has(type) || typeof text !== "string" || !text.trim()) throw new Error("Invalid supervision evidence");
    return this.update(threadId, this.get(threadId), type, text.slice(0, 4096));
  }
  reconcile(threadId, childStatus) {
    const item = this.get(threadId);
    if (item.lastChildStatus === childStatus) return item;
    const state = ["completed", "failed", "canceled"].includes(childStatus) ? childStatus : item.state;
    return this.update(threadId, { ...item, state, lastChildStatus: childStatus }, "observation", `child:${childStatus}`);
  }
  schedule(threadId, check, interval = 1000) {
    this.stop(threadId);
    const timer = setInterval(async () => {
      try { const item = this.reconcile(threadId, await check()); if (terminal.has(item.state)) this.stop(threadId); }
      catch (error) { this.update(threadId, { ...this.get(threadId), state: "failed" }, "observation", `check failed:${error instanceof Error ? error.message : error}`); this.stop(threadId); }
    }, interval);
    timer.unref(); this.timers.set(threadId, timer); return () => this.stop(threadId);
  }
  stop(threadId) { const timer = this.timers.get(threadId); if (timer) clearInterval(timer); this.timers.delete(threadId); }
  update(threadId, item, type, text) {
    const evidence = [...item.evidence, { type, text, at: new Date().toISOString() }].slice(-100);
    const next = { ...item, evidence }; this.items.set(threadId, next); if (terminal.has(next.state)) this.stop(threadId); this.save(); return next;
  }
}
