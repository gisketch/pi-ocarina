import type { HTMLAttributes } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { invokeTauri } from "@/shared/lib/tauri-client";

/** @param {React.HTMLAttributes<HTMLDivElement> & { children: string }} props */
export function MarkdownMessage({ children, className = "", ...props }: Omit<HTMLAttributes<HTMLDivElement>, "children"> & { children: string }) {
  return (
    <div className={`markdown min-w-0 overflow-hidden text-sm ${className}`} {...props}>
      <ReactMarkdown
        rehypePlugins={[rehypeHighlight]}
        components={{
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
