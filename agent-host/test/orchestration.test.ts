import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationRuntime } from "../src/orchestration.js";

test("child tools enforce parent scope and cancel active children", async () => {
  const runtime = new OrchestrationRuntime(join(tmpdir(), `pi-ocarina-orchestration-${crypto.randomUUID()}.json`));
  const calls: Array<{ parent: string; action: string; payload: unknown }> = [];
  runtime.setHandler(async (parent, action, payload) => { calls.push({ parent, action, payload }); return action === "list" ? runtime.list(parent) : { action }; });
  runtime.link("parent", "child"); runtime.status.set("child", "running");
  assert.deepEqual(runtime.list("parent"), [{ threadId: "child", status: "running" }]);
  await assert.rejects(runtime.run("other", "read", { threadId: "child" }), /outside orchestrator scope/);
  await runtime.cancelChildren("parent");
  assert.equal(calls.at(-1)?.action, "cancel");
  const tools = runtime.tools({ current: "parent" });
  const listTool = tools.find(({ name }) => name === "list_child_threads");
  assert.ok(listTool);
  const listed = await listTool.execute("call", {});
  assert.match(listed.content[0]?.text ?? "", /running/);
});
