import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { Icon } from "@/shared/ui/icon";
import { invokeTauri } from "@/shared/lib/tauri-client";
import type { Preferences } from "@/shared/contracts/app";
import { applyAppearancePreferences } from "@/features/appearance/appearance-preferences";
import { PROJECT_COLORS } from "@/features/appearance/project-color";
import { SettingRow, SettingsSection } from "./settings-layout";

function FontSelector({ label, value, families, onChange }: { label: string; value: string | null | undefined; families: string[]; onChange: (family: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const options = families.filter((family) => family.toLowerCase().includes(query.toLowerCase())).slice(0, 100);
  return <div className="flex items-start gap-2"><div className="pb-font-selector"><DropdownMenu open={open} onOpenChange={(next) => { setOpen(next); if (next) { setQuery(""); requestAnimationFrame(() => inputRef.current?.focus()); } }}><DropdownMenuTrigger asChild><Button className="w-full justify-between" aria-label={label} variant="outline"><span className="truncate">{value ?? "Default"}</span><Icon name="chevron-down" size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent className="z-[100] min-w-64" align="end"><Input ref={inputRef} aria-label={`Search ${label.toLowerCase()}`} className="mb-1" placeholder="Search fonts…" value={query} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onChange={(event) => setQuery(event.target.value)} /><DropdownMenuRadioGroup value={value ?? ""} onValueChange={onChange}>{options.map((family) => <DropdownMenuRadioItem key={family} value={family} style={{ fontFamily: JSON.stringify(family) }}>{family}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>{options.length === 0 && <p className="px-2 py-1.5 text-muted-foreground">No matching fonts.</p>}</DropdownMenuContent></DropdownMenu><p className="pb-font-preview" style={{ fontFamily: value ? `${JSON.stringify(value)}, sans-serif` : undefined }}>Aa Pi Ocarina 0123</p></div>{value && <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Reset</Button>}</div>;
}

export function AppearanceSettings({ preferences, visibleIds, onSave, fontFamilies }: { preferences: Preferences; visibleIds: Set<string>; onSave: (change: Partial<Preferences>) => Promise<void>; fontFamilies?: string[] }) {
  const [families, setFamilies] = useState<string[]>(fontFamilies ?? []);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(preferences);
  const pendingRef = useRef<Partial<Preferences> | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => setDraft(preferences), [preferences]);
  useEffect(() => { if (!fontFamilies) void invokeTauri("system_font_families").then(({ families: found }) => setFamilies(found)).catch((cause) => setError(String(cause))); }, [fontFamilies]);
  const preview = (change: Partial<Preferences>) => { const next = { ...draft, ...change }; setDraft(next); applyAppearancePreferences(next); };
  const flushPending = useCallback(() => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) void onSaveRef.current(pending);
  }, []);
  const queueSave = (change: Partial<Preferences>) => {
    pendingRef.current = { ...pendingRef.current, ...change };
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(flushPending, 180);
  };
  useEffect(() => {
    window.addEventListener("beforeunload", flushPending);
    return () => { window.removeEventListener("beforeunload", flushPending); flushPending(); };
  }, [flushPending]);
  const palette = draft.project_palette?.length === PROJECT_COLORS.length ? draft.project_palette : PROJECT_COLORS.map(({ primary }) => primary);
  const savePalette = (index: number, color: string) => { const next = [...palette]; next[index] = color; preview({ project_palette: next }); return next; };
  return <>
    {error && <p className="mb-4 text-destructive" role="alert">System fonts unavailable. Current defaults remain active.</p>}
    <SettingsSection title="Typography">
      {visibleIds.has("application-font") && <SettingRow id="application-font" label="Application font" description="Used by interface controls and chat prose."><FontSelector label="Application font" value={preferences.application_font} families={families} onChange={(application_font) => void onSave({ application_font })} /></SettingRow>}
      {visibleIds.has("code-font") && <SettingRow id="code-font" label="Code font" description="Used by headings, composer, code, diffs, and tool calls."><FontSelector label="Code font" value={preferences.code_font} families={families} onChange={(code_font) => void onSave({ code_font })} /></SettingRow>}
    </SettingsSection>
    <div className="mt-4 flex justify-end"><Button variant="outline" onClick={() => void onSave({ application_font: null, code_font: null })}>Reset fonts</Button></div>
    <SettingsSection title="Colors">
      {visibleIds.has("interface-accent") && <SettingRow id="interface-accent" label="Interface accent" description="Used when no project color is active."><div className="flex items-center gap-2"><input aria-label="Interface accent color" type="color" value={draft.interface_accent ?? "#3b82f6"} onChange={(event) => { const change = { interface_accent: event.target.value }; preview(change); queueSave(change); }} onBlur={flushPending} /><Input aria-label="Interface accent hex" className="w-28" value={draft.interface_accent ?? "#3b82f6"} onChange={(event) => { if (/^#[0-9a-f]{6}$/i.test(event.target.value)) { const change = { interface_accent: event.target.value }; preview(change); queueSave(change); } }} onBlur={flushPending} /></div></SettingRow>}
      {visibleIds.has("background-brightness") && <SettingRow id="background-brightness" label="Background brightness" description="Adjust all dark surfaces while preserving their hierarchy."><div className="flex min-w-60 items-center gap-3"><input className="w-full" aria-label="Background brightness" type="range" min="-2" max="28" value={draft.background_brightness ?? 0} onChange={(event) => { const change = { background_brightness: Number(event.target.value) }; preview(change); queueSave(change); }} onPointerUp={flushPending} onBlur={flushPending} /><output>{draft.background_brightness ?? 0}</output></div></SettingRow>}
      {visibleIds.has("project-palette") && <SettingRow id="project-palette" label="Project palette" description="Stable color slots used by workspace identities."><div className="pb-settings-palette">{palette.map((color, index) => <label className="flex items-center gap-2" key={PROJECT_COLORS[index]!.name} title={PROJECT_COLORS[index]!.name}><input aria-label={`${PROJECT_COLORS[index]!.name} project color`} type="color" value={color} onChange={(event) => { const project_palette = savePalette(index, event.target.value); queueSave({ project_palette }); }} onBlur={flushPending} /><Input aria-label={`${PROJECT_COLORS[index]!.name} project color hex`} className="w-24" value={color} onChange={(event) => { if (/^#[0-9a-f]{6}$/i.test(event.target.value)) { const project_palette = savePalette(index, event.target.value); queueSave({ project_palette }); } }} onBlur={flushPending} /></label>)}</div></SettingRow>}
    </SettingsSection>
    <div className="mt-4 flex justify-end"><Button variant="outline" onClick={() => { preview({ interface_accent: null, background_brightness: 0, project_palette: [] }); void onSave({ interface_accent: null, background_brightness: 0, project_palette: [] }); }}>Reset colors</Button></div>
    <div className="mt-8 flex justify-end"><Button onClick={() => { const reset = { application_font: null, code_font: null, interface_accent: null, background_brightness: 0, project_palette: [] }; preview(reset); void onSave(reset); }}>Reset appearance</Button></div>
  </>;
}
