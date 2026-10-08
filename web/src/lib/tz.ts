/**
 * クエリの `tz`（ブラウザの Date#getTimezoneOffset()。日本なら -540）を読む。
 * 「今日」の区切りを利用者の時刻で決めるため。不正・未指定なら 0（UTC）。
 */
export function tzOffsetFrom(url: string): number {
  const v = Number(new URL(url).searchParams.get("tz"));
  return Number.isFinite(v) && Math.abs(v) <= 14 * 60 ? Math.trunc(v) : 0;
}
