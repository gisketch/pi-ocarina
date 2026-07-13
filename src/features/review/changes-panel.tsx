import { useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { EditorCode, EditorDiff } from "@/shared/ui/editor-diff";
import { additionEditorModel, parseUnifiedDiff } from "@/shared/ui/editor-model";
import { CheckIcon, FileDiffIcon, SearchIcon } from "@/shared/ui/icon";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/shared/ui/resizable";
import { invokeTauri } from "@/shared/lib/tauri-client";
import type { ChangedFile, FileDiff, OpenWorkspaceFile, WorkspaceFile } from "@/shared/contracts/tauri";
import { CompactFileTree } from "./compact-file-tree";

export function ChangesPanel({ workspaceId, open, treeVisible, selectedPath, onSelectedPathHandled }: { workspaceId: string; open: boolean; treeVisible: boolean; selectedPath?: string; onSelectedPathHandled?: () => void }) {
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [selected, setSelected] = useState("");
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"changes" | "files">("changes");
  const [query, setQuery] = useState("");
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [file, setFile] = useState<OpenWorkspaceFile | null>(null);
  useEffect(() => { if (!open) return; if (selectedPath) setMode("changes"); setError(""); void invokeTauri("repository_changes", { workspaceId }).then((items) => { setFiles(items); setSelected((current) => selectedPath && items.some((item) => item.path === selectedPath) ? selectedPath : items.some((item) => item.path === current) ? current : items[0]?.path ?? ""); onSelectedPathHandled?.(); }).catch((cause) => setError(String(cause))); }, [onSelectedPathHandled, open, selectedPath, workspaceId]);
  useEffect(() => { if (!selected) { setDiff(null); return; } setDiff(null); void invokeTauri("file_diff", { workspaceId, path: selected }).then(setDiff).catch((cause) => setError(String(cause))); }, [selected, workspaceId]);
  useEffect(() => { if (!open || mode !== "files") return; void invokeTauri("workspace_files", { workspaceId }).then(setWorkspaceFiles).catch((cause) => setError(String(cause))); }, [mode, open, workspaceId]);
  const openFile = (path: string) => void invokeTauri("read_workspace_file", { workspaceId, path }).then(setFile).catch((cause) => setError(String(cause)));
  const toggleReviewed = async () => { if (!file) return; await invokeTauri("set_file_reviewed", { workspaceId, path: file.path, reviewed: !file.reviewed }); setFile({ ...file, reviewed: !file.reviewed }); setWorkspaceFiles((items) => items.map((item) => item.path === file.path ? { ...item, reviewed: !file.reviewed } : item)); };
  const selectedStatus = files.find((item) => item.path === selected)?.status;
  const model = useMemo(() => diff && !diff.binary ? /^(?:A|\?\?)/.test(selectedStatus ?? "") && !/^diff --git|^@@ /m.test(diff.content) ? additionEditorModel(diff.content) : parseUnifiedDiff(diff.content) : null, [diff, selectedStatus]);
  if (!open) return null;
  const treeItems = mode === "changes" ? files : workspaceFiles;
  const activePath = mode === "changes" ? selected : file?.path;
  return <aside className="pb-changes-panel" aria-label="Review workbench">
    <header className="pb-review-header"><Tabs className="min-w-0" value={mode} onValueChange={(value) => setMode(value as "changes" | "files")}><TabsList><TabsTrigger value="changes">Changes ({files.length})</TabsTrigger><TabsTrigger value="files">Files ({workspaceFiles.filter((item) => item.reviewed).length}/{workspaceFiles.length})</TabsTrigger></TabsList></Tabs></header>
    <ResizablePanelGroup className="pb-review-layout" orientation="horizontal">
      <ResizablePanel id="review-editor" defaultSize="72%" minSize="50%" maxSize={treeVisible ? "80%" : "100%"}><section className="pb-review-editor" aria-label="Selected file">
        {error ? <ReviewState tone="error">{error}</ReviewState> : mode === "changes" ? <ChangesEditor selected={selected} diff={diff} model={model} /> : <FileEditor file={file} onToggleReviewed={() => void toggleReviewed()} />}
      </section></ResizablePanel>
      {treeVisible && <><ResizableHandle aria-label="Resize file tree" /><ResizablePanel id="review-tree" defaultSize="28%" minSize="20%" maxSize="50%"><aside className="pb-review-tree"><label className="pb-review-filter"><SearchIcon /><span className="sr-only">Filter files</span><Input value={query} placeholder="Filter files…" onChange={(event) => setQuery(event.target.value)} /></label><div className="min-h-0 flex-1 overflow-auto">{treeItems.length ? <CompactFileTree items={treeItems} query={query} selectedPath={activePath} onSelect={mode === "changes" ? setSelected : openFile} /> : <ReviewState>{mode === "changes" ? "No repository changes." : "No workspace files."}</ReviewState>}</div></aside></ResizablePanel></>}
    </ResizablePanelGroup>
  </aside>;
}

function ChangesEditor({ selected, diff, model }: { selected: string; diff: FileDiff | null; model: ReturnType<typeof parseUnifiedDiff> | null }) {
  if (!selected) return <ReviewState>Select a changed file.</ReviewState>;
  if (!diff) return <ReviewState>Loading diff…</ReviewState>;
  if (diff.binary) return <ReviewState>Binary file cannot be previewed.</ReviewState>;
  if (!model || !diff.content) return <ReviewState>No readable diff.</ReviewState>;
  return <><EditorHeader path={selected} additions={model.additions} deletions={model.deletions} /><EditorDiff density="workbench" lines={model.lines} path={selected} truncated={model.truncated} /></>;
}

function FileEditor({ file, onToggleReviewed }: { file: OpenWorkspaceFile | null; onToggleReviewed: () => void }) {
  if (!file) return <ReviewState>Select a workspace file.</ReviewState>;
  if (file.binary) return <ReviewState>Binary file cannot be previewed.</ReviewState>;
  return <><EditorHeader path={file.path}><Button size="sm" variant="ghost" onClick={onToggleReviewed}>{file.reviewed && <CheckIcon />}{file.reviewed ? "Reviewed" : "Mark reviewed"}</Button></EditorHeader><EditorCode content={file.content} density="workbench" path={file.path} /></>;
}

function EditorHeader({ path, additions, deletions, children }: { path: string; additions?: number; deletions?: number; children?: React.ReactNode }) {
  return <div className="pb-review-editor-header"><FileDiffIcon /><span className="min-w-0 truncate" title={path}>{path}</span>{additions !== undefined && <span className="pb-review-positive">+{additions}</span>}{deletions !== undefined && <span className="text-destructive">-{deletions}</span>}<span className="ml-auto">{children}</span></div>;
}

function ReviewState({ children, tone }: { children: React.ReactNode; tone?: "error" }) { return <p className={tone === "error" ? "p-4 text-destructive" : "p-4 text-muted-foreground"}>{children}</p>; }
