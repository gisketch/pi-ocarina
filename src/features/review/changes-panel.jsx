// @ts-check
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { MarkdownMessage } from "@/features/threads/markdown-message";

/** @param {{workspaceId: string, open: boolean, selectedPath?: string, onClose: () => void}} props */
export function ChangesPanel({ workspaceId, open, selectedPath, onClose }) {
  const [files, setFiles] = useState(/** @type {Array<{path:string,status:string}>} */ ([]));
  const [selected, setSelected] = useState("");
  const [diff, setDiff] = useState(/** @type {{content:string,binary:boolean}|null} */ (null));
  const [error, setError] = useState("");
  const [mode, setMode] = useState("changes");
  const [workspaceFiles, setWorkspaceFiles] = useState(/** @type {Array<{path:string,reviewed:boolean}>} */ ([]));
  const [file, setFile] = useState(/** @type {{path:string,content:string,binary:boolean,reviewed:boolean}|null} */ (null));
  useEffect(() => { if (!open) return; setError(""); void invoke("repository_changes", { workspaceId }).then((value) => { const items = /** @type {Array<{path:string,status:string}>} */ (value); setFiles(items); setSelected(selectedPath && items.some((item) => item.path === selectedPath) ? selectedPath : items[0]?.path ?? ""); }).catch((cause) => setError(String(cause))); }, [open, selectedPath, workspaceId]);
  useEffect(() => { if (!selected) { setDiff(null); return; } setDiff(null); void invoke("file_diff", { workspaceId, path: selected }).then(setDiff).catch((cause) => setError(String(cause))); }, [selected, workspaceId]);
  useEffect(() => { if (!open || mode !== "files") return; void invoke("workspace_files", { workspaceId }).then(setWorkspaceFiles).catch((cause) => setError(String(cause))); }, [mode, open, workspaceId]);
  const openFile = (/** @type {string} */ path) => void invoke("read_workspace_file", { workspaceId, path }).then(setFile).catch((cause) => setError(String(cause)));
  const toggleReviewed = async () => { if (!file) return; await invoke("set_file_reviewed", { workspaceId, path: file.path, reviewed: !file.reviewed }); setFile({ ...file, reviewed: !file.reviewed }); setWorkspaceFiles((items) => items.map((item) => item.path === file.path ? { ...item, reviewed: !file.reviewed } : item)); };
  if (!open) return null;
  return <aside className="min-w-0 rounded-md border bg-card p-3" aria-label="Review workbench"><div className="mb-2 flex items-center justify-between"><Tabs className={undefined} value={mode} onValueChange={setMode}><TabsList className={undefined}><TabsTrigger className={undefined} value="changes">Changes</TabsTrigger><TabsTrigger className={undefined} value="files">Files ({workspaceFiles.filter((item) => item.reviewed).length}/{workspaceFiles.length})</TabsTrigger></TabsList></Tabs><Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div>
    {error && <p className="text-sm text-destructive">{error}</p>}{!error && files.length === 0 && <p className="text-sm text-muted-foreground">No repository changes.</p>}
    {mode === "changes" ? <div className="grid min-h-48 gap-2 sm:grid-cols-[12rem_1fr]"><nav className="max-h-80 overflow-auto" aria-label="Changed files">{files.map((file) => <Button className="w-full justify-start truncate" key={file.path} size="sm" variant={selected === file.path ? "secondary" : "ghost"} onClick={() => setSelected(file.path)}><span className="w-5 shrink-0">{file.status}</span>{file.path}</Button>)}</nav>
      <div className="min-w-0 overflow-auto rounded bg-muted p-2 text-xs">{selected && !diff && <p>Loading diff…</p>}{diff?.binary ? <p>Binary file cannot be previewed.</p> : <pre className="whitespace-pre-wrap break-words">{diff?.content || (selected ? "No readable diff." : "Select a file.")}</pre>}</div></div>
      : <div className="grid min-h-48 gap-2 sm:grid-cols-[12rem_1fr]"><nav className="max-h-80 overflow-auto" aria-label="Workspace files">{workspaceFiles.map((item) => <Button className="w-full justify-start truncate" key={item.path} size="sm" variant={file?.path === item.path ? "secondary" : "ghost"} onClick={() => openFile(item.path)}>{item.reviewed ? "✓ " : ""}{item.path}</Button>)}</nav><div className="min-w-0 overflow-auto rounded bg-muted p-2 text-xs">{file && <div className="mb-2 flex items-center justify-between"><span className="truncate font-medium">{file.path}</span><Button size="sm" variant="outline" onClick={() => void toggleReviewed()}>{file.reviewed ? "Reviewed ✓" : "Mark reviewed"}</Button></div>}{file?.binary ? <p>Binary file cannot be previewed.</p> : file ? <MarkdownMessage className="text-xs">{`\`\`\`${file.path.split(".").pop() ?? "text"}\n${file.content.replaceAll("```", "` ` `")}\n\`\`\``}</MarkdownMessage> : <p>Select a file.</p>}</div></div>}
  </aside>;
}
