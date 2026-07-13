import { isValidElement, type HTMLAttributes, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { invokeTauri } from "@/shared/lib/tauri-client";
import { Button } from "@/shared/ui/button";
import { CopyIcon } from "@/shared/ui/icon";

const languageAliases: Record<string, string> = {
  cs: "csharp", js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  py: "python", rb: "ruby", sh: "bash", shell: "bash", yml: "yaml",
};

/** @param {React.HTMLAttributes<HTMLDivElement> & { children: string }} props */
export function MarkdownMessage({ children, className = "", ...props }: Omit<HTMLAttributes<HTMLDivElement>, "children"> & { children: string }) {
  return (
    <div className={`markdown min-w-0 text-sm ${className}`} {...props}>
      <ReactMarkdown
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => {
            const code = isValidElement(children) ? children : undefined;
            const codeProps = code?.props as { className?: string; children?: ReactNode } | undefined;
            const language = codeProps?.className?.match(/language-([^\s]+)/)?.[1] ?? "code";
            const title = languageAliases[language] ?? language;
            const content = textContent(codeProps?.children);
            return <div className="pb-tool-code markdown-code-block">
              <div className="pb-tool-detail-header"><code>{title}</code><Button className="ml-auto" size="icon-xs" variant="ghost" aria-label={`Copy ${title} code`} onClick={() => void navigator.clipboard.writeText(content).catch(() => {})}><CopyIcon /></Button></div>
              <pre className="pb-tool-pre">{children}</pre>
            </div>;
          },
          a: ({ href, children: label }) => (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault();
                if (href) void invokeTauri("open_external_url", { url: href }).catch(() => {});
              }}
            >
              {label}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function textContent(value: ReactNode): string {
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (isValidElement(value)) return textContent((value.props as { children?: ReactNode }).children);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
