"use client";

import { useEffect, useState } from "react";
import { apiGet } from "../../lib/client";
import type { ReviewItem } from "../../lib/types";
import { QuizCard } from "../_components/QuizCard";

const BUCKETS: { min: number; label: string }[] = [
  { min: 60, label: "60日以上あいた" },
  { min: 30, label: "30〜59日あいた" },
  { min: 14, label: "14〜29日あいた" },
  { min: 7, label: "7〜13日あいた" },
  { min: 3, label: "3〜6日あいた" },
  { min: 0, label: "1〜2日あいた" },
];

function bucketIndex(daysSince: number): number {
  return BUCKETS.findIndex((b) => daysSince >= b.min);
}

export default function ReviewPage() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ items: ReviewItem[] }>("/api/review")
      .then((r) => setItems(r.items))
      .catch((e: Error) => setError(e.message));
  }, []);

  function onClosed(quizId: string) {
    // 採点結果を見せ終えて閉じたら復習対象から外す（回答直後だとまだ結果が見えていない）
    setItems((prev) => (prev ? prev.filter((i) => i.id !== quizId) : prev));
  }

  if (error) return <p className="error">{error}</p>;
  if (items === null) return <p className="muted">読み込み中…</p>;

  const groups = BUCKETS.map((b, idx) => ({
    ...b,
    items: items.filter((i) => bucketIndex(i.days_since) === idx),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <h1>復習のおすすめ</h1>
      <p className="muted">
        忘却曲線ベースで、そろそろ解き直すとよい問題です（強制ではありません）。
      </p>

      {groups.length === 0 ? (
        <p className="muted">いまのところ復習が推奨される問題はありません。</p>
      ) : (
        groups.map((g) => (
          <section className="reviewgroup" key={g.label}>
            <h2>
              {g.label}
              <span className="count">{g.items.length} 件</span>
            </h2>
            {g.items.map((it) => (
              <QuizCard
                key={it.id}
                quiz={it}
                onClosed={onClosed}
                extraMeta={`${it.days_since}日前`}
              />
            ))}
          </section>
        ))
      )}
    </>
  );
}
