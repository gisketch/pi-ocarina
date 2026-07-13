import { useState } from "react";
import { ExtensionPromptDialog } from "@/features/extensions/extension-runtime-ui";

export default function InputDialogFixture() {
  const [value, setValue] = useState("feature/extension-ui");
  return <ExtensionPromptDialog prompt={{ threadId: "fixture", promptId: "input", kind: "input", title: "Branch name", message: "Enter the name for the new branch." }} value={value} onValueChange={setValue} onResolve={() => {}} />;
}
