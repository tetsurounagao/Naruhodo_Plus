"use client";

import type { Confidence } from "../../lib/types";

/** 採点結果の表示。あやふやで正解したときは、早めに再出題されることも伝える。 */
export function ResultLabel({
  isCorrect,
  confidence,
}: {
  isCorrect: boolean;
  confidence: Confidence;
}) {
  if (!isCorrect) return <p className="result-ng">不正解</p>;
  if (confidence === "unsure") {
    return (
      <p className="result-ok">
        正解
        <span className="muted result-note">（あやふやだったので、明日また復習に出します）</span>
      </p>
    );
  }
  return <p className="result-ok">正解</p>;
}
