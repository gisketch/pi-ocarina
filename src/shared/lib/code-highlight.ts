import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const languages = { bash, css, javascript, json, markdown, python, rust, typescript, xml, yaml };
for (const [name, language] of Object.entries(languages)) hljs.registerLanguage(name, language);

const extensionLanguage: Record<string, keyof typeof languages> = {
  bash: "bash", css: "css", html: "xml", htm: "xml", js: "javascript", jsx: "javascript",
  json: "json", md: "markdown", mdx: "markdown", mjs: "javascript", py: "python", rs: "rust",
  sh: "bash", ts: "typescript", tsx: "typescript", yaml: "yaml", yml: "yaml", zsh: "bash",
};

const cache = new Map<string, string>();
const cacheLimit = 2_000;

export function languageForPath(path: string) {
  const extension = path.split(/[?#]/, 1)[0]?.split(".").at(-1)?.toLowerCase() ?? "";
  return extensionLanguage[extension];
}

export function highlightCode(content: string, path: string) {
  const language = languageForPath(path);
  if (!language) return undefined;
  const key = `${language}\0${content}`;
  const cacheable = content.length <= 500;
  const cached = cacheable ? cache.get(key) : undefined;
  if (cached !== undefined) return cached;
  const value = hljs.highlight(content, { language, ignoreIllegals: true }).value;
  if (cacheable) {
    if (cache.size >= cacheLimit) cache.delete(cache.keys().next().value!);
    cache.set(key, value);
  }
  return value;
}
