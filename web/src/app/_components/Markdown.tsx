"use client";

import ReactMarkdown from "react-markdown";

/**
 * 学びの本文・クイズ解説を Markdown として整形表示する。
 * コードフェンス（```）は <pre><code> になり、globals.css で等幅・枠付きに整形する。
 * シンタックスハイライトは今は入れない（必要になったら rehype 系を追加）。
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
