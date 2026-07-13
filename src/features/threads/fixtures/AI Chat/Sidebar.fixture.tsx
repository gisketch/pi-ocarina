import {
  FolderFilledIcon,
  FolderOpenIcon,
  MessageSquarePlusIcon,
  MoreHorizontalIcon,
  PlusIcon,
} from "@/shared/ui/icon";
import { Button } from "@/shared/ui/button";
import { AnimatedProceduralAvatar } from "@/shared/ui/cell-matrix";

const threads = [
  { id: "cosmos", title: "Cosmos component catalog" },
  { id: "runtime", title: "Fix packaged runtime", running: true },
  { id: "subagents", title: "Plan subagent UI", attention: true },
];
const color = "#4ade80";

export default function SidebarFixture() {
  return <nav className="pb-sidebar flex h-[34rem] w-72 flex-col overflow-hidden border p-3" aria-label="Threads">
    <h1 className="px-2 pb-4 pt-1 font-heading text-xl text-foreground">Pi<span style={{ color }}>Ocarina</span></h1>
    <Button className="grid w-full grid-cols-[14px_minmax(0,1fr)] justify-start gap-2 px-2 text-left text-foreground" size="sm" variant="ghost"><MessageSquarePlusIcon /><span>New thread</span></Button>
    <div className="flex items-center pb-3 pt-6" data-workspace-header><h2 className="flex-1 px-2 text-sm text-muted-foreground" data-sidebar-heading>Workspaces</h2><div className="flex w-14 justify-end"><Button className="pb-workspace-add shrink-0 text-foreground" aria-label="Open workspace" title="Open workspace" size="icon-sm" variant="ghost"><PlusIcon /></Button></div></div>
    <div className="pb-workspace-row group relative">
      <Button aria-expanded="true" className="pb-workspace-disclosure grid w-full grid-cols-[14px_minmax(0,1fr)] justify-start gap-2 px-2 pr-16 text-left text-foreground" effects="row-highlight" size="sm" variant="ghost"><FolderOpenIcon style={{ color }} /><span className="truncate">pi-ocarina</span></Button>
      <div className="pb-workspace-actions absolute inset-y-0 right-0 flex w-14"><Button aria-label="Project actions" size="icon-sm" variant="ghost"><MoreHorizontalIcon /></Button><Button aria-label="New thread in pi-ocarina" size="icon-sm" variant="ghost"><PlusIcon /></Button></div>
    </div>
    <div className="space-y-1">{threads.map((thread) => <Button className="grid w-full grid-cols-[minmax(0,1fr)_14px] justify-start gap-2 px-2 pl-8 text-left text-foreground" effects="row-highlight" key={thread.id} size="sm" variant="ghost"><span className="truncate">{thread.title}</span><span className="relative"><AnimatedProceduralAvatar seed={thread.id} color={color} {...(thread.running ? { running: true } : {})} />{thread.attention && <span aria-label="Needs attention" className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-primary" />}</span>{thread.running && <span className="sr-only">Running</span>}</Button>)}</div>
    <div className="pb-workspace-row group relative mt-1">
      <Button aria-expanded="false" className="pb-workspace-disclosure grid w-full grid-cols-[14px_minmax(0,1fr)] justify-start gap-2 px-2 pr-16 text-left text-foreground" effects="row-highlight" size="sm" variant="ghost"><FolderFilledIcon /><span className="truncate">collapsed-worktree</span></Button>
      <div className="pb-workspace-actions invisible absolute inset-y-0 right-0 flex w-14 opacity-0 group-hover:visible group-hover:opacity-100"><Button aria-label="Worktree actions" size="icon-sm" variant="ghost"><MoreHorizontalIcon /></Button><Button aria-label="New thread in collapsed-worktree" size="icon-sm" variant="ghost"><PlusIcon /></Button></div>
    </div>
  </nav>;
}
