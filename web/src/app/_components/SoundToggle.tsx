"use client";

import { setSoundOn, useSoundOn } from "../../lib/feedback";

/** 効果音・振動の ON/OFF（既定 OFF）。 */
export function SoundToggle() {
  const on = useSoundOn();
  return (
    <button
      type="button"
      className="sound-toggle"
      aria-pressed={on}
      onClick={() => setSoundOn(!on)}
      title="効果音・振動"
    >
      {on ? "🔊 効果音 ON" : "🔇 効果音 OFF"}
    </button>
  );
}
