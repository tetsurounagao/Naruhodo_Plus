"use client";

/**
 * 1 日の目標問題数と「今日解いた数」の即時反映。
 * 目標は固定で 10 問（設定で変えられるようにする場合はここだけ変える）。
 */
export const DAILY_GOAL = 10;

const EVENT = "naruhodo:answered";

/** 解答を記録できたら呼ぶ。ヘッダーの「今日 N/10」がその場で増える。 */
export function notifyAnswered(): void {
  window.dispatchEvent(new Event(EVENT));
}

export function onAnswered(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
