/**
 * 忘却曲線ベースの復習スケジュール — 差し替え可能な独立ユニット。
 *
 * 要件（会話 2026-09-09）: 固定間隔。直近の回答が不正解なら前倒し。star は使わない。
 * 間隔は通算回答回数ではなく「直近から数えた連続正解回数」で決める（#42）。
 * 通算回数だと、何度も間違えた問題が 1 回正解しただけで長い間隔に飛んでしまうため。
 * 将来もっと凝ったアルゴリズム（SM-2 等）に差し替える場合はこのファイルだけ変える。
 */

/** 連続正解 n 回（1-indexed）の後に推奨する再挑戦までの日数。 */
const INTERVALS_DAYS = [1, 3, 7, 14, 30, 60];

const DAY_MS = 86_400_000;

/** correctStreak=0（直近が不正解）は最短枠の 1 日。 */
export function recommendedIntervalDays(correctStreak: number): number {
  const idx = Math.min(Math.max(correctStreak, 1), INTERVALS_DAYS.length) - 1;
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
  correctStreak: number,
): ReviewInfo | null {
  if (!lastAnsweredAt) return null;
  const daysSince = Math.floor(
    (Date.now() - new Date(lastAnsweredAt).getTime()) / DAY_MS,
  );
  const interval = recommendedIntervalDays(correctStreak);
  return {
    daysSince,
    interval,
    overdueDays: daysSince - interval,
    due: daysSince >= interval,
  };
}
