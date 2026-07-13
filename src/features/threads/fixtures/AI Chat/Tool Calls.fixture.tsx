import { ToolCall } from "@/features/threads/chat-message";

const openFile = () => {};

export default <div className="mx-auto grid max-w-3xl gap-3">
  <ToolCall onOpenFile={openFile} tool={{ role: "tool", toolCallId: "write-live", toolName: "write", status: "preparing", input: { path: "src/live-draft.ts", content: "export function streaming() {\n  return true;\n}" } }} />
  <ToolCall onOpenFile={openFile} tool={{ role: "tool", toolCallId: "edit-live", toolName: "edit", status: "preparing", input: { path: "src/App.tsx", edits: [{ oldText: "return null;", newText: "return <main />;" }] } }} />
  <ToolCall tool={{ role: "tool", toolCallId: "bash-preparing", toolName: "bash", status: "preparing", input: { command: "bun run test:frontend-unit" } }} />
  <ToolCall defaultOpen onOpenFile={openFile} tool={{ role: "tool", toolName: "read", status: "completed", input: { path: "src/App.tsx" }, output: "export function App() {\n  return <main />;\n}" }} />
  <ToolCall defaultOpen onOpenFile={openFile} tool={{ role: "tool", toolName: "edit", status: "completed", input: { path: "src/keymap.ts", edits: [{ oldText: "if ([\"ArrowDown\", \"ArrowUp\", \"KeyZ\", \"KeyX\", \"KeyC\", \"KeyR\"].includes(event.code)) {\n  handleKey(event);\n}", newText: "if ([\"ArrowDown\", \"ArrowUp\", \"KeyZ\", \"KeyX\", \"KeyA\", \"KeyD\", \"KeyC\", \"ShiftLeft\", \"ShiftRight\", \"KeyR\"].includes(event.code)) {\n  handleKeyboardShortcut(event);\n}" }] } }} />
  <ToolCall defaultOpen onOpenFile={openFile} tool={{ role: "tool", toolName: "write", status: "completed", input: { path: "src/new-file.ts", content: "export const ready = true;" }, output: "Created file" }} />
  <ToolCall tool={{ role: "tool", toolName: "bash", status: "running", input: { command: "bun run build" }, output: "transforming modules…" }} />
  <ToolCall defaultOpen tool={{ role: "tool", toolName: "bash", status: "failed", input: { command: "bun test" }, output: "Expected 2 fixtures, found 1" }} />
  <ToolCall defaultOpen tool={{ role: "tool", toolName: "grep", status: "completed", input: { pattern: "ToolCall", path: "src", glob: "*.tsx" }, output: "src/features/threads/tool-call.tsx:7:export function ToolCall" }} />
  <ToolCall tool={{ role: "tool", toolName: "find", status: "completed", input: { pattern: "*.fixture.tsx", path: "src" }, output: "src/features/threads/fixtures/AI Chat/Tool Calls.fixture.tsx" }} />
  <ToolCall tool={{ role: "tool", toolName: "ls", status: "completed", input: { path: "src/features/threads" }, output: "chat-message.tsx\ntool-call.tsx\ntool-presentation.ts" }} />
  <ToolCall tool={{ role: "tool", toolName: "bash", status: "completed", input: { command: "bun run typecheck:frontend && bun run test:frontend-unit && bun run build" }, output: "All checks passed" }} />
  <ToolCall tool={{ role: "tool", toolName: "read", status: "completed", input: { unexpected: true }, output: { nested: { unsupported: true } } }} />
  <ToolCall defaultOpen tool={{ role: "tool", toolName: "deploy_preview", status: "completed", input: { environment: "staging", region: "ap-southeast-1" }, output: "Preview available" }} />
  <ToolCall tool={{ role: "tool", toolCallId: "extension-live", toolName: "deploy_preview", status: "running", input: { environment: "staging" }, output: "Uploading 50%" }} />
</div>;
