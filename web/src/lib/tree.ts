/**
 * 神殿の木の育ち方（#93）— 差し替え可能な独立ユニット（純関数のみ。DB は見ない）。
 * 捧げたポイントの合計（経験値）からレベルを出す。100 pt で 1 レベル、Lv1 から始まり Lv99 が上限。
 */
export const POINTS_PER_LEVEL = 100;
export const TREE_MAX_LEVEL = 99;
/** Lv99 に届く経験値。これ以上は捧げられない */
export const TREE_MAX_EXP = (TREE_MAX_LEVEL - 1) * POINTS_PER_LEVEL;

/** 1 回の解答で得られるポイントの上限（自信ありの正解 10 + コンボ 10 + 大当たり 100）。サーバーの検証に使う */
export const MAX_POINTS_PER_ANSWER = 120;
/** あやふやで正解したときのポイント（lib/quiz-score.ts の UNSURE_POINTS と同じ） */
export const UNSURE_MAX_POINTS = 5;

export interface TreeState {
  balance: number;
  exp: number;
}

export interface TreeInfo extends TreeState {
  level: number;
  /** 今のレベルに入ってから捧げた量（0〜99） */
  intoLevel: number;
  /** 次のレベルまであと何 pt（Lv99 なら 0） */
  toNext: number;
  /** あと何 pt 捧げられるか（残高と Lv99 の上限の小さい方） */
  offerable: number;
  maxed: boolean;
}

export function levelOf(exp: number): number {
  return Math.min(TREE_MAX_LEVEL, 1 + Math.floor(Math.max(0, exp) / POINTS_PER_LEVEL));
}

export function treeInfo({ balance, exp }: TreeState): TreeInfo {
  const level = levelOf(exp);
  const maxed = level >= TREE_MAX_LEVEL;
  const intoLevel = maxed ? POINTS_PER_LEVEL : exp % POINTS_PER_LEVEL;
  return {
    balance,
    exp,
    level,
    intoLevel,
    toNext: maxed ? 0 : POINTS_PER_LEVEL - intoLevel,
    offerable: Math.max(0, Math.min(balance, TREE_MAX_EXP - exp)),
    maxed,
  };
}
