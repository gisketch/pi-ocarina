// @ts-check
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

import { ThreadRunner } from "@/features/threads/thread-runner";
import { CustomEndpoints } from "@/features/models/custom-endpoints";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { Input } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/ui/dialog";

/** @typedef {{ id: string, name: string, configured: boolean, source?: string, label?: string }} Provider */
/** @typedef {{ provider: string, id: string, name: string, available: boolean }} Model */
/** @typedef {{ providers: Provider[], models: Model[], customEndpoints?: Array<{ id: string, name: string, baseUrl: string, credentialReference: string, models: Array<{id: string, name: string}> }>, errors: string[] }} Catalog */

/** @typedef {{ id: string, path: string }} Workspace */
/** @param {{ workspace: Workspace | null, sidebarVisible?: boolean, sidebarHeader?: React.ReactNode, onModelChange?: (model: Model | null) => void }} props */
export function ModelCatalog({ workspace, sidebarVisible = true, sidebarHeader, onModelChange = () => {} }) {
  const [catalog, setCatalog] = useState(/** @type {Catalog} */ ({ providers: [], models: [], errors: [] }));
  const [selected, setSelected] = useState(/** @type {Model | null} */ (null));
  const [keys, setKeys] = useState(/** @type {Record<string, string>} */ ({}));
  const [saving, setSaving] = useState("");
  const [scope, setScope] = useState("global");

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

  useEffect(() => {
    if (!workspace) return;
    void invoke("model_selection", { workspaceId: workspace.id }).then((preference) => {
      setScope(preference.scope);
      setSelected(preference.model);
    }).catch((error) => setCatalog((current) => ({ ...current, errors: [String(error)] })));
  }, [workspace]);

  const availableModels = catalog.models.filter(({ available }) => available);
  const model = availableModels.find(({ provider, id }) => provider === selected?.provider && id === selected?.id) ?? null;
  useEffect(() => { onModelChange(model); }, [model, onModelChange]);

  if (!workspace) return null;
  /** @param {string} provider */
  const saveCredential = async (provider) => {
    const requestId = crypto.randomUUID();
    setSaving(provider);
    const stop = await listen("agent-host-event", ({ payload }) => {
      if (payload.requestId !== requestId || !["completed", "failed"].includes(payload.type)) return;
      stop();
      setSaving("");
      if (payload.type === "completed") {
        setCatalog(payload.payload);
        setKeys((current) => ({ ...current, [provider]: "" }));
      } else setCatalog((current) => ({ ...current, errors: [payload.payload.message] }));
    });
    try {
      await invoke("send_agent_request", {
        request: {
          version: 1,
          requestId,
          operation: "saveProviderCredential",
          payload: { provider, apiKey: keys[provider] },
        },
      });
    } catch (error) {
      stop();
      setSaving("");
      setCatalog((current) => ({ ...current, errors: [String(error)] }));
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="model-catalog">
      <div hidden className="flex h-12 shrink-0 items-center gap-2 border-b px-3 text-sm">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>{scope === "global" ? "Global model" : "Repository model"}</DropdownMenuTrigger>
          <DropdownMenuContent className={undefined}>
            {[["global", "Global model"], ["repository", "Repository model"]].map(([value, label]) => (
              <DropdownMenuItem className={undefined} inset={false} key={value} onClick={() => {
                void invoke("set_model_scope", { workspaceId: workspace.id, scope: value }).then((preference) => {
                  setScope(preference.scope); setSelected(preference.model); onModelChange(preference.model);
                }).catch((error) => setCatalog((current) => ({ ...current, errors: [String(error)] })));
              }}>{label}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {availableModels.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>{model?.name ?? "Choose a model"}</DropdownMenuTrigger>
            <DropdownMenuContent className={undefined}>
              {availableModels.map((item) => (
                <DropdownMenuItem className={undefined} inset={false} key={`${item.provider}/${item.id}`} onClick={() => {
                  void invoke("set_model_preference", { workspaceId: workspace.id, model: { provider: item.provider, id: item.id } })
                    .then(() => { setSelected(item); onModelChange(item); })
                    .catch((error) => setCatalog((current) => ({ ...current, errors: [String(error)] })));
                }}>{item.name}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Dialog>
          <DialogTrigger asChild><Button className="ml-auto" size="sm" variant="ghost">Models & providers</Button></DialogTrigger>
          <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
            <DialogHeader className={undefined}><DialogTitle className={undefined}>Models and providers</DialogTitle><DialogDescription className={undefined}>{availableModels.length} available models across {catalog.providers.length} providers.</DialogDescription></DialogHeader>
            <div className="space-y-3">
              {catalog.providers.map((provider) => {
                const external = provider.source && provider.source !== "stored";
                return <div key={provider.id} className="rounded-lg border p-3" data-testid={`provider-${provider.id}`}><div className="flex items-center justify-between gap-2 text-sm"><span>{provider.name}</span><Badge variant="outline">{external ? "Externally managed" : provider.configured ? "Stored" : "Not configured"}</Badge></div>{external ? <p className="mt-2 text-xs text-muted-foreground">{provider.label ?? "Configured outside Pi Ocarina"}</p> : <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); void saveCredential(provider.id); }}><label className="sr-only" htmlFor={`key-${provider.id}`}>{provider.name} API key</label><Input className="flex-1" id={`key-${provider.id}`} type="password" autoComplete="off" placeholder={provider.configured ? "Replace saved API key" : "API key"} value={keys[provider.id] ?? ""} onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => setKeys((current) => ({ ...current, [provider.id]: event.target.value }))} /><Button type="submit" disabled={!keys[provider.id]?.trim() || saving === provider.id}>{saving === provider.id ? "Saving…" : "Save"}</Button></form>}</div>;
              })}
              <CustomEndpoints endpoints={catalog.customEndpoints ?? []} onCatalog={(next) => setCatalog(/** @type {Catalog} */ (next))} onError={(message) => setCatalog((current) => ({ ...current, errors: [message] }))} />
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {!model && availableModels.length === 0 && (
        <div hidden className="rounded-lg border border-dashed p-3 text-sm" data-testid="model-onboarding">
          <p>{availableModels.length > 0 ? "Choose a model to start this thread." : "No usable model is configured for this workspace."}</p>
        </div>
      )}
      <div hidden>{catalog.errors.map((error) => <p key={error} className="text-sm text-destructive">{error}</p>)}</div>
      <ThreadRunner key={workspace.id} workspace={workspace} models={availableModels} model={model} onModelChange={setSelected} sidebarHeader={sidebarHeader} sidebarVisible={sidebarVisible} />
    </div>
  );
}
