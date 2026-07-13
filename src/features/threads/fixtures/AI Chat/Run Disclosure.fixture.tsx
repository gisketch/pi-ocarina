import { RunDisclosure } from "@/features/threads/run-disclosure";
import type { RunMetadata, ThreadMessage } from "@/shared/contracts/app";

const now = Date.now();
const messages: ThreadMessage[] = [
  { role: "thinking", text: "Inspecting the current implementation.", contentKey: "0" },
  { role: "assistant", text: "I’m checking the lifecycle boundary first.", phase: "commentary", contentKey: "1" },
  { role: "tool", toolCallId: "read-1", toolName: "read", status: "completed", input: { path: "src/App.tsx" }, output: "export function App() {}" },
  { role: "assistant", text: "Implemented and verified the run disclosure.", phase: "final_answer", contentKey: "2" },
];
const metadata = (runId: string, outcome: RunMetadata["outcome"], ended = true): RunMetadata => ({ runId, startedAt: now - 116_000, ...(ended ? { endedAt: now } : {}), outcome, startMessageIndex: 0, endMessageIndex: 4 });
const inferredMessages = messages.map((message) => { const copy = { ...message }; delete copy.phase; return copy; });

export default <div className="mx-auto grid max-w-3xl gap-8">
  <RunDisclosure metadata={metadata("active", "completed", false)} messages={messages.slice(0, 3)} />
  <RunDisclosure metadata={metadata("explicit", "completed")} messages={messages} />
  <RunDisclosure metadata={metadata("fallback", "completed")} messages={inferredMessages} />
  <RunDisclosure metadata={metadata("stopped", "stopped")} messages={messages.slice(0, 3)} />
  <RunDisclosure metadata={metadata("failed", "failed")} messages={messages.slice(0, 3)} />
  <RunDisclosure metadata={metadata("interrupted", "interrupted")} messages={messages.slice(0, 3)} />
</div>;
