export type FileTreeItem = { path: string; status?: string; reviewed?: boolean };
export type FileTreeNode = { kind: "folder"; name: string; path: string; children: FileTreeNode[] } | { kind: "file"; name: string; path: string; item: FileTreeItem };

type FolderDraft = { name: string; path: string; folders: Map<string, FolderDraft>; files: FileTreeNode[] };

export function buildFileTree(items: FileTreeItem[]): FileTreeNode[] {
  const root: FolderDraft = { name: "", path: "", folders: new Map(), files: [] };
  for (const item of items) {
    const parts = item.path.split("/").filter(Boolean);
    if (!parts.length) continue;
    let folder = root;
    for (const name of parts.slice(0, -1)) {
      const path = folder.path ? `${folder.path}/${name}` : name;
      let child = folder.folders.get(name);
      if (!child) { child = { name, path, folders: new Map(), files: [] }; folder.folders.set(name, child); }
      folder = child;
    }
    folder.files.push({ kind: "file", name: parts.at(-1)!, path: item.path, item });
  }
  const finish = (folder: FolderDraft): FileTreeNode[] => [
    ...[...folder.folders.values()].sort(byName).map((child) => ({ kind: "folder" as const, name: child.name, path: child.path, children: finish(child) })),
    ...folder.files.sort(byName),
  ];
  return finish(root);
}

export function filterFileTree(nodes: FileTreeNode[], query: string): FileTreeNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return nodes;
  const result: FileTreeNode[] = [];
  for (const node of nodes) {
    if (node.kind === "file") { if (node.path.toLowerCase().includes(needle)) result.push(node); continue; }
    const children = filterFileTree(node.children, needle);
    if (children.length || node.path.toLowerCase().includes(needle)) result.push({ ...node, children: children.length ? children : node.children });
  }
  return result;
}

function byName(a: { name: string }, b: { name: string }) { return a.name.localeCompare(b.name); }
