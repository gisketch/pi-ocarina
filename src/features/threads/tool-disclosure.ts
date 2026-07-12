export type ToolDisclosureState = { open: boolean; autoExpanded: boolean; userControlled: boolean };
export type ToolDisclosureEvent = { type: "activity"; active: boolean } | { type: "user-toggle" };

export function initialToolDisclosure(open = false): ToolDisclosureState {
  return { open, autoExpanded: false, userControlled: false };
}

export function reduceToolDisclosure(state: ToolDisclosureState, event: ToolDisclosureEvent): ToolDisclosureState {
  if (event.type === "user-toggle") return { ...state, open: !state.open, userControlled: true };
  if (state.userControlled) return state;
  if (event.active && !state.autoExpanded) return { ...state, open: true, autoExpanded: true };
  if (!event.active && state.autoExpanded) return { ...state, open: false };
  return state;
}
