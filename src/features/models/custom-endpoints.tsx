import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useState, type ChangeEvent } from "react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { parseAgentHostEvent } from "@/shared/contracts/agent";
import { isModelCatalog, type CustomEndpoint, type ModelCatalog } from "@/shared/contracts/app";

const empty = { id: "", name: "", baseUrl: "", credentialReference: "", modelId: "" };

export function CustomEndpoints({ endpoints, onCatalog, onError }: { endpoints: CustomEndpoint[]; onCatalog: (catalog: ModelCatalog) => void; onError: (message: string) => void }) {
  const [draft, setDraft] = useState(empty);
  const [saving, setSaving] = useState(false);

  /** @param {"saveCustomEndpoint" | "deleteCustomEndpoint"} operation @param {object} payload */
  const request = async (operation: "saveCustomEndpoint" | "deleteCustomEndpoint", payload: Record<string, unknown>) => {
    const requestId = crypto.randomUUID();
    setSaving(true);
    const stop = await listen<unknown>("agent-host-event", ({ payload }) => {
      const event = parseAgentHostEvent(payload);
      if (event.requestId !== requestId || !["completed", "failed"].includes(event.type)) return;
      stop();
      setSaving(false);
      if (event.type === "completed") {
        if (isModelCatalog(event.payload)) onCatalog(event.payload);
        else onError("Invalid model catalog response");
      }
      else if (event.type === "failed" || event.type === "cancelled") onError(event.payload.message ?? event.type);
    });
    try {
      await invoke("send_agent_request", { request: { version: 1, requestId, operation, payload } });
    } catch (error) {
      stop(); setSaving(false); onError(String(error));
    }
  };

  /** @param {Endpoint} endpoint */
  const edit = (endpoint: CustomEndpoint) => setDraft({
    id: endpoint.id, name: endpoint.name, baseUrl: endpoint.baseUrl,
    credentialReference: endpoint.credentialReference, modelId: endpoint.models[0]?.id ?? "",
  });

  return (
    <section className="space-y-3 rounded-lg border p-3" data-testid="custom-endpoints">
      <h3 className="text-sm font-medium">OpenAI-compatible endpoints</h3>
      {endpoints.map((endpoint) => (
        <div className="flex items-center justify-between gap-2 text-sm" key={endpoint.id}>
          <span>{endpoint.name} <span className="text-muted-foreground">{endpoint.baseUrl}</span></span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => edit(endpoint)}>Edit</Button>
            <Button size="sm" variant="destructive" disabled={saving} onClick={() => void request("deleteCustomEndpoint", { id: endpoint.id })}>Remove</Button>
          </div>
        </div>
      ))}
      <form className="grid gap-2 sm:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        void request("saveCustomEndpoint", {
          id: draft.id, name: draft.name, baseUrl: draft.baseUrl,
          credentialReference: draft.credentialReference,
          models: [{ id: draft.modelId, name: draft.modelId }],
        });
      }}>
        <Input className={undefined} type="text" aria-label="Provider identifier" placeholder="provider-id" value={draft.id} disabled={endpoints.some(({ id }) => id === draft.id)} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, id: event.target.value })} />
        <Input className={undefined} type="text" aria-label="Endpoint name" placeholder="Endpoint name" value={draft.name} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, name: event.target.value })} />
        <Input className={undefined} type="url" aria-label="Base URL" placeholder="https://example.com/v1" value={draft.baseUrl} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, baseUrl: event.target.value })} />
        <Input className={undefined} type="text" aria-label="Credential environment variable" placeholder="OPENAI_API_KEY" value={draft.credentialReference} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, credentialReference: event.target.value })} />
        <Input className={undefined} type="text" aria-label="Model identifier" placeholder="model-id" value={draft.modelId} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, modelId: event.target.value })} />
        <Button disabled={saving} type="submit">{saving ? "Saving…" : draft.id && endpoints.some(({ id }) => id === draft.id) ? "Update endpoint" : "Add endpoint"}</Button>
      </form>
      <p className="text-xs text-muted-foreground">Remote endpoints require HTTPS. Localhost may use HTTP.</p>
    </section>
  );
}
