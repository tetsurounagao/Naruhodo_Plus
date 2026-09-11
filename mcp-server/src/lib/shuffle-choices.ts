import { randomInt } from "node:crypto";

/**
 * クイズの選択肢の並び順をシャッフルする — 差し替え可能な独立ユニット。
 *
 * 生成 AI は「正解を先に作り、残りの誤答を後から足す」書き方をしがちで、
 * 何もしないと正解がほぼ常に先頭（choices[0]）になる（実データで 43 問中 38 問が該当）。
 * 並び順は表示上の演出であり内容の生成ではないため、AI の判断に頼らずサーバー側で
 * 機械的にランダム化する（id は変えないので correct_answer の参照は影響を受けない）。
 *
 * Fisher–Yates。crypto.randomInt を使い、Math.random 由来の偏りを避ける。
 */
export function shuffleChoices<T>(choices: readonly T[]): T[] {
  const arr = [...choices];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
