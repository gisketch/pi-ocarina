// @ts-check
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

import { WorkspaceCatalog } from "@/features/workspaces/workspace-catalog";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

export function App() {
  const [runtime, setRuntime] = useState("Starting bundled Pi…");

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
      className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground"
      data-testid="app-ready"
    >
      <Card className="w-full max-w-xl shadow-xl">
        <CardHeader>
          <Badge variant="secondary" className="uppercase tracking-widest">Desktop foundation ready</Badge>
          <CardTitle className="text-4xl tracking-tight">Pi Ocarina</CardTitle>
          <CardDescription>A maintainable Tauri home for the Pi coding agent.</CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceCatalog />
          <p className="text-xs text-muted-foreground" data-testid="runtime-status">{runtime}</p>
        </CardContent>
      </Card>
    </main>
  );
}
