// @ts-check
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

const empty = { id: "", name: "", baseUrl: "", credentialReference: "", modelId: "" };

/** @typedef {{ id: string, name: string, baseUrl: string, credentialReference: string, models: Array<{id: string, name: string}> }} Endpoint */
/** @param {{ endpoints: Endpoint[], onCatalog: (catalog: object) => void, onError: (message: string) => void }} props */
export function CustomEndpoints({ endpoints, onCatalog, onError }) {
  const [draft, setDraft] = useState(empty);
  const [saving, setSaving] = useState(false);

  /** @param {"saveCustomEndpoint" | "deleteCustomEndpoint"} operation @param {object} payload */
  const request = async (operation, payload) => {
    const requestId = crypto.randomUUID();
    setSaving(true);
    const stop = await listen("agent-host-event", ({ payload: event }) => {
      if (event.requestId !== requestId || !["completed", "failed"].includes(event.type)) return;
      stop();
      setSaving(false);
      if (event.type === "completed") onCatalog(event.payload);
      else onError(event.payload.message);
    });
    try {
      await invoke("send_agent_request", { request: { version: 1, requestId, operation, payload } });
    } catch (error) {
      stop(); setSaving(false); onError(String(error));
    }
  };

  /** @param {Endpoint} endpoint */
  const edit = (endpoint) => setDraft({
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
        <Input className={undefined} type="text" aria-label="Provider identifier" placeholder="provider-id" value={draft.id} disabled={endpoints.some(({ id }) => id === draft.id)} onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => setDraft({ ...draft, id: event.target.value })} />
        <Input className={undefined} type="text" aria-label="Endpoint name" placeholder="Endpoint name" value={draft.name} onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => setDraft({ ...draft, name: event.target.value })} />
        <Input className={undefined} type="url" aria-label="Base URL" placeholder="https://example.com/v1" value={draft.baseUrl} onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => setDraft({ ...draft, baseUrl: event.target.value })} />
        <Input className={undefined} type="text" aria-label="Credential environment variable" placeholder="OPENAI_API_KEY" value={draft.credentialReference} onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => setDraft({ ...draft, credentialReference: event.target.value })} />
        <Input className={undefined} type="text" aria-label="Model identifier" placeholder="model-id" value={draft.modelId} onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => setDraft({ ...draft, modelId: event.target.value })} />
        <Button disabled={saving} type="submit">{saving ? "Saving…" : draft.id && endpoints.some(({ id }) => id === draft.id) ? "Update endpoint" : "Add endpoint"}</Button>
      </form>
      <p className="text-xs text-muted-foreground">Remote endpoints require HTTPS. Localhost may use HTTP.</p>
    </section>
  );
}
