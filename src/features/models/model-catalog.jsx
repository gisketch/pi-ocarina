// @ts-check
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

import { Badge } from "@/shared/ui/badge";

/** @typedef {{ id: string, configured: boolean, source?: string }} Provider */
/** @typedef {{ provider: string, id: string, name: string, available: boolean }} Model */
/** @typedef {{ providers: Provider[], models: Model[], errors: string[] }} Catalog */

/** @param {{ workspaceId: string | null }} props */
export function ModelCatalog({ workspaceId }) {
  const [catalog, setCatalog] = useState(/** @type {Catalog} */ ({ providers: [], models: [], errors: [] }));

  useEffect(() => {
    if (!workspaceId) return undefined;
    const requestId = crypto.randomUUID();
    const listener = listen("agent-host-event", ({ payload }) => {
      if (payload.requestId === requestId && payload.type === "catalog") setCatalog(payload.payload);
    });
    void listener.then(async () => {
      await invoke("start_agent_host");
      await invoke("send_agent_request", {
        request: { version: 1, requestId, operation: "watchCatalog", payload: { workspaceId } },
      });
    }).catch((error) => setCatalog({ providers: [], models: [], errors: [String(error)] }));
    return () => {
      void listener.then((stop) => stop());
      void invoke("send_agent_request", {
        request: {
          version: 1,
          requestId: crypto.randomUUID(),
          operation: "cancel",
          payload: { requestId },
        },
      }).catch(() => {});
    };
  }, [workspaceId]);

  if (!workspaceId) return null;
  const availableModels = catalog.models.filter(({ available }) => available).length;
  return (
    <div className="mt-4 space-y-2 border-t pt-4" data-testid="model-catalog">
      <div className="flex items-center gap-2 text-sm">
        <span>{catalog.providers.length} providers</span>
        <Badge variant="secondary">{availableModels} available models</Badge>
      </div>
      {catalog.errors.map((error) => <p key={error} className="text-sm text-destructive">{error}</p>)}
    </div>
  );
}
