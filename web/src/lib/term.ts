/**
 * 「今日の 1 ターム」の組み立て — 差し替え可能な独立ユニット（純関数のみ。DB は見ない）。
 *
 * 復習が雪だるま式に溜まるのを防ぐための決まり（#83）:
 * - 1 ターム = TERM_SIZE 問。ホームには溜まっている総数ではなく、今日のタームだけを見せる
 * - 新しい問題（未解答）のデビューは 1 日 NEW_PER_DAY 問まで。それ以上は「控え」に置き、
 *   翌日以降に少しずつ出す（新しい問題は最初の 1〜2 か月で 5 回ほど復習に戻ってくるため、
 *   受け入れの速さがそのまま将来の復習量になる）
 * - 復習は「忘れかけている順」（経過日数 ÷ 本来の間隔 が大きい順）に出す
 */

export const TERM_SIZE = 10;
export const NEW_PER_DAY = 3;

const DAY_MS = 86_400_000;

/**
 * 利用者のタイムゾーンでの「今日」の始まり（UTC のミリ秒）。
 * tzOffsetMin はブラウザの Date#getTimezoneOffset()（日本なら -540）。
 */
export function startOfLocalDay(nowMs: number, tzOffsetMin: number): number {
  const localMs = nowMs - tzOffsetMin * 60_000;
  return Math.floor(localMs / DAY_MS) * DAY_MS + tzOffsetMin * 60_000;
}

/** 忘れかけ度。大きいほど先に出す（本来の間隔をどれだけ過ぎているか）。 */
export function forgettingRisk(daysSince: number, interval: number): number {
  return daysSince / Math.max(interval, 1);
}

/**
 * ターム（と、取り下げたときに足す予備）を組み立てる。
 * @param due 復習期限が来ている問題（忘れかけている順に並べ済み）
 * @param fresh 未解答の問題（出したい順に並べ済み）
 * @param newSlots 今日あと何問デビューさせてよいか
 * 新しい問題はタームの中に散らして混ぜる（3 問ごとに 1 問）。復習が足りなくても新しい問題で埋めない。
 */
export function buildTerm<T>(
  due: T[],
  fresh: T[],
  newSlots: number,
): { term: T[]; reserve: T[]; freshCount: number } {
  const freshTaken = fresh.slice(0, Math.max(0, Math.min(newSlots, TERM_SIZE)));
  const reviewTaken = due.slice(0, TERM_SIZE - freshTaken.length);
  const term: T[] = [];
  let r = 0;
  let f = 0;
  while (r < reviewTaken.length || f < freshTaken.length) {
    // 復習 3 問のあとに新しい問題を 1 問（復習が尽きたら残りの新しい問題を続ける）
    const freshTurn = f < freshTaken.length && (r >= reviewTaken.length || (term.length + 1) % 4 === 0);
    if (freshTurn) term.push(freshTaken[f++]);
    else term.push(reviewTaken[r++]);
  }
  return { term, reserve: due.slice(reviewTaken.length), freshCount: freshTaken.length };
}
