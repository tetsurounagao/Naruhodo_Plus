"use client";

import ReactMarkdown from "react-markdown";

/** コードブロックを含まない Markdown 用。highlight.js を読み込まない（Markdown.tsx から遅延読み込み）。 */
export default function MarkdownPlain({ children }: { children: string }) {
  return <ReactMarkdown>{children}</ReactMarkdown>;
}
