import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { MarkdownMessage } from "@/features/threads/markdown-message";
import { invokeTauri } from "@/shared/lib/tauri-client";

/** @param {{workspaceId: string, open: boolean, selectedPath?: string, onClose: () => void}} props */
type ChangedFile = { path: string; status: string };
type Diff = { content: string; binary: boolean };
type WorkspaceFile = { path: string; reviewed: boolean };
type OpenFile = WorkspaceFile & Diff;

export function ChangesPanel({ workspaceId, open, selectedPath, onClose }: { workspaceId: string; open: boolean; selectedPath?: string; onClose: () => void }) {
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [selected, setSelected] = useState("");
  const [diff, setDiff] = useState<Diff | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("changes");
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [file, setFile] = useState<OpenFile | null>(null);
  const [width, setWidth] = useState(560);
  useEffect(() => { void invokeTauri("app_state_snapshot").then(({ state }) => setWidth(state.preferences.reviewer_width || 560)); }, []);
  const resize = (next: number) => { const bounded = Math.max(320, Math.min(1200, next)); setWidth(bounded); void invokeTauri("set_panel_layout", { reviewerWidth: bounded }); };
  useEffect(() => { if (!open) return; if (selectedPath) setMode("changes"); setError(""); void invokeTauri("repository_changes", { workspaceId }).then((items) => { setFiles(items); setSelected(selectedPath && items.some((item) => item.path === selectedPath) ? selectedPath : items[0]?.path ?? ""); }).catch((cause) => setError(String(cause))); }, [open, selectedPath, workspaceId]);
  useEffect(() => { if (!selected) { setDiff(null); return; } setDiff(null); void invokeTauri("file_diff", { workspaceId, path: selected }).then(setDiff).catch((cause) => setError(String(cause))); }, [selected, workspaceId]);
  useEffect(() => { if (!open || mode !== "files") return; void invokeTauri("workspace_files", { workspaceId }).then(setWorkspaceFiles).catch((cause) => setError(String(cause))); }, [mode, open, workspaceId]);
  const openFile = (path: string) => void invokeTauri("read_workspace_file", { workspaceId, path }).then(setFile).catch((cause) => setError(String(cause)));
  const toggleReviewed = async () => { if (!file) return; await invokeTauri("set_file_reviewed", { workspaceId, path: file.path, reviewed: !file.reviewed }); setFile({ ...file, reviewed: !file.reviewed }); setWorkspaceFiles((items) => items.map((item) => item.path === file.path ? { ...item, reviewed: !file.reviewed } : item)); };
  if (!open) return null;
  return <aside className="min-w-0 rounded-md border bg-card p-3 max-sm:!w-full" style={{ width: `min(100%, ${width}px)` }} aria-label="Review workbench"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><Tabs className={undefined} value={mode} onValueChange={setMode}><TabsList className={undefined}><TabsTrigger className={undefined} value="changes">Changes</TabsTrigger><TabsTrigger className={undefined} value="files">Files ({workspaceFiles.filter((item) => item.reviewed).length}/{workspaceFiles.length})</TabsTrigger></TabsList></Tabs><div className="flex"><Button aria-label="Narrow reviewer" size="sm" variant="ghost" onClick={() => resize(width - 80)}>−</Button><Button aria-label="Widen reviewer" size="sm" variant="ghost" onClick={() => resize(width + 80)}>+</Button><Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div></div>
    {error && <p className="text-sm text-destructive">{error}</p>}{!error && files.length === 0 && <p className="text-sm text-muted-foreground">No repository changes.</p>}
    {mode === "changes" ? <div className="grid min-h-48 gap-2 sm:grid-cols-[12rem_1fr]"><nav className="max-h-80 overflow-auto" aria-label="Changed files">{files.map((file) => <Button className="w-full justify-start truncate" key={file.path} size="sm" variant={selected === file.path ? "secondary" : "ghost"} onClick={() => setSelected(file.path)}><span className="w-5 shrink-0">{file.status}</span>{file.path}</Button>)}</nav>
      <div className="min-w-0 overflow-auto rounded bg-muted p-2 text-xs">{selected && !diff && <p>Loading diff…</p>}{diff?.binary ? <p>Binary file cannot be previewed.</p> : <pre className="whitespace-pre-wrap break-words">{diff?.content || (selected ? "No readable diff." : "Select a file.")}</pre>}</div></div>
      : <div className="grid min-h-48 gap-2 sm:grid-cols-[12rem_1fr]"><nav className="max-h-80 overflow-auto" aria-label="Workspace files">{workspaceFiles.map((item) => <Button className="w-full justify-start truncate" key={item.path} size="sm" variant={file?.path === item.path ? "secondary" : "ghost"} onClick={() => openFile(item.path)}>{item.reviewed ? "✓ " : ""}{item.path}</Button>)}</nav><div className="min-w-0 overflow-auto rounded bg-muted p-2 text-xs">{file && <div className="mb-2 flex items-center justify-between"><span className="truncate font-medium">{file.path}</span><Button size="sm" variant="outline" onClick={() => void toggleReviewed()}>{file.reviewed ? "Reviewed ✓" : "Mark reviewed"}</Button></div>}{file?.binary ? <p>Binary file cannot be previewed.</p> : file ? <MarkdownMessage className="text-xs">{`\`\`\`${file.path.split(".").pop() ?? "text"}\n${file.content.replaceAll("```", "` ` `")}\n\`\`\``}</MarkdownMessage> : <p>Select a file.</p>}</div></div>}
  </aside>;
}
