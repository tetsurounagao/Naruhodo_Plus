/**
 * タグ正規化 — 差し替え可能な独立ユニット。
 *
 * 要件（docs/requirements.md 5「タグの正規化ポリシー」/ 14「将来のローカルAI拡張」）:
 * - 一致判定は AI の類似判定ではなく、コード側の機械的な正規化で行う。
 * - 将来ここを「埋め込みモデルで意味的にグルーピングする版」に差し替えられるよう、
 *   呼び出し側は必ずこのモジュールの関数だけを使う。実装の中身を外に漏らさない。
 */

/** 表記ゆれの単純な吸収表（左辺 → 右辺）。必要に応じて増やす。 */
const ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  "node.js": "nodejs",
  node: "nodejs",
  postgres: "postgresql",
  psql: "postgresql",
  k8s: "kubernetes",
};

/**
 * 1 個のタグ名を正規化する。
 * - 前後空白の除去
 * - 小文字化
 * - 連続空白の単一化
 * - 全角空白→半角、波ダッシュ等の軽微なゆれ吸収
 * - エイリアス表による寄せ
 */
export function normalizeTag(raw: string): string {
  const base = raw
    .normalize("NFKC")
    .replace(/　/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return ALIASES[base] ?? base;
}

/**
 * タグ名配列を正規化し、空文字と重複を除去して返す（入力順を保持）。
 */
export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of raw) {
    const normalized = normalizeTag(tag);
    if (normalized === "" || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
