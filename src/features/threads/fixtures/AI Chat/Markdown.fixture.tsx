import { MarkdownMessage } from "@/features/threads/markdown-message";

const markdown = `## AI Chat markdown

Supports **emphasis**, lists, links, and highlighted code.

1. \`read\` → package.json
2. \`bash\` → printed \`pwd\`
3. \`write\` → created a file

\`\`\`ts
const answer: string = "smallest complete slice";
\`\`\``;

export default <div className="mx-auto max-w-3xl"><MarkdownMessage>{markdown}</MarkdownMessage></div>;
