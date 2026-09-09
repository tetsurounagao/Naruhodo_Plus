"use client";

import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/vs2015.css";

/**
 * 学びの本文・クイズ解説を Markdown として整形表示する。
 * コードフェンス（```lang）は highlight.js（vs2015 テーマ = VS Code 風ダーク）で色付けする。
 * より忠実にしたくなったら rehype-highlight を @shikijs/rehype に差し替える。
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
