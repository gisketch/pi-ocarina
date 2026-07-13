import type { Preferences } from "@/shared/contracts/app";
import { setProjectPalette } from "./project-color";

const fontProperties = ["--pb-font-sans", "--pb-font-prose", "--pb-font-button", "--pb-font-mono", "--pb-font-heading"] as const;

export function appearanceFontVariables(preferences: Pick<Preferences, "application_font" | "code_font">) {
  const values: Partial<Record<(typeof fontProperties)[number], string>> = {};
  const application = preferences.application_font?.trim();
  const code = preferences.code_font?.trim();
  if (application) for (const property of fontProperties.slice(0, 3)) values[property] = `${JSON.stringify(application)}, ui-sans-serif, sans-serif`;
  if (code) for (const property of fontProperties.slice(3)) values[property] = `${JSON.stringify(code)}, ui-monospace, monospace`;
  return values;
}

export function applyAppearancePreferences(preferences: Preferences, root = document.documentElement) {
  preferences = normalizeAppearancePreferences(preferences);
  root.classList.toggle("transparent", preferences.transparency);
  const values = appearanceFontVariables(preferences);
  for (const property of fontProperties) {
    const value = values[property];
    if (value) root.style.setProperty(property, value);
    else root.style.removeProperty(property);
  }
  const theme = appearanceColorVariables(preferences);
  for (const [property, value] of Object.entries(theme)) root.style.setProperty(property, value);
  setProjectPalette(preferences.project_palette);
}

export function normalizeAppearancePreferences(preferences: Preferences): Preferences {
  const font = (value: string | null | undefined) => value && value.trim() && value.length <= 128 && ![...value].some((character) => /\p{Cc}/u.test(character)) ? value.trim() : null;
  const hex = (value: string | null | undefined) => value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
  const palette = preferences.project_palette?.length === 8 ? preferences.project_palette.map(hex) : [];
  return { ...preferences, application_font: font(preferences.application_font), code_font: font(preferences.code_font), interface_accent: hex(preferences.interface_accent), background_brightness: Math.max(-2, Math.min(28, preferences.background_brightness ?? 0)), project_palette: palette.every(Boolean) ? palette as string[] : [] };
}

export function invalidAppearancePreference(preferences: Preferences) {
  const normalized = normalizeAppearancePreferences(preferences);
  return Boolean(
    preferences.application_font && !normalized.application_font
    || preferences.code_font && !normalized.code_font
    || preferences.interface_accent && !normalized.interface_accent
    || preferences.background_brightness !== undefined && preferences.background_brightness !== normalized.background_brightness
    || preferences.project_palette?.length && normalized.project_palette?.length === 0,
  );
}

export function appearanceColorVariables(preferences: Pick<Preferences, "interface_accent" | "background_brightness">) {
  const shift = Math.max(-2, Math.min(28, preferences.background_brightness ?? 0));
  const rgb = (red: number, green = red, blue = red + 1) => `rgb(${Math.max(0, red + shift)} ${Math.max(0, green + shift)} ${Math.max(0, blue + shift)})`;
  return {
    "--pb-background": rgb(2, 2, 3), "--pb-noisy-surface-background": rgb(5, 5, 6), "--pb-surface": rgb(24, 24, 26), "--pb-surface-raised": rgb(32, 32, 35), "--terminal": rgb(10, 10, 11),
    "--pb-primary": preferences.interface_accent ?? "#3b82f6", "--pb-background-cell-shadow": String(.42 + shift / 150),
  };
}
