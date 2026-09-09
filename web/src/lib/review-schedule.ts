/**
 * 忘却曲線ベースの復習スケジュール — 差し替え可能な独立ユニット。
 *
 * 要件（会話 2026-09-09）: 固定間隔。直近の回答が不正解なら前倒し。star は使わない。
 * 将来もっと凝ったアルゴリズム（SM-2 等）に差し替える場合はこのファイルだけ変える。
 */

/** n 回目（1-indexed）の回答の「後」に推奨する再挑戦までの日数。 */
const INTERVALS_DAYS = [1, 3, 7, 14, 30, 60];

const DAY_MS = 86_400_000;

export function recommendedIntervalDays(
  attemptCount: number,
  lastCorrect: boolean | null,
): number {
  if (lastCorrect === false) return 1; // 直近不正解 → 最短枠へ前倒し
  const idx = Math.min(Math.max(attemptCount, 1), INTERVALS_DAYS.length) - 1;
  return INTERVALS_DAYS[idx];
}

export interface ReviewInfo {
  daysSince: number;
  interval: number;
  overdueDays: number;
  due: boolean;
}

/** 未回答（lastAnsweredAt=null）は復習対象外なので null を返す。 */
export function reviewInfo(
  lastAnsweredAt: string | null,
  attemptCount: number,
  lastCorrect: boolean | null,
): ReviewInfo | null {
  if (!lastAnsweredAt) return null;
  const daysSince = Math.floor(
    (Date.now() - new Date(lastAnsweredAt).getTime()) / DAY_MS,
  );
  const interval = recommendedIntervalDays(attemptCount, lastCorrect);
  return {
    daysSince,
    interval,
    overdueDays: daysSince - interval,
    due: daysSince >= interval,
  };
}
