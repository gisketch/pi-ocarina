import { ExtensionNotice } from "@/features/extensions/extension-runtime-ui";

export default <div className="mx-auto grid max-w-2xl gap-4">
  <ExtensionNotice notice={{ threadId: "fixture", type: "info", message: "Extension resources reloaded." }} onDismiss={() => {}} />
  <ExtensionNotice notice={{ threadId: "fixture", type: "warning", message: "This extension is using a compatibility fallback." }} onDismiss={() => {}} />
  <ExtensionNotice notice={{ threadId: "fixture", type: "error", message: "The extension could not complete the requested action." }} onDismiss={() => {}} />
</div>;
