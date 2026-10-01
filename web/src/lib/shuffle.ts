/**
 * 配列の並び順をシャッフルする — 差し替え可能な独立ユニット。
 *
 * クイズの選択肢を表示のたびに並べ替え、「位置で正解を覚える」のを防ぐために使う。
 * 保存時のシャッフル（mcp-server/src/lib/shuffle-choices.ts）とは別で、こちらは表示上の演出。
 * 正誤判定は選択肢 id の比較なので、並び順を変えても影響しない。
 *
 * Fisher–Yates。crypto.getRandomValues を使い、Math.random 由来の偏りを避ける。
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const arr = [...items];
  const rand = new Uint32Array(1);
  for (let i = arr.length - 1; i > 0; i--) {
    crypto.getRandomValues(rand);
    const j = rand[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
