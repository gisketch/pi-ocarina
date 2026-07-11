// @ts-check
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpenIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/shared/ui/button";
import { ModelCatalog } from "@/features/models/model-catalog";

/** @typedef {{ id: string, path: string }} Workspace */
/** @typedef {{ workspaces: Workspace[], selected_workspace: string | null }} WorkspaceState */

export function WorkspaceCatalog() {
  const [state, setState] = useState(/** @type {WorkspaceState} */ ({ workspaces: [], selected_workspace: null }));
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
        {state.workspaces.map((workspace) => (
          <Button
            key={workspace.id}
            variant={workspace.id === state.selected_workspace ? "default" : "outline"}
            onClick={() => void invoke("select_workspace", { workspaceId: workspace.id }).then(setState)}
          >
            {workspace.path.split("/").filter(Boolean).at(-1) ?? workspace.path}
          </Button>
        ))}
      </div>
      <Button variant="outline" onClick={openWorkspace}><FolderOpenIcon />Open another folder</Button>
      <ModelCatalog workspace={state.workspaces.find(({ id }) => id === state.selected_workspace) ?? null} />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
