import type { Workspace } from "@/shared/contracts/app";
import { stableHash } from "@/shared/lib/stable-hash";

export const PROJECT_COLORS = [
  { name: "blue", primary: "#60a5fa", foreground: "#020203" },
  { name: "cyan", primary: "#22d3ee", foreground: "#020203" },
  { name: "green", primary: "#4ade80", foreground: "#020203" },
  { name: "yellow", primary: "#facc15", foreground: "#020203" },
  { name: "orange", primary: "#fb923c", foreground: "#020203" },
  { name: "red", primary: "#fb7185", foreground: "#020203" },
  { name: "purple", primary: "#c084fc", foreground: "#020203" },
  { name: "pink", primary: "#f472b6", foreground: "#020203" },
] as const;

export function projectColor(workspace: Pick<Workspace, "id" | "root_workspace_id">) {
  return PROJECT_COLORS[stableHash(workspace.root_workspace_id || workspace.id) % PROJECT_COLORS.length]!;
}
