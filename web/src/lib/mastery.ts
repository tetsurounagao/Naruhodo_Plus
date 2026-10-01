import type { Confidence } from "./types";

/**
 * なるほど電球（理解度）— 差し替え可能な独立ユニット（純関数のみ）。
 *
 * 明るさは「自信ありの連続正解回数」（復習間隔と同じ指標）から決める:
 *   0 まだ（未解答・直近が不正解やあやふや）/ 1 ほんのり（1〜2 回）/ 2 明るい（3〜4 回）/ 3 身についた（5 回以上）
 * 5 回連続は復習間隔が 30 日に延びる段階。DB には持たず、解答履歴から毎回計算する。
 */
export type Mastery = 0 | 1 | 2 | 3;

export const MASTERY_LABELS: Record<Mastery, string> = {
  0: "まだ",
  1: "ほんのり",
  2: "明るい",
  3: "身についた",
};

export function masteryOf(correctStreak: number): Mastery {
  if (correctStreak >= 5) return 3;
  if (correctStreak >= 3) return 2;
  if (correctStreak >= 1) return 1;
  return 0;
}

/** 解答後の連続正解回数（自信ありの正解だけが伸ばす。あやふや・不正解は 0 に戻る）。 */
export function nextStreak(prev: number, isCorrect: boolean, confidence: Confidence): number {
  return isCorrect && confidence === "sure" ? prev + 1 : 0;
}
