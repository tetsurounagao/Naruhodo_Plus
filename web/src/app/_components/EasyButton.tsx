"use client";

import { useState } from "react";
import { apiPost } from "../../lib/client";

/**
 * 「簡単すぎた」（Anki の Easy）。自信ありで正解したあとにだけ出す。
 * 押すとその解答を easy にし、次の復習間隔を 2 段階先まで飛ばす。
 */
export function EasyButton({ attemptId, onDone }: { attemptId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function mark() {
    setBusy(true);
    setError(false);
    try {
      await apiPost(`/api/attempts/${attemptId}`, { easy: true }, "PATCH");
      onDone();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="easy-button"
      disabled={busy}
      onClick={() => void mark()}
      title="分かりきった問題を、しばらく出さないようにする"
    >
      {error ? "失敗しました（もう一度）" : "簡単すぎた"}
    </button>
  );
}
