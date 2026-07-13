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
export type ProjectColor = { name: string; primary: string; foreground: string };

let activePalette: readonly string[] = PROJECT_COLORS.map(({ primary }) => primary);

export function setProjectPalette(palette?: readonly string[]) {
  activePalette = palette?.length === PROJECT_COLORS.length ? palette : PROJECT_COLORS.map(({ primary }) => primary);
}

export function projectColor(workspace: Pick<Workspace, "id" | "root_workspace_id">) {
  const index = stableHash(workspace.root_workspace_id || workspace.id) % PROJECT_COLORS.length;
  const base = PROJECT_COLORS[index]!;
  const primary = activePalette[index] ?? base.primary;
  return { ...base, primary, foreground: readableForeground(primary) };
}

function readableForeground(color: string) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16) / 255).map((value) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722 > .45 ? "#020203" : "#f8f8ff";
}

export function projectColorVariables(color: ProjectColor) {
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
