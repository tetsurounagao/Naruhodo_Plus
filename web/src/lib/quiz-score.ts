import type { Confidence } from "./types";

/**
 * /play のスコア・コンボ計算 — 差し替え可能な独立ユニット（純関数のみ）。
 *
 * 正直な自信度の申告が得になるように設計している（#66）:
 * - 自信ありで正解: 10 点 + コンボボーナス、コンボ +1
 * - あやふやで正解: 5 点、コンボは維持（増えない）
 * - 自信ありで不正解: 0 点、コンボが途切れる
 * - あやふやで不正解: 0 点、コンボは維持（「あやふや」と申告したことが保険になる）
 * これで「とりあえず自信ありを押す」動機がなくなり、復習間隔に使う自信度のデータが正確に保たれる。
 */

export const BASE_POINTS = 10;
export const UNSURE_POINTS = 5;
/** コンボ 1 つにつき加算する点（上限あり）。 */
const COMBO_STEP = 2;
const COMBO_BONUS_MAX = 10;

export interface Turn {
  points: number;
  /** この回答の後のコンボ数 */
  combo: number;
  /** コンボが途切れたか（直前が 2 以上だったときだけ true） */
  comboBroken: boolean;
}

export function scoreTurn(isCorrect: boolean, confidence: Confidence, prevCombo: number): Turn {
  if (isCorrect && confidence === "sure") {
    const combo = prevCombo + 1;
    const bonus = Math.min((combo - 1) * COMBO_STEP, COMBO_BONUS_MAX);
    return { points: BASE_POINTS + bonus, combo, comboBroken: false };
  }
  if (isCorrect) return { points: UNSURE_POINTS, combo: prevCombo, comboBroken: false };
  if (confidence === "unsure") return { points: 0, combo: prevCombo, comboBroken: false };
  return { points: 0, combo: 0, comboBroken: prevCombo >= 2 };
}

/** コンボの段階。演出の強さ（色・アイコン）を切り替えるのに使う。 */
export function comboTier(combo: number): 0 | 1 | 2 | 3 {
  if (combo >= 7) return 3;
  if (combo >= 4) return 2;
  if (combo >= 2) return 1;
  return 0;
}

export type Rank = "S" | "A" | "B" | "C";

/**
 * ランク。自信ありの正解を 1、あやふやの正解を 0.5 として正答率を出す。
 * S は全問正解かつ全部自信ありのときだけ。
 */
export function rankOf(sureCorrect: number, unsureCorrect: number, total: number): Rank {
  if (total === 0) return "C";
  if (sureCorrect === total) return "S";
  const rate = (sureCorrect + unsureCorrect * 0.5) / total;
  if (rate >= 0.8) return "A";
  if (rate >= 0.6) return "B";
  return "C";
}

export const RANK_MESSAGES: Record<Rank, string> = {
  S: "完璧！全部わかってる",
  A: "いい調子！あと少しで完璧",
  B: "半分以上わかってきた",
  C: "伸びしろたっぷり。もう一度いこう",
};
