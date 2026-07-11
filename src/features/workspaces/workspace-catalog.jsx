// @ts-check
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderGit2Icon, FolderOpenIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/shared/ui/button";
import { ModelCatalog } from "@/features/models/model-catalog";

/** @typedef {{ id: string, path: string, root_workspace_id?: string | null, branch?: string | null }} Workspace */
/** @typedef {{ workspaces: Workspace[], selected_workspace: string | null }} WorkspaceState */

export function WorkspaceCatalog() {
  const [state, setState] = useState(/** @type {WorkspaceState} */ ({ workspaces: [], selected_workspace: null }));
  const [model, setModel] = useState(/** @type {{provider: string, id: string} | null} */ (null));
  const [error, setError] = useState("");

  const openWorkspace = useCallback(async () => {
    const path = await open({ directory: true, multiple: false, title: "Open Folder" });
    if (!path) return;
    try {
      setState(await invoke("add_workspace", { path }));
      setError("");
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  /** @param {Workspace} root */
  async function createWorktree(root) {
    let created;
    try {
      created = await invoke("create_worktree", { rootWorkspaceId: root.id });
      if (!model) throw new Error("Choose a model before creating a worktree.");
      await createThread(created.workspace.path, model);
      setState(await invoke("register_worktree", { workspace: created.workspace }));
      setError("");
    } catch (cause) {
      if (created) await invoke("rollback_worktree", { workspace: created.workspace }).catch(() => {});
      setError(String(cause));
    }
  }

  /** @param {Workspace} workspace */
  async function removeWorktree(workspace) {
    if (!window.confirm(`Remove worktree ${workspace.branch}? Dirty or unmerged work will be preserved.`)) return;
    try { setState(await invoke("remove_worktree", { workspaceId: workspace.id })); setError(""); }
    catch (cause) { setError(String(cause)); }
  }

  useEffect(() => {
    void invoke("app_state_snapshot").then(({ state: snapshot }) => setState(snapshot));
    const listeners = Promise.all([
      listen("app-state://changed", ({ payload }) => setState(payload)),
      listen("workspace://open-picker", openWorkspace),
    ]);
    return () => void listeners.then((stops) => stops.forEach((stop) => stop()));
  }, [openWorkspace]);

  if (state.workspaces.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">Open a local folder to begin.</p>
        <Button onClick={openWorkspace}><FolderOpenIcon />Open Folder</Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {state.workspaces.map((workspace) => <div className="flex" key={workspace.id}>
          <Button className="rounded-r-none" variant={workspace.id === state.selected_workspace ? "default" : "outline"} onClick={() => void invoke("select_workspace", { workspaceId: workspace.id }).then(setState)}>
            {workspace.root_workspace_id && <FolderGit2Icon aria-label="Worktree" />}{workspace.path.split("/").filter(Boolean).at(-1) ?? workspace.path}
          </Button>
          {workspace.root_workspace_id
            ? <Button aria-label="Remove worktree" className="rounded-l-none border-l-0" variant="outline" onClick={() => void removeWorktree(workspace)}><Trash2Icon /></Button>
            : <Button aria-label="Create worktree" className="rounded-l-none border-l-0" disabled={!model} title={model ? "Create worktree" : "Choose a model first"} variant="outline" onClick={() => void createWorktree(workspace)}><FolderGit2Icon /></Button>}
        </div>)}
      </div>
      <Button variant="outline" onClick={openWorkspace}><FolderOpenIcon />Open another folder</Button>
      <ModelCatalog onModelChange={setModel} workspace={state.workspaces.find(({ id }) => id === state.selected_workspace) ?? null} />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** @param {string} cwd @param {{provider: string, id: string}} model */
function createThread(cwd, model) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    let stop = () => {};
    void listen("agent-host-event", ({ payload }) => {
      if (payload.requestId !== requestId || !["completed", "failed", "cancelled"].includes(payload.type)) return;
      stop();
      if (payload.type === "completed") resolve(payload.payload);
      else reject(new Error(payload.payload.message ?? payload.type));
    }).then((unlisten) => {
      stop = unlisten;
      return invoke("send_agent_request", { request: { version: 1, requestId, operation: "createThread", payload: { cwd, provider: model.provider, modelId: model.id } } });
    }).catch((cause) => { stop(); reject(cause); });
  });
}
