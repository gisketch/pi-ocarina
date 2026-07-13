import { useEffect, useState } from "react";
import { WorkspaceCatalog } from "@/features/workspaces/workspace-catalog";
import { MatrixBackground } from "@/shared/ui/matrix-background";
import { FileDiffIcon, ListTreeIcon, MessageSquarePlusIcon, PanelLeftIcon } from "@/shared/ui/icon";
import { Button } from "@/shared/ui/button";
import { SettingsWorkspace } from "@/features/settings/settings-workspace";
import { parseAgentHostEvent } from "@/shared/contracts/agent";
import type { Preferences } from "@/shared/contracts/app";
import { invokeTauri, listenTauri } from "@/shared/lib/tauri-client";
import { applyAppearancePreferences, invalidAppearancePreference, normalizeAppearancePreferences } from "@/features/appearance/appearance-preferences";
import { ModelCatalogProvider } from "@/features/models/model-catalog-context";

export function App() {
  const [runtime, setRuntime] = useState("Starting bundled Pi…");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [threadTitle, setThreadTitle] = useState("New thread");
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesTreeVisible, setChangesTreeVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  useEffect(() => {
    const sync = (next: Preferences) => { setSettingsError(invalidAppearancePreference(next) ? "Some appearance values were invalid and have been reset safely." : ""); const normalized = normalizeAppearancePreferences(next); setPreferences(normalized); setSidebarVisible(normalized.sidebar_visible); applyAppearancePreferences(normalized); };
    let unlisten = () => {};
    void invokeTauri("app_state_snapshot").then(({ state }) => sync(state.preferences)).catch(() => {});
    void listenTauri("app-state://changed", ({ payload }) => sync(payload.preferences)).then((stop) => { unlisten = stop; });
    return () => unlisten();
  }, []);

  useEffect(() => {
    const openSettings = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key === ",") { event.preventDefault(); setSettingsOpen(true); } };
    addEventListener("keydown", openSettings);
    return () => removeEventListener("keydown", openSettings);
  }, []);

  const savePreferences = async (change: Partial<Preferences>) => {
    if (!preferences) return;
    const state = await invokeTauri("set_preferences", { preferences: { ...preferences, ...change } });
    const normalized = normalizeAppearancePreferences(state.preferences);
    setPreferences(normalized);
    applyAppearancePreferences(normalized);
  };

  const toggleSidebar = () => {
    const next = !sidebarVisible;
    setSidebarVisible(next);
    if (preferences) void invokeTauri("set_preferences", { preferences: { ...preferences, sidebar_visible: next } }).then(({ preferences: saved }) => setPreferences(saved)).catch(() => {});
  };

  useEffect(() => {
    const requestId = crypto.randomUUID();
    let unlisten = () => {};
    void listenTauri("agent-host-event", ({ payload }) => {
      const event = parseAgentHostEvent(payload);
      if (event.requestId !== requestId || event.type === "started") return;
      setRuntime(event.type === "completed" ? "Bundled Pi ready" : event.type === "failed" || event.type === "cancelled" ? event.payload.message ?? event.type : event.type);
    }).then(async (stopListening) => {
      unlisten = stopListening;
      try {
        await invokeTauri("start_agent_host");
        await invokeTauri("send_agent_request", {
          request: { version: 1, requestId, operation: "createSession", payload: {} },
        });
      } catch (error) {
        setRuntime(String(error));
      }
    });
    return () => unlisten();
  }, []);

  return (
    <ModelCatalogProvider><main
      className="h-screen overflow-hidden bg-transparent text-foreground"
      data-testid="app-ready"
    >
      <span className="sr-only">PiOcarina</span>
      <MatrixBackground sidebarVisible={sidebarVisible} />
      <span className="sr-only" data-testid="runtime-status">{runtime}</span>
      <header className={`pb-titlebar${sidebarVisible ? " pb-titlebar-sidebar-visible" : ""}${settingsOpen ? " pb-titlebar-settings" : ""}`} aria-label="Window toolbar">
        <div className="pb-titlebar-sidebar">{!settingsOpen && <Button aria-label={sidebarVisible ? "Hide sidebar" : "Show sidebar"} aria-pressed={sidebarVisible} size="icon-sm" variant="ghost" onClick={toggleSidebar}><PanelLeftIcon /></Button>}</div>
        <div className="pb-titlebar-main"><div className="flex min-w-0 flex-1 self-stretch items-center gap-2" data-tauri-drag-region>{settingsOpen ? <span className="truncate">Settings</span> : <><MessageSquarePlusIcon /><span className="truncate">{threadTitle}</span></>}</div>{!settingsOpen && <>{changesOpen && <Button aria-label={changesTreeVisible ? "Hide file tree" : "Show file tree"} aria-pressed={changesTreeVisible} size="icon-sm" variant="ghost" onClick={() => setChangesTreeVisible((visible) => !visible)}><ListTreeIcon /></Button>}<Button aria-label={changesOpen ? "Hide Changes" : "Show Changes"} aria-pressed={changesOpen} size="icon-sm" variant="ghost" onClick={() => setChangesOpen((open) => !open)}><FileDiffIcon /></Button></>}</div>
      </header>
      <div className="pb-app-layer grid h-full min-h-0"><div className={`col-start-1 row-start-1 min-h-0${settingsOpen ? " opacity-0" : ""}`} data-testid="workspace-layer" aria-hidden={settingsOpen} inert={settingsOpen}><WorkspaceCatalog changesOpen={changesOpen} onChangesOpenChange={setChangesOpen} changesTreeVisible={changesTreeVisible} sidebarVisible={sidebarVisible} onThreadTitleChange={setThreadTitle} onOpenSettings={() => setSettingsOpen(true)} /></div>{settingsOpen && preferences && <div className="col-start-1 row-start-1 min-h-0"><SettingsWorkspace error={settingsError} preferences={preferences} onBack={() => setSettingsOpen(false)} onSave={savePreferences} /></div>}</div>
    </main></ModelCatalogProvider>
  );
}
