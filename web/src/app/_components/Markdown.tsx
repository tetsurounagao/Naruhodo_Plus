"use client";

import dynamic from "next/dynamic";

// react-markdown / highlight.js は重いので初回 JS に含めず、表示時に読み込む。
// highlight.js はコードブロックがあるときだけ読む。
const MarkdownPlain = dynamic(() => import("./MarkdownPlain"), { ssr: false });
const MarkdownHighlighted = dynamic(() => import("./MarkdownHighlighted"), { ssr: false });

/** フェンス（``` / ~~~）かインデント（4スペース / タブ）のコードブロックを含むか。 */
function hasCodeBlock(text: string): boolean {
  return /^\s*(```|~~~)|^( {4}|\t)\S/m.test(text);
}

/**
 * 学びの本文・クイズ解説を Markdown として整形表示する。
 * コードブロックは highlight.js で色付けする（MarkdownHighlighted.tsx）。
 */
export function Markdown({ children }: { children: string }) {
  const Renderer = hasCodeBlock(children) ? MarkdownHighlighted : MarkdownPlain;
  return (
    <div className="md">
      <Renderer>{children}</Renderer>
    </div>
  );
}
