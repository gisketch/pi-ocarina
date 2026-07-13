import { useEffect, useState } from "react";
import { invokeTauri } from "@/shared/lib/tauri-client";

import { ThreadRunner, type WorkspaceSidebarActions } from "@/features/threads/thread-runner";
import { useModelCatalog } from "@/features/models/model-catalog-context";
import type { Model, Workspace } from "@/shared/contracts/app";

/** @typedef {{ id: string, name: string, configured: boolean, source?: string, label?: string }} Provider */
/** @typedef {{ provider: string, id: string, name: string, available: boolean }} Model */
/** @typedef {{ providers: Provider[], models: Model[], customEndpoints?: Array<{ id: string, name: string, baseUrl: string, credentialReference: string, models: Array<{id: string, name: string}> }>, errors: string[] }} Catalog */

/** @typedef {{ id: string, path: string }} Workspace */
/** @param {{ workspace: Workspace | null, sidebarVisible?: boolean, sidebarHeader?: React.ReactNode, onModelChange?: (model: Model | null) => void }} props */
export function ModelCatalog({ workspace, workspaces = [], sidebarVisible = true, workspaceActions, changesOpen, onChangesOpenChange, changesTreeVisible, onModelChange = () => {}, onThreadTitleChange, onOpenWorkspace = () => {}, onOpenSettings, onSelectWorkspace = async () => false }: { workspace: Workspace | null; workspaces?: Workspace[]; sidebarVisible?: boolean; workspaceActions: WorkspaceSidebarActions; changesOpen: boolean; onChangesOpenChange: (open: boolean) => void; changesTreeVisible: boolean; onModelChange?: (model: Model | null) => void; onThreadTitleChange: (title: string) => void; onOpenWorkspace?: () => void; onOpenSettings: () => void; onSelectWorkspace?: (workspaceId: string) => Promise<boolean> }) {
  const workspaceId = workspace?.id;
  const { catalog, selectionVersion } = useModelCatalog();
  const [selected, setSelected] = useState<Model | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    void invokeTauri("model_selection", { workspaceId }).then((preference) => {
      setSelected(preference.model);
    }).catch(() => setSelected(null));
  }, [selectionVersion, workspaceId]);

  const availableModels = catalog.models.filter(({ available }) => available);
  const model = availableModels.find(({ provider, id }) => provider === selected?.provider && id === selected?.id) ?? null;
  useEffect(() => { onModelChange(model); }, [model, onModelChange]);

  if (!workspace) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="model-catalog">
      <ThreadRunner key={workspace.id} workspace={workspace} workspaces={workspaces} models={availableModels} model={model} workspaceActions={workspaceActions} changesOpen={changesOpen} onChangesOpenChange={onChangesOpenChange} changesTreeVisible={changesTreeVisible} onModelChange={setSelected} onThreadTitleChange={onThreadTitleChange} onOpenWorkspace={onOpenWorkspace} onOpenSettings={onOpenSettings} onSelectWorkspace={onSelectWorkspace} sidebarVisible={sidebarVisible} />
    </div>
  );
}
