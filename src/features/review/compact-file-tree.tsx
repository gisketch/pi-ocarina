import { useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/ui/button";
import { ChevronRightIcon, FileDiffIcon, FolderOpenIcon } from "@/shared/ui/icon";
import { buildFileTree, filterFileTree, type FileTreeItem, type FileTreeNode } from "./file-tree";

export function CompactFileTree({ items, query, selectedPath, onSelect }: { items: FileTreeItem[]; query: string; selectedPath: string | undefined; onSelect: (path: string) => void }) {
  const tree = useMemo(() => buildFileTree(items), [items]);
  const visible = useMemo(() => filterFileTree(tree, query), [query, tree]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => { setExpanded((current) => new Set([...current, ...folderPaths(tree)])); }, [tree]);
  return <nav className="pb-file-tree" aria-label="Files">{visible.map((node) => <TreeNode depth={0} expanded={expanded} key={node.path} node={node} onSelect={onSelect} selectedPath={selectedPath} setExpanded={setExpanded} />)}</nav>;
}

function TreeNode({ node, depth, expanded, setExpanded, selectedPath, onSelect }: { node: FileTreeNode; depth: number; expanded: Set<string>; setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>; selectedPath: string | undefined; onSelect: (path: string) => void }) {
  const inset = `${8 + depth * 16}px`;
  if (node.kind === "folder") {
    const open = expanded.has(node.path);
    return <div><Button className="pb-file-tree-row" aria-expanded={open} effects="row-highlight" size="sm" variant="ghost" style={{ paddingLeft: inset }} onClick={() => setExpanded((current) => { const next = new Set(current); if (open) next.delete(node.path); else next.add(node.path); return next; })}><ChevronRightIcon className={open ? "rotate-90" : ""} /><FolderOpenIcon /><span className="truncate">{node.name}</span></Button>{open && node.children.map((child) => <TreeNode depth={depth + 1} expanded={expanded} key={child.path} node={child} onSelect={onSelect} selectedPath={selectedPath} setExpanded={setExpanded} />)}</div>;
  }
  return <Button className="pb-file-tree-row" aria-current={selectedPath === node.path ? "page" : undefined} effects="row-highlight" size="sm" variant="ghost" style={{ paddingLeft: inset }} title={node.path} onClick={() => onSelect(node.path)}><span className="size-4" aria-hidden /><FileDiffIcon /><span className="truncate">{node.name}</span>{node.item.status && <span className="ml-auto text-muted-foreground">{node.item.status}</span>}{node.item.reviewed && <span className="pb-review-positive" aria-label="Reviewed">✓</span>}</Button>;
}

function folderPaths(nodes: FileTreeNode[]): string[] { return nodes.flatMap((node) => node.kind === "folder" ? [node.path, ...folderPaths(node.children)] : []); }
