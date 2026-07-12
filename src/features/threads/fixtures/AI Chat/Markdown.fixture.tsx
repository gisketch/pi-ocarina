import { MarkdownMessage } from "@/features/threads/markdown-message";

const markdown = `## AI Chat markdown

Supports **emphasis**, lists, links, and highlighted code.

- Reuse real components
- Keep fixture data deterministic

\`\`\`ts
const answer: string = "smallest complete slice";
\`\`\``;

export default <div className="mx-auto max-w-3xl"><MarkdownMessage>{markdown}</MarkdownMessage></div>;
