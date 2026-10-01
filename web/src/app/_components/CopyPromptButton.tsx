"use client";

import { useState } from "react";

/** プロンプトをクリップボードにコピーするボタン。押すと 2 秒間「コピーしました」に変わる。 */
export function CopyPromptButton({
  text,
  label,
  primary = false,
}: {
  /** クリック時に組み立てる（毎回最新の内容でコピーする） */
  text: () => string;
  label: string;
  primary?: boolean;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text());
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
