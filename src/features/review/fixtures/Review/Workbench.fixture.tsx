import { useState } from "react";
import { CompactFileTree } from "@/features/review/compact-file-tree";
import { EditorDiff } from "@/shared/ui/editor-diff";
import { parseUnifiedDiff } from "@/shared/ui/editor-model";
import { Input } from "@/shared/ui/input";
import { SearchIcon } from "@/shared/ui/icon";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/shared/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";

const items = [{ path: "src/features/review/changes-panel.tsx", status: "M" }, { path: "src/styles.css", status: "M" }, { path: "README.md", status: "A" }];
const model = parseUnifiedDiff("@@ -10,3 +10,3 @@\n-old color\n+new color\n same line");

export default function WorkbenchFixture() {
  const [selected, setSelected] = useState(items[0]!.path);
  const [query, setQuery] = useState("");
  const [treeVisible] = useState(true);
  return <div className="pb-changes-panel h-[36rem] w-[56rem]"><header className="pb-review-header"><Tabs defaultValue="changes"><TabsList><TabsTrigger value="changes">Changes (3)</TabsTrigger><TabsTrigger value="files">Files (0/3)</TabsTrigger></TabsList></Tabs></header><ResizablePanelGroup className="pb-review-layout" orientation="horizontal"><ResizablePanel defaultSize="72%" minSize="50%" maxSize={treeVisible ? "80%" : "100%"}><section className="pb-review-editor"><div className="pb-review-editor-header">{selected}<span className="pb-review-positive ml-auto">+1</span><span className="text-destructive">-1</span></div><EditorDiff density="workbench" lines={model.lines} path={selected} /></section></ResizablePanel>{treeVisible && <><ResizableHandle /><ResizablePanel defaultSize="28%" minSize="20%" maxSize="50%"><aside className="pb-review-tree"><label className="pb-review-filter"><SearchIcon /><Input placeholder="Filter files…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><CompactFileTree items={items} query={query} selectedPath={selected} onSelect={setSelected} /></aside></ResizablePanel></>}</ResizablePanelGroup></div>;
}
