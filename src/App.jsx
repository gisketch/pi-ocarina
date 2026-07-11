// @ts-check
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";

import { AppearanceControls } from "@/features/appearance/appearance-controls";
import { WorkspaceCatalog } from "@/features/workspaces/workspace-catalog";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

export function App() {
  const [runtime, setRuntime] = useState("Starting bundled Pi…");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const syncSidebar = useCallback((/** @type {boolean} */ visible) => setSidebarVisible(visible), []);

  useEffect(() => {
    const requestId = crypto.randomUUID();
    let unlisten = () => {};
    void listen("agent-host-event", ({ payload }) => {
      if (payload.requestId !== requestId || payload.type === "started") return;
      setRuntime(payload.type === "completed" ? "Bundled Pi ready" : payload.payload.message);
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
      className="flex min-h-screen items-center justify-center bg-background p-3 text-foreground sm:p-6"
      data-testid="app-ready"
    >
      <Card className="w-full max-w-7xl shadow-xl">
        <CardHeader>
          <Badge variant="secondary" className="uppercase tracking-widest">Desktop foundation ready</Badge>
          <CardTitle className="text-4xl tracking-tight">Pi Ocarina</CardTitle>
          <CardDescription>A maintainable Tauri home for the Pi coding agent.</CardDescription>
          <AppearanceControls onSidebarChange={syncSidebar} />
          <Button className="w-fit" variant="outline" onClick={() => void invoke("open_app_window")}>New Window</Button>
        </CardHeader>
        <CardContent className={sidebarVisible ? "grid gap-4 md:grid-cols-[minmax(14rem,18rem)_1fr]" : "block"}>
          {sidebarVisible && <aside className="min-w-0 border-b pb-4 md:border-r md:border-b-0 md:pr-4"><WorkspaceCatalog /></aside>}
          <section className="min-w-0">
            <p className="text-xs text-muted-foreground" data-testid="runtime-status">{runtime}</p>
          </section>
        </CardContent>
      </Card>
    </main>
  );
}
