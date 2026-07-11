export type DockState = { title: string; statuses: Record<string, string>; widgets: Record<string, string> };
export type DockEvent = { kind: string; key?: string | undefined; value?: unknown };
export const EMPTY_DOCK: Readonly<DockState> = Object.freeze({ title: "", statuses: {}, widgets: {} });

/** @param {DockState | Readonly<DockState>} state @param {{kind: string, key?: string, value?: unknown}} event */
export function reduceDock(state: DockState | Readonly<DockState> = EMPTY_DOCK, event: DockEvent): DockState {
  if (event.kind === "title") return { ...state, title: text(event.value) };
  if (!event.key || !["status", "widget"].includes(event.kind)) return state;
  const field = event.kind === "status" ? "statuses" : "widgets";
  const values = { ...state[field] };
  const value = event.kind === "widget" && Array.isArray(event.value)
    ? event.value.map(text).filter(Boolean).join("\n")
    : text(event.value);
  if (value) values[event.key] = value;
  else delete values[event.key];
  return { ...state, [field]: values };
}

/** @param {unknown} value */
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
