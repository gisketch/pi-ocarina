import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FolderGit2Icon, FolderOpenIcon, MoreHorizontalIcon, PlusIcon, Trash2Icon } from "@/shared/ui/icon";
import { useCallback, useEffect, useState, type ChangeEvent, type KeyboardEvent } from "react";

import { ModelCatalog } from "@/features/models/model-catalog";
import { Button } from "@/shared/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/shared/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Input } from "@/shared/ui/input";
import { parseAgentHostEvent } from "@/shared/contracts/agent";
import type { AppStateSnapshot, Model, Workspace, WorkspaceState } from "@/shared/contracts/app";

/** @typedef {{ id: string, path: string, name?: string | null, root_workspace_id?: string | null, branch?: string | null }} Workspace */
/** @typedef {{ workspaces: Workspace[], selected_workspace: string | null, windows?: Record<string, {workspace_id?: string | null}> }} WorkspaceState */

const emptyState: WorkspaceState = { workspaces: [], selected_workspace: null };
const folderName = (workspace: Workspace) => workspace.path.split("/").filter(Boolean).at(-1) ?? workspace.path;

/** @param {{ sidebarVisible?: boolean }} props */
export function WorkspaceCatalog({ sidebarVisible = true }: { sidebarVisible?: boolean }) {
  const windowLabel = getCurrentWindow().label;
  const [state, setState] = useState(emptyState);
  const [model, setModel] = useState<Model | null>(null);
  const [error, setError] = useState("");
  const [renameTarget, setRenameTarget] = useState<Workspace | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Workspace | null>(null);
  const [name, setName] = useState("");

  const run = useCallback(async (command: string, args: Record<string, unknown>) => {
    try {
      const next = await invoke<WorkspaceState>(command, args);
      setState(next);
      setError("");
      return true;
    } catch (cause) {
      setError(String(cause));
      return false;
    }
  }, []);

  const openWorkspace = useCallback(async () => {
    const path = await open({ directory: true, multiple: false, title: "Open Folder" });
    if (path) await run("add_workspace", { path });
  }, [run]);

  /** @param {Workspace} root */
  async function createWorktree(root: Workspace) {
    let created: { workspace: Workspace } | undefined;
    try {
      created = await invoke<{ workspace: Workspace }>("create_worktree", { rootWorkspaceId: root.id });
      if (!model) throw new Error("Choose a model before creating a worktree.");
      await createThread(created.workspace.path, model);
      setState(await invoke<WorkspaceState>("register_worktree", { workspace: created.workspace }));
      setError("");
    } catch (cause) {
      if (created) await invoke("rollback_worktree", { workspace: created.workspace }).catch(() => {});
      setError(String(cause));
    }
  }

  /** @param {Workspace} workspace */
  async function removeWorktree(workspace: Workspace) {
    if (!window.confirm(`Remove worktree ${workspace.branch}? Dirty or unmerged work will be preserved.`)) return;
    try { setState(await invoke<WorkspaceState>("remove_worktree", { workspaceId: workspace.id })); setError(""); }
    catch (cause) { setError(String(cause)); }
  }

  useEffect(() => {
    void invoke<AppStateSnapshot>("app_state_snapshot").then(({ state: snapshot }) => setState(snapshot));
    const listeners = Promise.all([
      listen<WorkspaceState>("app-state://changed", ({ payload }) => setState(payload)),
      listen("workspace://open-picker", openWorkspace),
    ]);
    return () => void listeners.then((stops) => stops.forEach((stop) => stop()));
  }, [openWorkspace]);

  const submitRename = async () => {
    if (renameTarget && await run("rename_workspace", { workspaceId: renameTarget.id, name })) setRenameTarget(null);
  };

  const confirmRemove = async () => {
    if (removeTarget && await run("remove_workspace", { workspaceId: removeTarget.id })) setRemoveTarget(null);
  };

  if (state.workspaces.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">Open a local folder to begin.</p>
        <Button onClick={openWorkspace}><FolderOpenIcon />Open Folder</Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  const selectedWorkspace = state.windows?.[windowLabel]?.workspace_id ?? null;
  const selected = state.workspaces.find(({ id }) => id === selectedWorkspace) ?? null;
  const sidebarHeader = <div className="mb-3 flex items-center gap-1 border-b pb-3">
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button className="min-w-0 flex-1 justify-start" size="sm" variant="ghost"><FolderOpenIcon /><span className="truncate">{selected ? selected.name || folderName(selected) : "Choose workspace"}</span></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64">{state.workspaces.map((workspace) => <DropdownMenuItem className={undefined} key={workspace.id} onSelect={() => void run("select_workspace", { workspaceId: workspace.id })}>{workspace.root_workspace_id && <FolderGit2Icon />}{workspace.name || folderName(workspace)}</DropdownMenuItem>)}</DropdownMenuContent>
    </DropdownMenu>
    <Button aria-label="Open workspace" size="icon-sm" variant="ghost" onClick={openWorkspace}><PlusIcon /></Button>
    {selected && <DropdownMenu><DropdownMenuTrigger asChild><Button aria-label="Workspace actions" size="icon-sm" variant="ghost"><MoreHorizontalIcon /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className={undefined}><DropdownMenuItem className={undefined} onSelect={() => { setName(selected.name || folderName(selected)); setRenameTarget(selected); }}>Rename</DropdownMenuItem><DropdownMenuItem className={undefined} onSelect={() => void invoke("reveal_workspace", { workspaceId: selected.id }).catch((cause) => setError(String(cause)))}>Reveal in Finder</DropdownMenuItem>{selected.root_workspace_id ? <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void removeWorktree(selected)}><Trash2Icon />Remove worktree</DropdownMenuItem> : <><DropdownMenuItem className={undefined} disabled={!model} onSelect={() => void createWorktree(selected)}><FolderGit2Icon />Create worktree</DropdownMenuItem><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setRemoveTarget(selected)}>Remove from list…</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu>}
  </div>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        {selected ? <ModelCatalog onModelChange={setModel} sidebarHeader={sidebarHeader} sidebarVisible={sidebarVisible} workspace={selected} /> : <div className="grid flex-1 place-items-center"><Button onClick={openWorkspace}><FolderOpenIcon />Open Folder</Button></div>}
        {error && <p className="px-3 text-xs text-destructive">{error}</p>}
      </section>

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open: boolean) => !open && setRenameTarget(null)}>
        <DialogContent className={undefined}>
          <DialogHeader className={undefined}><DialogTitle className={undefined}>Rename workspace</DialogTitle><DialogDescription className={undefined}>This changes only its label in Pi Ocarina.</DialogDescription></DialogHeader>
          <Input aria-label="Workspace name" autoFocus className={undefined} type="text" value={name} onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)} onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") void submitRename(); }} />
          <DialogFooter className={undefined}><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button onClick={submitRename}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removeTarget)} onOpenChange={(open: boolean) => !open && setRemoveTarget(null)}>
        <DialogContent className={undefined}>
          <DialogHeader className={undefined}><DialogTitle className={undefined}>Remove workspace?</DialogTitle><DialogDescription className={undefined}>Only the catalog entry is removed. The folder, files, worktrees, and Pi sessions stay untouched.</DialogDescription></DialogHeader>
          <DialogFooter className={undefined}><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button variant="destructive" onClick={confirmRemove}>Remove from list</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** @param {string} cwd @param {{provider: string, id: string}} model */
function createThread(cwd: string, model: Pick<Model, "provider" | "id">) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    let stop = () => {};
    void listen<unknown>("agent-host-event", ({ payload }) => {
      const event = parseAgentHostEvent(payload);
      if (event.requestId !== requestId || !["completed", "failed", "cancelled"].includes(event.type)) return;
      stop();
      if (event.type === "completed") resolve(event.payload);
      else if (event.type === "failed" || event.type === "cancelled") reject(new Error(event.payload.message ?? event.type));
    }).then((unlisten) => {
      stop = unlisten;
      return invoke("send_agent_request", { request: { version: 1, requestId, operation: "createThread", payload: { cwd, provider: model.provider, modelId: model.id } } });
    }).catch((cause) => { stop(); reject(cause); });
  });
}
