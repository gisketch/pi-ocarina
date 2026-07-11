// @ts-check
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { PlusIcon, SettingsIcon } from "lucide-react";

import { AppearanceControls } from "@/features/appearance/appearance-controls";
import { NotificationControls } from "@/features/notifications/notification-controls";
import { WorkspaceCatalog } from "@/features/workspaces/workspace-catalog";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/ui/dialog";

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
        <CardHeader className="h-14 shrink-0 border-b px-4 py-0">
          <div className="flex h-full items-center gap-2">
            <CardTitle className="text-base tracking-tight">Pi Ocarina</CardTitle>
            <span className="mr-auto text-xs text-muted-foreground" data-testid="runtime-status">{runtime}</span>
            <Dialog>
              <DialogTrigger asChild><Button aria-label="Settings" size="icon-sm" variant="ghost"><SettingsIcon /></Button></DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader className={undefined}><DialogTitle className={undefined}>Settings</DialogTitle><DialogDescription className={undefined}>Appearance and notification preferences.</DialogDescription></DialogHeader>
                <div className="space-y-4"><AppearanceControls onSidebarChange={syncSidebar} /><NotificationControls /></div>
              </DialogContent>
            </Dialog>
            <Button size="sm" variant="outline" onClick={() => void invoke("open_app_window")}><PlusIcon />New window</Button>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-0">
          <WorkspaceCatalog sidebarVisible={sidebarVisible} />
        </CardContent>
      </Card>
    </main>
  );
}
