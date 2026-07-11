export type ThreadListItem = { sessionFile: string; title: string; modified?: string };
import type { ThreadMetadata } from "@/shared/contracts/app";

export function organizeThreads<T extends ThreadListItem>(threads: T[], metadata: ThreadMetadata, query = "") {
  const needle = query.trim().toLowerCase();
  const filtered = threads.filter((thread) => !needle || thread.title.toLowerCase().includes(needle));
  const compare = (a: T, b: T) => {
    const aPin = metadata[a.sessionFile]?.pin_order;
    const bPin = metadata[b.sessionFile]?.pin_order;
    if (aPin != null || bPin != null) return (aPin ?? Number.MAX_SAFE_INTEGER) - (bPin ?? Number.MAX_SAFE_INTEGER);
    return String(b.modified ?? "").localeCompare(String(a.modified ?? "")) || a.sessionFile.localeCompare(b.sessionFile);
  };
  return {
    active: filtered.filter((thread) => !metadata[thread.sessionFile]?.archived).sort(compare),
    archived: filtered.filter((thread) => metadata[thread.sessionFile]?.archived).sort(compare),
  };
}

export function togglePinned(metadata: ThreadMetadata, sessionFile: string): ThreadMetadata {
  const next = structuredClone(metadata);
  const current = next[sessionFile] ?? {};
  if (current.pin_order != null) delete current.pin_order;
  else current.pin_order = Math.max(-1, ...Object.values(next).map((value) => value.pin_order ?? -1)) + 1;
  next[sessionFile] = current;
  return next;
}

export function movePinned(metadata: ThreadMetadata, sessionFile: string, direction: -1 | 1): ThreadMetadata {
  const pinned = Object.entries(metadata).filter((entry): entry is [string, { pin_order: number; archived?: boolean }] => typeof entry[1].pin_order === "number").sort((a, b) => a[1].pin_order - b[1].pin_order);
  const index = pinned.findIndex(([file]) => file === sessionFile);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= pinned.length) return metadata;
  const next = structuredClone(metadata);
  const currentFile = pinned[index]?.[0];
  const targetFile = pinned[target]?.[0];
  if (!currentFile || !targetFile || !next[currentFile] || !next[targetFile]) return metadata;
  const currentOrder = next[currentFile]?.pin_order;
  const targetOrder = next[targetFile]?.pin_order;
  if (currentOrder === undefined || targetOrder === undefined) return metadata;
  next[currentFile]!.pin_order = targetOrder;
  next[targetFile]!.pin_order = currentOrder;
  return next;
}
