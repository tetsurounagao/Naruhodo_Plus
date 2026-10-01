"use client";

import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/vs2015.css";

/**
 * コードブロックを含む Markdown 用（Markdown.tsx から遅延読み込み）。
 * コードフェンス（```lang）は highlight.js（vs2015 テーマ = VS Code 風ダーク）で色付けする。
 * より忠実にしたくなったら rehype-highlight を @shikijs/rehype に差し替える。
 */
export default function MarkdownHighlighted({ children }: { children: string }) {
  return (
    <ReactMarkdown rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}>
      {children}
    </ReactMarkdown>
  );
}
