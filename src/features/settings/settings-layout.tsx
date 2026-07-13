import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button";

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="pb-settings-section" aria-labelledby={`settings-${title.toLowerCase().replaceAll(" ", "-")}`}><h2 id={`settings-${title.toLowerCase().replaceAll(" ", "-")}`}>{title}</h2><div className="pb-settings-card">{children}</div></section>;
}

export function SettingRow({ id, label, description, children }: { id: string; label: string; description?: string; children: ReactNode }) {
  return <div className="pb-settings-row" id={id}><div className="min-w-0"><h3>{label}</h3>{description && <p>{description}</p>}</div><div className="pb-settings-control">{children}</div></div>;
}

export function SettingToggle({ checked, label, onChange, disabled = false }: { checked: boolean; label: string; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <Button className="pb-settings-toggle" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} size="sm" variant="ghost" onClick={() => onChange(!checked)}><span aria-hidden /></Button>;
}
