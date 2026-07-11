// @ts-check
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

import { ThreadRunner } from "@/features/threads/thread-runner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";

/** @typedef {{ id: string, configured: boolean, source?: string }} Provider */
/** @typedef {{ provider: string, id: string, name: string, available: boolean }} Model */
/** @typedef {{ providers: Provider[], models: Model[], errors: string[] }} Catalog */

/** @typedef {{ id: string, path: string }} Workspace */
/** @param {{ workspace: Workspace | null }} props */
export function ModelCatalog({ workspace }) {
  const [catalog, setCatalog] = useState(/** @type {Catalog} */ ({ providers: [], models: [], errors: [] }));
  const [selected, setSelected] = useState(/** @type {Model | null} */ (null));

  useEffect(() => {
    if (!workspace) return undefined;
    const requestId = crypto.randomUUID();
    const listener = listen("agent-host-event", ({ payload }) => {
      if (payload.requestId === requestId && payload.type === "catalog") setCatalog(payload.payload);
    });
    void listener.then(async () => {
      await invoke("start_agent_host");
      await invoke("send_agent_request", {
        request: { version: 1, requestId, operation: "watchCatalog", payload: { workspaceId: workspace.id } },
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
  }, [workspace]);

  if (!workspace) return null;
  const availableModels = catalog.models.filter(({ available }) => available);
  const model = selected && availableModels.some(({ provider, id }) => provider === selected.provider && id === selected.id)
    ? selected
    : availableModels[0] ?? null;
  return (
    <div className="mt-4 space-y-2 border-t pt-4" data-testid="model-catalog">
      <div className="flex items-center gap-2 text-sm">
        <span>{catalog.providers.length} providers</span>
        <Badge variant="secondary">{availableModels.length} available models</Badge>
        {model && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>{model.name}</DropdownMenuTrigger>
            <DropdownMenuContent className={undefined}>
              {availableModels.map((item) => (
                <DropdownMenuItem className={undefined} inset={false} key={`${item.provider}/${item.id}`} onClick={() => setSelected(item)}>{item.name}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {catalog.errors.map((error) => <p key={error} className="text-sm text-destructive">{error}</p>)}
      {model && <ThreadRunner key={`${workspace.id}/${model.provider}/${model.id}`} workspace={workspace} model={model} />}
    </div>
  );
}
