"use client";

import { setRecallFirst, useRecallFirst } from "../../lib/recall-mode";

/** 「先に答えを考える」モードの切り替え。 */
export function RecallToggle() {
  const on = useRecallFirst();
  return (
    <label className="recall-toggle">
      <input type="checkbox" checked={on} onChange={(e) => setRecallFirst(e.target.checked)} />
      先に答えを考える（選択肢を隠す）
    </label>
  );
}
