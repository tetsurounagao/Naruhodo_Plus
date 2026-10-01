"use client";

import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";

/** rehype-highlight が code 要素に付ける `language-xxx` から言語名を取り出す。 */
function languageOf(node: unknown): string | null {
  const code = (node as { children?: { properties?: { className?: unknown } }[] })?.children?.[0];
  const cls = code?.properties?.className;
  if (!Array.isArray(cls)) return null;
  const hit = cls.find((c): c is string => typeof c === "string" && c.startsWith("language-"));
  return hit ? hit.slice("language-".length) : null;
}

/** コードブロック。右上に言語名を小さく出す。 */
function CodeBlock({ node, children, ...rest }: ComponentProps<"pre"> & { node?: unknown }) {
  const lang = languageOf(node);
  return (
    <div className="codeblock">
      {lang && <span className="codeblock-lang">{lang}</span>}
      <pre {...rest}>{children}</pre>
    </div>
  );
}

/**
 * コードブロックを含む Markdown 用（Markdown.tsx から遅延読み込み）。
 * コードフェンス（```lang）は highlight.js で色付けする。配色は styles/code.css（GitHub Dark 系）。
 * より忠実にしたくなったら rehype-highlight を @shikijs/rehype に差し替える。
 */
export default function MarkdownHighlighted({ children }: { children: string }) {
  return (
    <ReactMarkdown
      rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      components={{ pre: CodeBlock }}
    >
      {children}
    </ReactMarkdown>
  );
}
