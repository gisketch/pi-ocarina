// @ts-check
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { ArrowDownIcon, ArrowUpIcon, FolderOpenIcon, MoreHorizontalIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ModelCatalog } from "@/features/models/model-catalog";
import { Button } from "@/shared/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/shared/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Input } from "@/shared/ui/input";

/** @typedef {{ id: string, path: string, name?: string | null }} Workspace */
/** @typedef {{ workspaces: Workspace[], selected_workspace: string | null }} WorkspaceState */

const emptyState = /** @type {WorkspaceState} */ ({ workspaces: [], selected_workspace: null });
const folderName = (/** @type {Workspace} */ workspace) => workspace.path.split("/").filter(Boolean).at(-1) ?? workspace.path;

export function WorkspaceCatalog() {
  const [state, setState] = useState(emptyState);
  const [error, setError] = useState("");
  const [renameTarget, setRenameTarget] = useState(/** @type {Workspace | null} */ (null));
  const [removeTarget, setRemoveTarget] = useState(/** @type {Workspace | null} */ (null));
  const [name, setName] = useState("");

  const run = useCallback(async (/** @type {string} */ command, /** @type {Record<string, unknown>} */ args) => {
    try {
      const next = /** @type {WorkspaceState} */ (await invoke(command, args));
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

  useEffect(() => {
    void invoke("app_state_snapshot").then(({ state: snapshot }) => setState(snapshot));
    const listeners = Promise.all([
      listen("app-state://changed", ({ payload }) => setState(/** @type {WorkspaceState} */ (payload))),
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

  const selected = state.workspaces.find(({ id }) => id === state.selected_workspace) ?? null;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {state.workspaces.map((workspace, index) => (
          <div className="flex items-center gap-2" key={workspace.id}>
            <Button
              className="min-w-0 flex-1 justify-start"
              variant={workspace.id === state.selected_workspace ? "default" : "outline"}
              onClick={() => void run("select_workspace", { workspaceId: workspace.id })}
            >
              <span className="truncate">{workspace.name || folderName(workspace)}</span>
            </Button>
            <Button
              aria-label={`Move ${workspace.name || folderName(workspace)} up`}
              disabled={index === 0}
              size="icon"
              variant="ghost"
              onClick={() => void run("reorder_workspace", { workspaceId: workspace.id, newIndex: index - 1 })}
            ><ArrowUpIcon /></Button>
            <Button
              aria-label={`Move ${workspace.name || folderName(workspace)} down`}
              disabled={index === state.workspaces.length - 1}
              size="icon"
              variant="ghost"
              onClick={() => void run("reorder_workspace", { workspaceId: workspace.id, newIndex: index + 1 })}
            ><ArrowDownIcon /></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label={`Manage ${workspace.name || folderName(workspace)}`} size="icon" variant="ghost"><MoreHorizontalIcon /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={undefined}>
                <DropdownMenuItem className={undefined} inset={undefined} onSelect={() => { setName(workspace.name || folderName(workspace)); setRenameTarget(workspace); }}>Rename</DropdownMenuItem>
                <DropdownMenuItem className={undefined} inset={undefined} onSelect={() => void invoke("reveal_workspace", { workspaceId: workspace.id }).catch((cause) => setError(String(cause)))}>Reveal in Finder</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" inset={undefined} onSelect={() => setRemoveTarget(workspace)}>Remove from list…</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
      <Button variant="outline" onClick={openWorkspace}><FolderOpenIcon />Open another folder</Button>
      <ModelCatalog workspace={selected} />
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Dialog open={Boolean(renameTarget)} onOpenChange={(/** @type {boolean} */ open) => !open && setRenameTarget(null)}>
        <DialogContent className={undefined}>
          <DialogHeader className={undefined}><DialogTitle className={undefined}>Rename workspace</DialogTitle><DialogDescription className={undefined}>This changes only its label in Pi Ocarina.</DialogDescription></DialogHeader>
          <Input aria-label="Workspace name" autoFocus className={undefined} type="text" value={name} onChange={(/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => setName(event.target.value)} onKeyDown={(/** @type {React.KeyboardEvent<HTMLInputElement>} */ event) => { if (event.key === "Enter") void submitRename(); }} />
          <DialogFooter className={undefined}><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button onClick={submitRename}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removeTarget)} onOpenChange={(/** @type {boolean} */ open) => !open && setRemoveTarget(null)}>
        <DialogContent className={undefined}>
          <DialogHeader className={undefined}><DialogTitle className={undefined}>Remove workspace?</DialogTitle><DialogDescription className={undefined}>Only the catalog entry is removed. The folder, files, worktrees, and Pi sessions stay untouched.</DialogDescription></DialogHeader>
          <DialogFooter className={undefined}><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button variant="destructive" onClick={confirmRemove}>Remove from list</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
