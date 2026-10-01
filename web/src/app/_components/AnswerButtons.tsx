"use client";

import type { Confidence } from "../../lib/types";

/**
 * 回答ボタン。結果を見る前に自信度も一緒に申告する。
 * 「あやふや」で正解した問題は、復習間隔の計算で連続正解に数えない。
 */
export function AnswerButtons({
  disabled,
  onSubmit,
  showKeys = false,
}: {
  disabled: boolean;
  onSubmit: (confidence: Confidence) => void;
  /** /play 用。Enter / Shift+Enter のキー表示を出す */
  showKeys?: boolean;
}) {
  return (
    <div className="answer-buttons">
      <button className="primary" disabled={disabled} onClick={() => onSubmit("sure")}>
        自信あり で回答{showKeys && <span className="kbd">Enter</span>}
      </button>
      <button disabled={disabled} onClick={() => onSubmit("unsure")}>
        あやふや で回答{showKeys && <span className="kbd">Shift+Enter</span>}
      </button>
    </div>
  );
}
