// @ts-check

/** @param {Array<any>} threads @param {Record<string, any>} metadata @param {string} query */
export function organizeThreads(threads, metadata, query = "") {
  const needle = query.trim().toLowerCase();
  const filtered = threads.filter((thread) => !needle || thread.title.toLowerCase().includes(needle));
  /** @param {any} a @param {any} b */
  const compare = (a, b) => {
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

/** @param {Record<string, any>} metadata @param {string} sessionFile */
export function togglePinned(metadata, sessionFile) {
  const next = structuredClone(metadata);
  const current = next[sessionFile] ?? {};
  if (current.pin_order != null) delete current.pin_order;
  else current.pin_order = Math.max(-1, ...Object.values(next).map((value) => value.pin_order ?? -1)) + 1;
  next[sessionFile] = current;
  return next;
}

/** @param {Record<string, any>} metadata @param {string} sessionFile @param {-1 | 1} direction */
export function movePinned(metadata, sessionFile, direction) {
  const pinned = Object.entries(metadata).filter(([, value]) => value.pin_order != null).sort((a, b) => a[1].pin_order - b[1].pin_order);
  const index = pinned.findIndex(([file]) => file === sessionFile);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= pinned.length) return metadata;
  const next = structuredClone(metadata);
  [next[pinned[index][0]].pin_order, next[pinned[target][0]].pin_order] = [next[pinned[target][0]].pin_order, next[pinned[index][0]].pin_order];
  return next;
}
