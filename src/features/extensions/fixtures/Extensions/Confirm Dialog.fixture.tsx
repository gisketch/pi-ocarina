import { ExtensionPromptDialog } from "@/features/extensions/extension-runtime-ui";

export default <ExtensionPromptDialog prompt={{ threadId: "fixture", promptId: "confirm", kind: "confirm", title: "Run database migration?", message: "This will update the local development database." }} value="" onValueChange={() => {}} onResolve={() => {}} />;
