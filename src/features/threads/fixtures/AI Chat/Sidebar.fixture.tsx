import { FolderOpenIcon, MessageSquarePlusIcon, PlusIcon } from "@/shared/ui/icon";
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
    <h1 className="px-2 pb-4 pt-1 font-heading text-xl text-foreground">Pi<span className="text-primary">Ocarina</span></h1>
    <Button className="grid w-full grid-cols-[14px_minmax(0,1fr)] justify-start gap-2 px-2 text-left" size="sm" variant="secondary"><MessageSquarePlusIcon /><span>New thread</span></Button>
    <div className="flex items-center px-2 pb-3 pt-6" data-workspace-header><h2 className="flex-1 text-sm text-muted-foreground" data-sidebar-heading>Workspaces</h2><Button className="pb-workspace-add shrink-0 text-foreground" aria-label="Open workspace" title="Open workspace" size="icon-sm" variant="ghost"><PlusIcon /></Button></div>
    <Button className="grid w-full grid-cols-[14px_minmax(0,1fr)] justify-start gap-2 px-2 text-left" effects="row-highlight" size="sm" variant="secondary"><FolderOpenIcon /><span className="truncate">pi-ocarina</span></Button>
    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">{threads.map((thread) => <Button className="grid w-full grid-cols-[14px_minmax(0,1fr)] justify-start gap-2 px-2 text-left" effects="row-highlight" key={thread.id} size="sm" variant="ghost"><span className="relative"><AnimatedProceduralAvatar seed={thread.id} color={color} {...(thread.running ? { running: true } : {})} />{thread.attention && <span aria-label="Needs attention" className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-primary" />}</span><span className="truncate">{thread.title}</span>{thread.running && <span className="sr-only">Running</span>}</Button>)}</div>
  </nav>;
}
