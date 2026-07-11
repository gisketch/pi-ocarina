// @ts-check
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PanelLeftIcon } from "@/shared/ui/icon";
import { useEffect, useState } from "react";

import { Button } from "@/shared/ui/button";

/** @typedef {{ theme: string, transparency: boolean, sidebar_visible: boolean }} Preferences */
const defaults = { theme: "dark", transparency: false, sidebar_visible: true };

function applyAppearance(/** @type {Preferences} */ preferences) {
  document.documentElement.classList.add("dark");
  document.documentElement.classList.toggle("transparent", preferences.transparency);
  document.documentElement.style.colorScheme = "dark";
}

export function AppearanceControls(/** @type {{ onSidebarChange: (visible: boolean) => void }} */ { onSidebarChange }) {
  const [preferences, setPreferences] = useState(/** @type {Preferences} */ (defaults));
  const [supportsTransparency, setSupportsTransparency] = useState(false);

  const save = async (/** @type {Partial<Preferences>} */ change) => {
    const next = { ...preferences, ...change, theme: "dark" };
    const state = await invoke("set_preferences", { preferences: next });
    setPreferences(state.preferences);
  };

  useEffect(() => {
    const sync = (/** @type {Partial<Preferences>} */ next) => {
      const value = { ...defaults, ...next, theme: "dark" };
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
