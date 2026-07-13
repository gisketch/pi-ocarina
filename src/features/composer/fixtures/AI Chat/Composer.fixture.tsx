import { useState } from "react";
import { Composer } from "@/features/composer/composer";

const model = { provider: "anthropic", id: "claude-sonnet-4", name: "Claude Sonnet 4" };
const skills = [
  "brainstorm", "code-review", "codebase-design", "diagnosing-bugs", "domain-modeling", "grill-me",
  "grill-with-docs", "implement", "prototype", "research", "sonata-fix", "sonata-work",
].map((name, index) => ({
  path: `/fixture/${name}/SKILL.md`,
  aliases: [`skill:${name}`],
  description: `Fixture skill ${index + 1} with a long description that verifies truncation and bounded overflow.`,
  source: "fixture",
  available: true,
}));

export default function ComposerFixture() {
  const [value, setValue] = useState("$");
  return <div className="mx-auto max-w-3xl pt-80"><Composer workspaceId="fixture-workspace" value={value} running={false} skills={skills} commands={[{ name: "review", description: "Review the current changes", source: "extension" }]} models={[model]} model={model} thinkingLevel="medium" thinkingLevels={["low", "medium", "high"]} onChange={setValue} onAttachments={() => {}} onAttachmentError={() => {}} onSend={() => {}} onSteer={() => {}} onStop={() => {}} onModelChange={() => {}} onThinkingChange={() => {}} /></div>;
}
