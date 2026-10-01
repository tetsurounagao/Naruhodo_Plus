"use client";

import { useEffect, useState } from "react";

/**
 * 「先に答えを考える」モード（選択肢を隠して設問だけ先に見せる）の ON/OFF。
 * 個人の表示設定なのでブラウザに保存する。読めない環境では常に OFF 扱い。
 * 同じ画面内の複数コンポーネントで値を揃えるため、変更時にイベントで通知する。
 */
const KEY = "naruhodo:recall-first";
const EVENT = "naruhodo:recall-first-change";

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setRecallFirst(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // 保存できなくても今の画面では反映させる
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: on }));
}

export function useRecallFirst(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(read());
    const onChange = (e: Event) => setOn((e as CustomEvent<boolean>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return on;
}
