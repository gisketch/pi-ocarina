import { useState } from "react";
import { Composer } from "@/features/composer/composer";

const model = { provider: "anthropic", id: "claude-sonnet-4", name: "Claude Sonnet 4" };

export default function ComposerFixture() {
  const [value, setValue] = useState("Build the smallest complete slice");
  return <div className="mx-auto max-w-4xl pt-80"><Composer workspaceId="fixture-workspace" value={value} running={false} models={[model]} model={model} onChange={setValue} onAttachments={() => {}} onAttachmentError={() => {}} onSend={() => {}} onSteer={() => {}} onStop={() => {}} onModelChange={() => {}} onThinkingChange={() => {}} /></div>;
}
