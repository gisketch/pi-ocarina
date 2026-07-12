import { ToolCall } from "@/features/threads/chat-message";

export default <div className="mx-auto grid max-w-3xl gap-3">
  <ToolCall tool={{ role: "tool", toolName: "Read", status: "completed", input: { path: "src/App.tsx" }, output: "export function App() { … }" }} />
  <ToolCall tool={{ role: "tool", toolName: "Build", status: "running", input: "bun run build" }} />
  <ToolCall tool={{ role: "tool", toolName: "Test", status: "failed", output: "Expected 2 fixtures, found 1" }} />
</div>;
