"use client";

import { useState } from "react";

/** 非同期に組み立てたテキストをコピーする。 */
async function copyAsync(p: Promise<string>): Promise<void> {
  // Safari は await を挟むとユーザー操作扱いが切れて writeText が拒否されるため、
  // Promise のまま ClipboardItem に渡す方式を先に試す
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": p.then((t) => new Blob([t], { type: "text/plain" })),
        }),
      ]);
      return;
    } catch {
      // 組み立て自体の失敗ならここで止める。コピー方式の非対応なら writeText にフォールバック
      await p;
    }
  }
  await navigator.clipboard.writeText(await p);
}

/** プロンプトをクリップボードにコピーするボタン。押すと 2 秒間「コピーしました」に変わる。 */
export function CopyPromptButton({
  text,
  label,
  primary = false,
}: {
  /**
   * クリック時に組み立てる（毎回最新の内容でコピーする）。
   * API から取得して組み立てる場合は Promise を返してよい。
   */
  text: () => string | Promise<string>;
  label: string;
  primary?: boolean;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      const t = text();
      if (typeof t === "string") await navigator.clipboard.writeText(t);
      else await copyAsync(t);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button className={primary ? "primary" : undefined} onClick={copy}>
      {state === "copied" ? "コピーしました" : state === "failed" ? "コピーできませんでした" : label}
    </button>
  );
}
