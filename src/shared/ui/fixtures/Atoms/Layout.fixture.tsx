import { ScrollArea, ScrollBar } from "@/shared/ui/scroll-area";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/shared/ui/resizable";
import { Separator } from "@/shared/ui/separator";

export default <div className="grid gap-6">
  <ResizablePanelGroup className="h-48 rounded-lg border" orientation="horizontal"><ResizablePanel defaultSize={50}><div className="grid h-full place-items-center p-4">Sidebar</div></ResizablePanel><ResizableHandle withHandle /><ResizablePanel defaultSize={50}><div className="grid h-full place-items-center p-4">Content</div></ResizablePanel></ResizablePanelGroup>
  <Separator />
  <ScrollArea className="h-28 rounded-md border p-4"><div className="space-y-2">{Array.from({ length: 8 }, (_, index) => <p key={index}>Scrollable timeline item {index + 1}</p>)}</div><ScrollBar /></ScrollArea>
</div>;
