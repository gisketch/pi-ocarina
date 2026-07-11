// @ts-check
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MonitorIcon, MoonIcon, PanelLeftIcon, SunIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

/** @type {Array<{ name: string, Icon: import("react").ComponentType }>} */
const themes = [
  { name: "system", Icon: MonitorIcon },
  { name: "light", Icon: SunIcon },
  { name: "dark", Icon: MoonIcon },
];

/** @typedef {{ theme: string, transparency: boolean, sidebar_visible: boolean }} Preferences */
const defaults = { theme: "system", transparency: false, sidebar_visible: true };

function applyAppearance(/** @type {Preferences} */ preferences) {
  const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", preferences.theme === "dark" || (preferences.theme === "system" && systemDark));
  document.documentElement.classList.toggle("transparent", preferences.transparency);
  document.documentElement.style.colorScheme = preferences.theme === "system" ? "light dark" : preferences.theme;
}

export function AppearanceControls(/** @type {{ onSidebarChange: (visible: boolean) => void }} */ { onSidebarChange }) {
  const [preferences, setPreferences] = useState(/** @type {Preferences} */ (defaults));
  const [supportsTransparency, setSupportsTransparency] = useState(false);

  const save = async (/** @type {Partial<Preferences>} */ change) => {
    const next = { ...preferences, ...change };
    const state = await invoke("set_preferences", { preferences: next });
    setPreferences(state.preferences);
  };

  useEffect(() => {
    const sync = (/** @type {Partial<Preferences>} */ next) => {
      const value = { ...defaults, ...next };
      setPreferences(value);
      applyAppearance(value);
      onSidebarChange(value.sidebar_visible);
    };
    void invoke("appearance_support").then(({ transparency }) => setSupportsTransparency(transparency));
    void invoke("app_state_snapshot").then(({ state }) => sync(state.preferences));
    const listener = listen("app-state://changed", ({ payload }) => sync(payload.preferences));
    return () => void listener.then((stop) => stop());
  }, [onSidebarChange]);

  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const systemChange = () => preferences.theme === "system" && applyAppearance(preferences);
    media.addEventListener("change", systemChange);
    return () => media.removeEventListener("change", systemChange);
  }, [preferences]);

  useEffect(() => {
    const shortcut = (/** @type {KeyboardEvent} */ event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        void save({ sidebar_visible: !preferences.sidebar_visible });
      }
    };
    addEventListener("keydown", shortcut);
    return () => removeEventListener("keydown", shortcut);
  });

  return (
    <div className="flex flex-wrap items-center gap-1" aria-label="Appearance">
      {themes.map(({ name, Icon }) => (
        <Tooltip key={name}>
          <TooltipTrigger asChild>
            <Button size="icon" variant={preferences.theme === name ? "secondary" : "ghost"} aria-label={`${name} theme`} onClick={() => void save({ theme: name })}>
              <Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="">{name} theme</TooltipContent>
        </Tooltip>
      ))}
      <Button variant="ghost" aria-pressed={preferences.sidebar_visible} onClick={() => void save({ sidebar_visible: !preferences.sidebar_visible })}>
        <PanelLeftIcon /> Sidebar
      </Button>
      {supportsTransparency && (
        <Button variant="ghost" aria-pressed={preferences.transparency} onClick={() => void save({ transparency: !preferences.transparency })}>
          Transparency
        </Button>
      )}
    </div>
  );
}
