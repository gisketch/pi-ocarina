import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { invokeTauri, listenTauri } from "@/shared/lib/tauri-client";
import { parseAgentHostEvent } from "@/shared/contracts/agent";
import type { ModelCatalog } from "@/shared/contracts/app";

type CatalogContext = { catalog: ModelCatalog; setCatalog: (catalog: ModelCatalog) => void; selectionVersion: number; refreshSelection: () => void };
const Context = createContext<CatalogContext | null>(null);
const emptyCatalog: ModelCatalog = { providers: [], models: [], errors: [] };

export function ModelCatalogProvider({ children, initialCatalog = emptyCatalog, watch = true }: { children: ReactNode; initialCatalog?: ModelCatalog; watch?: boolean }) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [selectionVersion, setSelectionVersion] = useState(0);
  useEffect(() => {
    if (!watch) return;
    const requestId = crypto.randomUUID();
    const listener = listenTauri("agent-host-event", ({ payload }) => { const event = parseAgentHostEvent(payload); if (event.requestId === requestId && event.type === "catalog") setCatalog(event.payload); });
    void listener.then(() => invokeTauri("start_agent_host")).then(() => invokeTauri("send_agent_request", { request: { version: 1, requestId, operation: "watchCatalog", payload: {} } })).catch((cause) => setCatalog({ ...emptyCatalog, errors: [String(cause)] }));
    return () => { void listener.then((stop) => stop()); void invokeTauri("send_agent_request", { request: { version: 1, requestId: crypto.randomUUID(), operation: "cancel", payload: { requestId } } }).catch(() => {}); };
  }, [watch]);
  return <Context value={{ catalog, setCatalog, selectionVersion, refreshSelection: () => setSelectionVersion((value) => value + 1) }}>{children}</Context>;
}

export function useModelCatalog() {
  const value = useContext(Context);
  if (!value) throw new Error("Model catalog provider is missing");
  return value;
}
