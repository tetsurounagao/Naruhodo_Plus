"use client";

import type { Confidence } from "../../lib/types";

/**
 * 回答ボタン。結果を見る前に自信度も一緒に申告する。
 * 「あやふや」で正解した問題は、復習間隔の計算で連続正解に数えない。
 * /play では画面下の固定バー（AnswerBar）、一覧から解くときはカードの中に出す。
 */
export function AnswerButtons({
  disabled,
  onSubmit,
  showKeys = false,
}: {
  disabled: boolean;
  onSubmit: (confidence: Confidence) => void;
  /** /play 用。Enter / Shift+Enter のキー表示を出す（スマホでは CSS で隠す） */
  showKeys?: boolean;
}) {
  return (
    <div className="answer-buttons-wrap">
      <p className="answer-hint">答えを選んだら、自信の度合いで回答</p>
      <div className="answer-buttons">
        <button
          type="button"
          className="primary answer-sure"
          disabled={disabled}
          onClick={() => onSubmit("sure")}
        >
          自信あり
          {showKeys && <span className="kbd">Enter</span>}
        </button>
        <button
          type="button"
          className="answer-unsure"
          disabled={disabled}
          onClick={() => onSubmit("unsure")}
        >
          あやふや
          {showKeys && <span className="kbd">Shift+Enter</span>}
        </button>
      </div>
    </div>
  );
}
