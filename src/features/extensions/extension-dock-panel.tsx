import type { DockState } from "./extension-dock";

export function ExtensionDock({ dock }: { dock?: Partial<DockState> }) {
  const statuses = Object.entries(dock?.statuses ?? {});
  const widgets = Object.entries(dock?.widgets ?? {});
  if (!dock?.title && !statuses.length && !widgets.length) return null;
  return <details className="max-h-48 overflow-auto rounded-md border bg-card p-3 text-sm">
    <summary className="cursor-pointer font-medium">{dock?.title || "Extension output"}</summary>
    <div className="mt-2 space-y-2">
      {statuses.map(([key, value]) => <p key={key}><span className="text-muted-foreground">{key}:</span> {value}</p>)}
      {widgets.map(([key, value]) => <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-xs" key={key} aria-label={`Extension widget ${key}`}>{value}</pre>)}
    </div>
  </details>;
}
