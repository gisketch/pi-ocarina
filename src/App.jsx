// @ts-check
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";

import { AppearanceControls } from "@/features/appearance/appearance-controls";
import { NotificationControls } from "@/features/notifications/notification-controls";
import { WorkspaceCatalog } from "@/features/workspaces/workspace-catalog";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

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
      className="h-screen overflow-hidden bg-background text-foreground"
      data-testid="app-ready"
    >
      <Card className="flex h-full flex-col rounded-none border-0 shadow-none">
        <CardHeader className="shrink-0 border-b px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="mr-auto text-lg tracking-tight">Pi Ocarina</CardTitle>
            <AppearanceControls onSidebarChange={syncSidebar} />
            <NotificationControls />
            <Button size="sm" variant="outline" onClick={() => void invoke("open_app_window")}>New Window</Button>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="runtime-status">{runtime}</p>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-0">
          <WorkspaceCatalog sidebarVisible={sidebarVisible} />
        </CardContent>
      </Card>
    </main>
  );
}
