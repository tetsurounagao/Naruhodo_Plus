"use client";

import type { Confidence } from "../../lib/types";

/**
 * 採点結果のスタンプ。正解は「なるほど！」がポンと押され、不正解は軽く揺れる。
 * あやふやで正解したときは、早めに再出題されることも伝える。
 * points を渡すと獲得ポイントが浮かび上がる（/play 用）。
 */
export function ResultLabel({
  isCorrect,
  confidence,
  points,
}: {
  isCorrect: boolean;
  confidence: Confidence;
  points?: number;
}) {
  const pts =
    points !== undefined && points > 0 ? <span className="points-float">+{points}</span> : null;
  if (!isCorrect) {
    return (
      <div className="result-row">
        <span className="result-stamp ng">不正解…</span>
        <span className="muted result-note">理由を読んで次に活かそう</span>
      </div>
    );
  }
  if (confidence === "unsure") {
    return (
      <div className="result-row">
        <span className="result-stamp unsure">正解！</span>
        {pts}
        <span className="muted result-note">あやふやだったので、明日また復習に出します</span>
      </div>
    );
  }
  return (
    <div className="result-row">
      <span className="result-stamp ok">なるほど！</span>
      {pts}
    </div>
  );
}
