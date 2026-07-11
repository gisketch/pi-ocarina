// @ts-check
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";

/** @param {{workspaceId: string, open: boolean, selectedPath?: string, onClose: () => void}} props */
export function ChangesPanel({ workspaceId, open, selectedPath, onClose }) {
  const [files, setFiles] = useState(/** @type {Array<{path:string,status:string}>} */ ([]));
  const [selected, setSelected] = useState("");
  const [diff, setDiff] = useState(/** @type {{content:string,binary:boolean}|null} */ (null));
  const [error, setError] = useState("");
  useEffect(() => { if (!open) return; setError(""); void invoke("repository_changes", { workspaceId }).then((items) => { setFiles(items); setSelected(selectedPath && items.some((item) => item.path === selectedPath) ? selectedPath : items[0]?.path ?? ""); }).catch((cause) => setError(String(cause))); }, [open, selectedPath, workspaceId]);
  useEffect(() => { if (!selected) { setDiff(null); return; } setDiff(null); void invoke("file_diff", { workspaceId, path: selected }).then(setDiff).catch((cause) => setError(String(cause))); }, [selected, workspaceId]);
  if (!open) return null;
  return <aside className="min-w-0 rounded-md border bg-card p-3" aria-label="Changes"><div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Changes</h2><Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div>
    {error && <p className="text-sm text-destructive">{error}</p>}{!error && files.length === 0 && <p className="text-sm text-muted-foreground">No repository changes.</p>}
    <div className="grid min-h-48 gap-2 sm:grid-cols-[12rem_1fr]"><nav className="max-h-80 overflow-auto" aria-label="Changed files">{files.map((file) => <Button className="w-full justify-start truncate" key={file.path} size="sm" variant={selected === file.path ? "secondary" : "ghost"} onClick={() => setSelected(file.path)}><span className="w-5 shrink-0">{file.status}</span>{file.path}</Button>)}</nav>
      <div className="min-w-0 overflow-auto rounded bg-muted p-2 text-xs">{selected && !diff && <p>Loading diff…</p>}{diff?.binary ? <p>Binary file cannot be previewed.</p> : <pre className="whitespace-pre-wrap break-words">{diff?.content || (selected ? "No readable diff." : "Select a file.")}</pre>}</div></div>
  </aside>;
}
