import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { WorkspaceCatalog } from "@/features/workspaces/workspace-catalog";
import { MatrixBackground } from "@/shared/ui/matrix-background";
import { parseAgentHostEvent } from "@/shared/contracts/agent";

export function App() {
  const [runtime, setRuntime] = useState("Starting bundled Pi…");

  useEffect(() => {
    const requestId = crypto.randomUUID();
    let unlisten = () => {};
    void listen<unknown>("agent-host-event", ({ payload }) => {
      const event = parseAgentHostEvent(payload);
      if (event.requestId !== requestId || event.type === "started") return;
      setRuntime(event.type === "completed" ? "Bundled Pi ready" : event.type === "failed" || event.type === "cancelled" ? event.payload.message ?? event.type : event.type);
    }).then(async (stopListening) => {
      unlisten = stopListening;
      try {
        await invoke("start_agent_host");
        await invoke("send_agent_request", {
          request: { version: 1, requestId, operation: "createSession", payload: {} },
        });
      } catch (error) {
        setRuntime(String(error));
      }
    });
    return () => unlisten();
  }, []);

  return (
    <main
      className="h-screen overflow-hidden bg-transparent text-foreground"
      data-testid="app-ready"
    >
      <MatrixBackground />
      <span className="sr-only" data-testid="runtime-status">{runtime}</span>
      <div className="pb-app-layer h-full min-h-0"><WorkspaceCatalog sidebarVisible /></div>
    </main>
  );
}
