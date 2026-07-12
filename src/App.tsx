import { useEffect, useState } from "react";
import { WorkspaceCatalog } from "@/features/workspaces/workspace-catalog";
import { MatrixBackground } from "@/shared/ui/matrix-background";
import { PanelLeftIcon } from "@/shared/ui/icon";
import { Button } from "@/shared/ui/button";
import { parseAgentHostEvent } from "@/shared/contracts/agent";
import type { Preferences } from "@/shared/contracts/app";
import { invokeTauri, listenTauri } from "@/shared/lib/tauri-client";

export function App() {
  const [runtime, setRuntime] = useState("Starting bundled Pi…");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [preferences, setPreferences] = useState<Preferences | null>(null);

  useEffect(() => {
    const sync = (next: Preferences) => { setPreferences(next); setSidebarVisible(next.sidebar_visible); };
    let unlisten = () => {};
    void invokeTauri("app_state_snapshot").then(({ state }) => sync(state.preferences)).catch(() => {});
    void listenTauri("app-state://changed", ({ payload }) => sync(payload.preferences)).then((stop) => { unlisten = stop; });
    return () => unlisten();
  }, []);

  const toggleSidebar = () => {
    const next = !sidebarVisible;
    setSidebarVisible(next);
    if (preferences) void invokeTauri("set_preferences", { preferences: { ...preferences, sidebar_visible: next } }).then(({ preferences: saved }) => setPreferences(saved)).catch(() => {});
  };

  useEffect(() => {
    const requestId = crypto.randomUUID();
    let unlisten = () => {};
    void listenTauri("agent-host-event", ({ payload }) => {
      const event = parseAgentHostEvent(payload);
      if (event.requestId !== requestId || event.type === "started") return;
      setRuntime(event.type === "completed" ? "Bundled Pi ready" : event.type === "failed" || event.type === "cancelled" ? event.payload.message ?? event.type : event.type);
    }).then(async (stopListening) => {
      unlisten = stopListening;
      try {
        await invokeTauri("start_agent_host");
        await invokeTauri("send_agent_request", {
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
      <header className={`pb-titlebar${sidebarVisible ? " pb-titlebar-sidebar-visible" : ""}`} data-tauri-drag-region aria-label="Window toolbar">
        <div className="pb-titlebar-sidebar"><Button aria-label={sidebarVisible ? "Hide sidebar" : "Show sidebar"} aria-pressed={sidebarVisible} size="icon-sm" variant="ghost" onClick={toggleSidebar}><PanelLeftIcon /></Button></div>
        <div className="pb-titlebar-main" data-tauri-drag-region>Pi Ocarina</div>
      </header>
      <div className="pb-app-layer h-full min-h-0"><WorkspaceCatalog sidebarVisible={sidebarVisible} /></div>
    </main>
  );
}
