/**
 * 忘却曲線ベースの復習スケジュール — 差し替え可能な独立ユニット（純関数のみ）。
 *
 * 間隔は解答履歴を古い順に流して決める（DB には間隔を持たない）。Anki の考え方を取り入れている（#85）:
 * - 自信ありで正解するたびに間隔が伸びる: 1 → 3 → 7 → 14 → 30 → 60 日、そのあとは 2 倍ずつ（上限なし）
 * - 「簡単すぎた」なら 2 段階先まで飛ばす
 * - 遅れて正解したら、実際に空いた日数も覚えていられたとみなし、
 *   「予定の間隔」と「実際に空いた日数」の大きい方を基準に次の間隔を決める
 * - 不正解・あやふやで正解は 1 日に戻す（あやふや = まぐれ当たりの可能性。#50）
 * なるほど電球の明るさ（連続正解回数）は lib/mastery.ts で別に数える。
 */

/** 最初の数段の間隔（日）。これを超えたら GROWTH 倍ずつ伸ばす。 */
const STEPS = [1, 3, 7, 14, 30, 60];
const GROWTH = 2;

const DAY_MS = 86_400_000;

/** 解答 1 回ぶんの入力。confidence の "easy" は「簡単すぎた」（自信ありの正解に付く）。 */
export interface ScheduleAttempt {
  answeredAt: string;
  isCorrect: boolean;
  confidence: "sure" | "unsure" | "easy" | null;
}

/** 基準の日数の次の段（STEPS の中で基準より大きい最初の値。超えたら 2 倍）。 */
function stepAfter(base: number): number {
  for (const s of STEPS) if (s > base) return s;
  return Math.round(base * GROWTH);
}

/**
 * 1 回解いたあとの次の間隔（日）。
 * @param planned 解く前に予定されていた間隔（初回は 0）
 * @param elapsedDays 前回の解答から実際に空いた日数（初回は 0）
 */
export function nextInterval(
  planned: number,
  elapsedDays: number,
  isCorrect: boolean,
  confidence: ScheduleAttempt["confidence"],
): number {
  if (!isCorrect || confidence === "unsure") return 1;
  const base = Math.max(planned, elapsedDays);
  const next = stepAfter(base);
  return confidence === "easy" ? stepAfter(next) : next;
}

/** 前回の解答からの経過日数（切り捨て）。 */
export function daysBetween(fromIso: string, toMs: number): number {
  return Math.max(0, Math.floor((toMs - new Date(fromIso).getTime()) / DAY_MS));
}

/** 解答履歴（古い順）から今の間隔を出す。未解答なら 0。 */
export function intervalFromHistory(attempts: ScheduleAttempt[]): number {
  let interval = 0;
  let lastAt: string | null = null;
  for (const a of attempts) {
    const elapsed = lastAt ? daysBetween(lastAt, new Date(a.answeredAt).getTime()) : 0;
    interval = nextInterval(interval, elapsed, a.isCorrect, a.confidence);
    lastAt = a.answeredAt;
  }
  return interval;
}

export interface ReviewInfo {
  daysSince: number;
  interval: number;
  overdueDays: number;
  due: boolean;
}

/** 未回答（lastAnsweredAt=null）は復習対象外なので null を返す。interval は今の間隔（日）。 */
export function reviewInfo(lastAnsweredAt: string | null, interval: number): ReviewInfo | null {
  if (!lastAnsweredAt) return null;
  const daysSince = daysBetween(lastAnsweredAt, Date.now());
  const iv = Math.max(interval, 1);
  return {
    daysSince,
    interval: iv,
    overdueDays: daysSince - iv,
    due: daysSince >= iv,
  };
}
