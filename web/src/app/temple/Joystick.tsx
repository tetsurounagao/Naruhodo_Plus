"use client";

import { useRef, useState } from "react";

const RADIUS = 52;

/**
 * スマホ用の円形スティック（右下）。引っ張った方向と強さ（0〜1）を onMove で返す。
 * x は右が +、y は上が +。指を離すと (0, 0)。表示するかどうかは CSS（指で操作する端末だけ）で決める。
 */
export function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  function update(clientX: number, clientY: number) {
    const r = base.current?.getBoundingClientRect();
    if (!r) return;
    let dx = clientX - (r.left + r.width / 2);
    let dy = clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) {
      dx = (dx / d) * RADIUS;
      dy = (dy / d) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    onMove(dx / RADIUS, -dy / RADIUS);
  }

  function release() {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  }

  return (
    <div
      ref={base}
      className="temple-stick"
      aria-hidden="true"
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        try {
          // 指がスティックの外に出ても追いかける
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // 取れない環境でも動かせるようにする
        }
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pointer.current === e.pointerId) update(e.clientX, e.clientY);
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className="temple-stick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
