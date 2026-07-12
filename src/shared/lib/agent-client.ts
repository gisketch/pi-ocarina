import { parseAgentHostEvent, parseAgentResult, type AgentOperation, type AgentPayload, type AgentResult, type AgentStreamEvent } from "@/shared/contracts/agent";
import { invokeTauri, listenTauri } from "@/shared/lib/tauri-client";

export function requestAgent<K extends AgentOperation>(operation: K, payload: AgentPayload<K>, onEvent: (event: AgentStreamEvent) => void = () => {}, requestId: string = crypto.randomUUID()): Promise<AgentResult<K>> {
  return new Promise((resolve, reject) => {
    let stop = () => {};
    void listenTauri("agent-host-event", ({ payload: raw }) => {
      let event;
      try { event = parseAgentHostEvent(raw); }
      catch (error) { stop(); reject(error); return; }
      if (event.requestId !== requestId) return;
      if (["messageDelta", "toolCall", "runtimePrompt", "runtimeNotice", "editorText", "extensionDock", "compatibilityIssue", "sessionChanged"].includes(event.type)) onEvent(event as AgentStreamEvent);
      if (event.type !== "completed" && event.type !== "failed" && event.type !== "cancelled") return;
      stop();
      if (event.type === "completed") {
        try { resolve(parseAgentResult(operation, event.payload)); }
        catch (error) { reject(error); }
      } else reject(new Error(event.payload.message ?? event.type));
    }).then((unlisten) => {
      stop = unlisten;
      return invokeTauri("start_agent_host").then(() =>
        invokeTauri("send_agent_request", { request: { version: 1, requestId, operation, payload } }),
      );
    }).catch((error) => { stop(); reject(error); });
  });
}
