"use client";

import { useEffect, useMemo, useRef } from "react";
import { prefersReducedMotion } from "../../lib/feedback";

/** 自動で閉じるまでの時間（ミリ秒） */
const AUTO_CLOSE_MS = 6500;
const REEL_SYMBOLS = ["7", "★", "BAR", "♦", "7", "♣", "7", "★", "♦", "BAR"];

/**
 * 10 問連続正解の「大当たり」演出（パチンコ風）。全画面の暗転・回る光・7 が揃うリール・
 * 虹色の文字・コインの雨・画面の揺れ。クリック / Enter / Esc で閉じ、放っておいても自動で閉じる。
 * 点滅は 1 秒に 3 回未満（光過敏性発作への配慮）。視差効果を減らす設定では揺れ・点滅を止める。
 */
export function JackpotOverlay({ bonus, onClose }: { bonus: number; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const reduced = useMemo(() => prefersReducedMotion(), []);

  useEffect(() => {
    closeRef.current?.focus();
    const timer = window.setTimeout(onClose, AUTO_CLOSE_MS);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" || e.key === "Escape" || e.key === " ") {
        // /play の Enter（次へ）に渡さない
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    }
    // capture で先に受け取り、ほかのキー操作より優先する
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  // コインの雨（位置・速さはランダム。開くたびに 1 回だけ決める）
  const coins = useMemo(
    () =>
      Array.from({ length: reduced ? 0 : 70 }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 2.2,
        duration: 1.8 + Math.random() * 1.6,
        size: 18 + Math.random() * 18,
        spin: Math.random() < 0.5 ? "jp-coin-spin" : "jp-coin-spin-rev",
      })),
    [reduced],
  );

  return (
    <div
      className={`jackpot${reduced ? " reduced" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`大当たり！ 10 問連続正解。ボーナス ${bonus} ポイント`}
      onClick={onClose}
    >
      <div className="jp-rays" aria-hidden="true" />
      <div className="jp-frame" aria-hidden="true" />

      <div className="jp-center">
        <div className="jp-reels" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div className="jp-reel" key={i}>
              <div className="jp-strip" style={{ animationDelay: `${i * 0.35}s` }}>
                {/* 3 周ぶん並べて高速で回し、最後に 3 周目の「7」（27 個目）で止める */}
                {[...REEL_SYMBOLS, ...REEL_SYMBOLS, ...REEL_SYMBOLS].map((s, j) => (
                  <span key={j} className={s === "7" ? "jp-sym seven" : "jp-sym"}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="jp-title">
          <span>大</span>
          <span>当</span>
          <span>た</span>
          <span>り</span>
          <span>！</span>
          <span>！</span>
        </p>
        <p className="jp-sub">10 問連続正解</p>
        <p className="jp-bonus">ボーナス +{bonus} pt</p>
        <button ref={closeRef} type="button" className="jp-close" onClick={onClose}>
          つづける <span className="kbd">Enter</span>
        </button>
      </div>

      <div className="jp-coins" aria-hidden="true">
        {coins.map((c, i) => (
          <span
            key={i}
            className={`jp-coin ${c.spin}`}
            style={{
              left: `${c.left}%`,
              width: c.size,
              height: c.size,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.duration}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
