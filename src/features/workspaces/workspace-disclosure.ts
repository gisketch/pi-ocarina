export function toggleWorkspaceDisclosure(collapsed: ReadonlySet<string>, workspaceId: string) {
  const next = new Set(collapsed);
  if (next.has(workspaceId)) next.delete(workspaceId);
  else next.add(workspaceId);
  return next;
}
