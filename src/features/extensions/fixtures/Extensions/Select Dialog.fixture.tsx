import { useState } from "react";
import { ExtensionPromptDialog } from "@/features/extensions/extension-runtime-ui";

export default function SelectDialogFixture() {
  const [value, setValue] = useState("Keep current branch");
  return <ExtensionPromptDialog prompt={{ threadId: "fixture", promptId: "select", kind: "select", title: "Choose deployment strategy", options: ["Keep current branch", "Create a release branch", "Cancel deployment"] }} value={value} onValueChange={setValue} onResolve={() => {}} />;
}
