import { useEffect, useMemo, useState } from "react";
import { ChevronRightIcon, MonitorIcon, RobotIcon, SettingsIcon, SunIcon } from "@/shared/ui/icon";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { invokeTauri } from "@/shared/lib/tauri-client";
import type { Preferences } from "@/shared/contracts/app";
import { SettingRow, SettingsSection, SettingToggle } from "./settings-layout";
import { matchingSettings } from "./settings-search";
import { AppearanceSettings } from "./appearance-settings";
import { ProvidersSettings } from "./providers-settings";
import { NotificationsSettings } from "./notifications-settings";

const generalSettings = [
  { id: "sidebar", label: "Sidebar", description: "Show the workspace and thread sidebar in the app." },
  { id: "transparency", label: "Translucent surfaces", description: "Allow supported window surfaces to use macOS transparency." },
];
const appearanceSettings = [
  { id: "application-font", label: "Application font", description: "Interface controls and chat prose" },
  { id: "code-font", label: "Code font", description: "Headings, composer, code, diffs, and tool calls" },
  { id: "interface-accent", label: "Interface accent", description: "Default accent outside project contexts" },
  { id: "background-brightness", label: "Background brightness", description: "Lightness of all dark surfaces" },
  { id: "project-palette", label: "Project palette", description: "Workspace identity colors" },
];
const providerSettings = [
  { id: "default-model", label: "Default model", description: "Global or repository model selection" },
  { id: "credentials", label: "Provider credentials", description: "Stored and externally managed providers" },
  { id: "custom-endpoints", label: "Custom endpoints", description: "OpenAI-compatible providers" },
];
const notificationSettings = [
  { id: "notification-completed", label: "Completed notifications", description: "Background thread completion" },
  { id: "notification-failed", label: "Failed notifications", description: "Background thread failures" },
  { id: "notification-attention", label: "Attention notifications", description: "Threads that need input" },
  { id: "notification-permission", label: "macOS permission", description: "System notification access" },
];
type SettingsSectionId = "general" | "appearance" | "providers" | "notifications";
const settingsBySection: Record<SettingsSectionId, typeof generalSettings> = { general: generalSettings, appearance: appearanceSettings, providers: providerSettings, notifications: notificationSettings };

export function SettingsWorkspace({ preferences, error, onBack, onSave }: { preferences: Preferences; error?: string; onBack: () => void; onSave: (change: Partial<Preferences>) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<SettingsSectionId>("general");
  const [supportsTransparency, setSupportsTransparency] = useState(false);
  const sectionMatches = useMemo(() => Object.fromEntries((Object.keys(settingsBySection) as SettingsSectionId[]).map((id) => [id, matchingSettings(settingsBySection[id], query)])) as Record<SettingsSectionId, typeof generalSettings>, [query]);
  const matches = sectionMatches[section];
  const visibleIds = useMemo(() => new Set(matches.map(({ id }) => id)), [matches]);
  useEffect(() => { if (!query || matches.length) return; const first = (Object.keys(settingsBySection) as SettingsSectionId[]).find((id) => sectionMatches[id].length); if (first) setSection(first); }, [matches.length, query, sectionMatches]);
  useEffect(() => { void invokeTauri("appearance_support").then(({ transparency }) => setSupportsTransparency(transparency)).catch(() => setSupportsTransparency(false)); }, []);

  return <section className="pb-settings-workspace" aria-label="Settings">
    <nav className="pb-settings-nav" aria-label="Settings sections">
      <Button className="w-full justify-start px-2" effects="row-highlight" variant="ghost" onClick={onBack}><ChevronRightIcon className="rotate-180" />Back to app</Button>
      <Input aria-label="Search settings" placeholder="Search settings…" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      <p className="pb-settings-nav-label">Personal</p>
      {(!query || sectionMatches.general.length > 0) && <Button className="w-full justify-start px-2" effects="row-highlight" aria-current={section === "general" ? "page" : undefined} variant="ghost" onClick={() => setSection("general")}><SettingsIcon />General</Button>}
      {(!query || sectionMatches.appearance.length > 0) && <Button className="w-full justify-start px-2" effects="row-highlight" aria-current={section === "appearance" ? "page" : undefined} variant="ghost" onClick={() => setSection("appearance")}><SunIcon />Appearance</Button>}
      {(!query || sectionMatches.providers.length > 0) && <Button className="w-full justify-start px-2" effects="row-highlight" aria-current={section === "providers" ? "page" : undefined} variant="ghost" onClick={() => setSection("providers")}><RobotIcon />Providers</Button>}
      {(!query || sectionMatches.notifications.length > 0) && <Button className="w-full justify-start px-2" effects="row-highlight" aria-current={section === "notifications" ? "page" : undefined} variant="ghost" onClick={() => setSection("notifications")}><MonitorIcon />Notifications</Button>}
    </nav>
    <main className="pb-settings-content" tabIndex={-1}>
      <div className="pb-settings-page">
        <h1>{section === "general" ? "General" : section === "appearance" ? "Appearance" : section === "providers" ? "Providers" : "Notifications"}</h1>
        {error && <p className="mb-4 text-destructive" role="alert">{error}</p>}
        {matches.length === 0 ? <p className="text-muted-foreground">No matching settings.</p> : section === "general" ? <SettingsSection title="Application">
          {matches.some(({ id }) => id === "sidebar") && <SettingRow {...generalSettings[0]!}><SettingToggle checked={preferences.sidebar_visible} label="Show sidebar" onChange={(sidebar_visible) => void onSave({ sidebar_visible })} /></SettingRow>}
          {matches.some(({ id }) => id === "transparency") && <SettingRow {...generalSettings[1]!}><SettingToggle checked={preferences.transparency} disabled={!supportsTransparency} label="Use translucent surfaces" onChange={(transparency) => void onSave({ transparency })} /></SettingRow>}
        </SettingsSection> : section === "appearance" ? <AppearanceSettings preferences={preferences} visibleIds={visibleIds} onSave={onSave} /> : section === "providers" ? <ProvidersSettings visibleIds={visibleIds} /> : <NotificationsSettings visibleIds={visibleIds} />}
      </div>
    </main>
  </section>;
}
