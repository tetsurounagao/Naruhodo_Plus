"use client";

import { useEffect, useState } from "react";

/**
 * 解答時の効果音・振動。音は WebAudio で合成するので外部ファイルは不要。
 * 職場などで急に音が鳴らないよう既定は OFF。ON/OFF はブラウザに保存する（読めない環境では OFF）。
 */
const KEY = "naruhodo:sound";
const EVENT = "naruhodo:sound-change";

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundOn(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // 保存できなくても今の画面では反映させる
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: on }));
}

export function useSoundOn(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(read());
    const onChange = (e: Event) => setOn((e as CustomEvent<boolean>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return on;
}

/** OS の「視差効果を減らす」設定。ON なら派手な動きを出さない。 */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

let ctx: AudioContext | null = null;

/** 短い音を順に鳴らす。notes は [周波数Hz, 長さ秒] の列。 */
function play(notes: [number, number][], type: OscillatorType = "sine", gain = 0.08): void {
  try {
    ctx ??= new AudioContext();
    let t = ctx.currentTime;
    for (const [freq, dur] of notes) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
      t += dur * 0.8;
    }
  } catch {
    // 音が出せない環境では何もしない
  }
}

export type FeedbackKind = "correct" | "unsure" | "wrong" | "combo" | "fanfare";

/** 効果音と振動。sound=false なら何もしない。 */
export function feedback(kind: FeedbackKind, sound: boolean, combo = 0): void {
  if (!sound) return;
  // コンボが伸びるほど音程を上げる
  const lift = Math.min(combo, 8) * 40;
  switch (kind) {
    case "correct":
      play([[660 + lift, 0.09], [990 + lift, 0.16]], "triangle");
      navigator.vibrate?.(15);
      break;
    case "unsure":
      play([[620, 0.1], [780, 0.14]], "sine", 0.06);
      navigator.vibrate?.(10);
      break;
    case "wrong":
      play([[220, 0.12], [180, 0.18]], "sawtooth", 0.04);
      navigator.vibrate?.([30, 40, 30]);
      break;
    case "combo":
      play([[880 + lift, 0.07], [1100 + lift, 0.07], [1320 + lift, 0.18]], "triangle");
      navigator.vibrate?.([15, 30, 15]);
      break;
    case "fanfare":
      play([[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.35]], "triangle");
      navigator.vibrate?.([20, 40, 20, 40, 60]);
      break;
  }
}
