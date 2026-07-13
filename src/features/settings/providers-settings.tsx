import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState, type ChangeEvent } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { invokeTauri, listenTauri } from "@/shared/lib/tauri-client";
import { requestAgent } from "@/shared/lib/agent-client";
import { CustomEndpoints } from "@/features/models/custom-endpoints";
import { useModelCatalog } from "@/features/models/model-catalog-context";
import type { AppState, Model, Workspace } from "@/shared/contracts/app";
import { SettingRow, SettingsSection } from "./settings-layout";

export function ProvidersSettings({ visibleIds }: { visibleIds: Set<string> }) {
  const { catalog, setCatalog, refreshSelection } = useModelCatalog();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [scope, setScope] = useState("global");
  const [selected, setSelected] = useState<Model | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const label = getCurrentWindow().label;
    const sync = (state: AppState) => { const id = state.windows?.[label]?.workspace_id; setWorkspace(state.workspaces.find((item) => item.id === id) ?? null); };
    void invokeTauri("app_state_snapshot").then(({ state }) => sync(state)).catch((cause) => setError(String(cause)));
    const listener = listenTauri("app-state://changed", ({ payload }) => sync(payload));
    return () => void listener.then((stop) => stop());
  }, []);
  useEffect(() => { if (workspace) void invokeTauri("model_selection", { workspaceId: workspace.id }).then((value) => { setScope(value.scope); setSelected(value.model); }).catch((cause) => setError(String(cause))); }, [workspace]);
  const models = catalog.models.filter(({ available }) => available);
  const saveCredential = async (provider: string) => {
    setSaving(provider); setError("");
    try { setCatalog(await requestAgent("saveProviderCredential", { provider, apiKey: keys[provider] ?? "" })); setKeys((current) => ({ ...current, [provider]: "" })); }
    catch (cause) { setError(String(cause)); }
    finally { setSaving(""); }
  };
  const setModelScope = async (next: string) => { if (!workspace) return; try { const value = await invokeTauri("set_model_scope", { workspaceId: workspace.id, scope: next }); setScope(value.scope); setSelected(value.model); refreshSelection(); } catch (cause) { setError(String(cause)); } };
  const setDefaultModel = async (model: Model) => { if (!workspace) return; try { await invokeTauri("set_model_preference", { workspaceId: workspace.id, model: { provider: model.provider, id: model.id } }); setSelected(model); refreshSelection(); } catch (cause) { setError(String(cause)); } };
  return <>
    {(error || catalog.errors.length > 0) && <div className="mb-4 space-y-1 text-destructive" role="alert">{[error, ...catalog.errors].filter(Boolean).map((message) => <p key={message}>{message}</p>)}</div>}
    {visibleIds.has("default-model") && <SettingsSection title="Defaults"><SettingRow id="default-model" label="Default model" description={workspace ? `Used for new threads in ${workspace.name ?? workspace.path}.` : "Open a workspace to choose repository defaults."}><div className="flex items-center gap-2"><select className="pb-select h-9 rounded-md border px-3" aria-label="Model scope" disabled={!workspace} value={scope} onChange={(event) => void setModelScope(event.target.value)}><option value="global">Global</option><option value="repository">Repository</option></select><select className="pb-select h-9 max-w-64 rounded-md border px-3" aria-label="Default model" disabled={!workspace || models.length === 0} value={selected ? `${selected.provider}/${selected.id}` : ""} onChange={(event) => { const model = models.find((item) => `${item.provider}/${item.id}` === event.target.value); if (model) void setDefaultModel(model); }}><option value="">Choose model</option>{models.map((model) => <option key={`${model.provider}/${model.id}`} value={`${model.provider}/${model.id}`}>{model.name}</option>)}</select></div></SettingRow></SettingsSection>}
    {visibleIds.has("credentials") && <SettingsSection title="Providers">{catalog.providers.map((provider) => { const external = Boolean(provider.source && provider.source !== "stored"); return <SettingRow id={`provider-${provider.id}`} key={provider.id} label={provider.name} description={external ? provider.label ?? "Configured outside Pi Ocarina" : provider.configured ? "Credential stored by Pi" : "Not configured"}><div className="flex items-center gap-2"><Badge variant="outline">{external ? "External" : provider.configured ? "Stored" : "Missing"}</Badge>{!external && <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void saveCredential(provider.id); }}><Input aria-label={`${provider.name} API key`} autoComplete="off" className="w-56" placeholder={provider.configured ? "Replace API key" : "API key"} type="password" value={keys[provider.id] ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => setKeys((current) => ({ ...current, [provider.id]: event.target.value }))} /><Button disabled={!keys[provider.id]?.trim() || saving === provider.id} type="submit">{saving === provider.id ? "Saving…" : "Save"}</Button></form>}</div></SettingRow>; })}</SettingsSection>}
    {visibleIds.has("custom-endpoints") && <div className="mt-12"><CustomEndpoints endpoints={catalog.customEndpoints ?? []} onCatalog={setCatalog} onError={setError} /></div>}
  </>;
}
