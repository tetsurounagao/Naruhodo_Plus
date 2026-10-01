"use client";

import { useEffect, useId, useRef, useState } from "react";
import { RecallToggle } from "./RecallToggle";
import { SoundToggle } from "./SoundToggle";
import { SlidersIcon } from "./PlayIcons";

/**
 * /play 上部バーの設定ボタン。押すとポップオーバーで
 * 「選択肢を隠す」「効果音」とキー操作の説明を出す。外側のクリックと Esc で閉じる。
 */
export function PlaySettings() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="play-settings" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="play-icon-button"
        aria-label="設定（選択肢を隠す・効果音・キー操作）"
        aria-expanded={open}
        aria-controls={popId}
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersIcon />
      </button>
      {open && (
        <div id={popId} className="play-settings-pop" role="group" aria-label="設定">
          <p className="play-settings-title">設定</p>
          <RecallToggle />
          <SoundToggle />
          <p className="play-settings-title">キー操作</p>
          <ul className="play-keys">
            <li>
              <kbd>1</kbd>〜<kbd>9</kbd>
              <span>選択</span>
            </li>
            <li>
              <kbd>Enter</kbd>
              <span>自信ありで回答</span>
            </li>
            <li>
              <kbd>Shift</kbd>+<kbd>Enter</kbd>
              <span>あやふやで回答</span>
            </li>
            <li>
              <kbd>Enter</kbd>
              <span>次へ</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
