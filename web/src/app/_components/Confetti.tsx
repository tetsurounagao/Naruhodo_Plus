"use client";

import { useMemo } from "react";
import { prefersReducedMotion } from "../../lib/feedback";

const COLORS = ["#2f6f4f", "#5fb591", "#f2b705", "#f28705", "#e2557a", "#4f7cf2"];

/**
 * 紙吹雪。画面上部から降らせて自然に消える（親が key を変えると再生し直す）。
 * 視差効果を減らす設定のときは何も出さない。
 */
export function Confetti({ count = 60 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 1.6 + Math.random() * 1.2,
        drift: (Math.random() - 0.5) * 160,
        rotate: Math.random() * 720 - 360,
        color: COLORS[i % COLORS.length],
        round: Math.random() < 0.3,
      })),
    [count],
  );
  if (prefersReducedMotion()) return null;
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              borderRadius: p.round ? "50%" : "2px",
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--drift": `${p.drift}px`,
              "--rotate": `${p.rotate}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
