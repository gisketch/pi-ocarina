import { MessageSquarePlusIcon } from "@/shared/ui/icon";
import { Button } from "@/shared/ui/button";

const threads = ["Cosmos component catalog", "Fix packaged runtime", "Plan subagent UI"];

export default function SidebarFixture() {
  return <nav className="pb-sidebar flex h-[34rem] w-72 flex-col overflow-hidden border p-3" aria-label="Threads">
    <h1 className="px-2 pb-4 pt-1 font-heading text-xl text-foreground">Pi<span className="text-primary">Ocarina</span></h1>
    <Button className="w-full justify-start" size="sm" variant="secondary"><MessageSquarePlusIcon />New thread</Button>
    <h2 className="px-2 pb-1 pt-5 text-xs text-muted-foreground" data-sidebar-heading>Projects</h2>
    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">{threads.map((thread) => <Button className="w-full justify-start truncate" effects="row-highlight" key={thread} size="sm" variant="ghost">{thread}</Button>)}</div>
  </nav>;
}
