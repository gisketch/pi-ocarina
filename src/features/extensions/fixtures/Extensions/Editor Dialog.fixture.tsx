import { useState } from "react";
import { ExtensionPromptDialog } from "@/features/extensions/extension-runtime-ui";

export default function EditorDialogFixture() {
  const [value, setValue] = useState("# Release notes\n\n- Added extension UI fixtures\n- Improved compatibility feedback");
  return <ExtensionPromptDialog prompt={{ threadId: "fixture", promptId: "editor", kind: "editor", title: "Edit release notes", message: "Review the generated Markdown before continuing." }} value={value} onValueChange={setValue} onResolve={() => {}} />;
}
