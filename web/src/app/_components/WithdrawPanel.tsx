"use client";

import { useState } from "react";

const REASONS = ["正解がおかしい", "問題文があいまい", "選択肢がおかしい"];

/**
 * /play で精度の悪い問題を取り下げるパネル。
 * 取り下げた問題は「問題がおかしい」（要修正）に回り、代わりの問題がセッションの最後に足される。
 */
export function WithdrawPanel({
  busy,
  onWithdraw,
  onCancel,
}: {
  busy: boolean;
  onWithdraw: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState("");

  const text = [reason, other.trim()].filter(Boolean).join("：");

  return (
    <div className="withdraw-panel" role="group" aria-label="問題を取り下げる">
      <p className="withdraw-title">この問題を取り下げますか？</p>
      <p className="withdraw-note">
        「問題がおかしい」に回して、代わりの問題を 1 問足します。直してもらうときは、クイズ一覧の「要修正のみ」から AI に依頼できます。
      </p>
      <div className="withdraw-reasons">
        {REASONS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={reason === r}
            className={reason === r ? "on" : undefined}
            onClick={() => setReason(reason === r ? null : r)}
          >
            {r}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={other}
        onChange={(e) => setOther(e.target.value)}
        placeholder="気づいたこと（任意）"
        aria-label="取り下げる理由（任意）"
      />
      <div className="withdraw-actions">
        <button type="button" className="primary" disabled={busy} onClick={() => onWithdraw(text)}>
          取り下げて次の問題へ
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </div>
  );
}
