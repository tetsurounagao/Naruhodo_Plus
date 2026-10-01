/**
 * 連続学習日数 — 日付キー（ローカルタイムゾーンの YYYY-MM-DD）の集合から計算する純関数。
 * ホームの「今日やること」と稼働カレンダーの両方で使う。
 */

/** ローカルタイムゾーンでの日付キー（YYYY-MM-DD）。 */
export function localDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** ISO 日時の配列 → ローカル日付キーごとの件数。 */
export function countByLocalDate(timestamps: string[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const ts of timestamps) {
    const k = localDateKey(new Date(ts));
    c[k] = (c[k] ?? 0) + 1;
  }
  return c;
}

/**
 * 今日または昨日まで途切れずに続いている日数。
 * 今日まだ解いていなくても、昨日まで続いていれば継続中とみなす（今日解けば +1 される）。
 * 昨日も無ければ 0。
 */
export function currentStreak(days: Set<string>, today: Date = new Date()): number {
  const cur = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!days.has(localDateKey(cur))) cur.setDate(cur.getDate() - 1);
  let n = 0;
  while (days.has(localDateKey(cur))) {
    n += 1;
    cur.setDate(cur.getDate() - 1);
  }
  return n;
}
