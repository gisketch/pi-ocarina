import type { Workspace } from "@/shared/contracts/app";
import { stableHash } from "@/shared/lib/stable-hash";

export const PROJECT_COLORS = [
  { name: "blue", primary: "#168bff", foreground: "#020203" },
  { name: "cyan", primary: "#00dff2", foreground: "#020203" },
  { name: "green", primary: "#20e66f", foreground: "#020203" },
  { name: "yellow", primary: "#ffd000", foreground: "#020203" },
  { name: "orange", primary: "#ff8a1f", foreground: "#020203" },
  { name: "red", primary: "#ff4d67", foreground: "#020203" },
  { name: "purple", primary: "#b14dff", foreground: "#020203" },
  { name: "pink", primary: "#ff4fa3", foreground: "#020203" },
] as const;

export function projectColor(workspace: Pick<Workspace, "id" | "root_workspace_id">) {
  return PROJECT_COLORS[stableHash(workspace.root_workspace_id || workspace.id) % PROJECT_COLORS.length]!;
}

export function projectColorVariables(color: (typeof PROJECT_COLORS)[number]) {
  return {
    "--pb-primary": color.primary,
    "--pb-primary-foreground": color.foreground,
    "--primary": color.primary,
    "--primary-foreground": color.foreground,
    "--ring": color.primary,
    "--sidebar-primary": color.primary,
    "--sidebar-primary-foreground": color.foreground,
    "--sidebar-ring": color.primary,
  };
}
