"use client";

import { setSoundOn, useSoundOn } from "../../lib/feedback";

/**
 * 効果音・振動の ON/OFF（既定 OFF）。
 * /play の設定ポップオーバーで RecallToggle と並べるので、同じチェックボックスの形にしている。
 */
export function SoundToggle() {
  const on = useSoundOn();
  return (
    <label className="recall-toggle sound-toggle-row">
      <input type="checkbox" checked={on} onChange={(e) => setSoundOn(e.target.checked)} />
      効果音・振動を鳴らす
    </label>
  );
}
