"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../../lib/client";
import type { AttemptResult, QuizPublic } from "../../lib/types";
import { QuizCard } from "../_components/QuizCard";
import { QuizFilters, type FilterState } from "../_components/QuizFilters";

const DEFAULT_FILTERS: FilterState = {
  status: "unanswered",
  sort: "created_desc",
  minStar: 0,
  hiddenOnly: false,
};

export default function QuizzesPage() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [quizzes, setQuizzes] = useState<QuizPublic[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setQuizzes(null);
    const p = new URLSearchParams({
      status: filters.status,
      sort: filters.sort,
      minStar: String(filters.minStar),
      hidden: filters.hiddenOnly ? "only" : "exclude",
    });
    apiGet<{ quizzes: QuizPublic[] }>(`/api/quizzes?${p}`)
      .then((r) => setQuizzes(r.quizzes))
      .catch((e: Error) => setError(e.message));
  }, [filters]);

  useEffect(load, [load]);

  function onAnswered(quizId: string, result: AttemptResult) {
    setQuizzes((prev) =>
      prev
        ? prev.map((q) =>
            q.id === quizId
              ? {
                  ...q,
                  attempt_count: q.attempt_count + 1,
                  last_correct: result.is_correct,
                  last_answered_at: new Date().toISOString(),
                }
              : q,
          )
        : prev,
    );
  }

  return (
    <>
      <h1>クイズ</h1>
      {error && <p className="error">{error}</p>}

      <QuizFilters value={filters} onChange={setFilters} />

      {quizzes === null ? (
        <p className="muted">読み込み中…</p>
      ) : quizzes.length === 0 ? (
        <p className="muted">
          条件に合うクイズがありません。「未出題の学び」からクイズ生成を依頼してください。
        </p>
      ) : (
        <>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            {quizzes.length} 件
          </p>
          {quizzes.map((q) => (
            <QuizCard
              key={q.id}
              quiz={q}
              onAnswered={onAnswered}
              onChanged={load}
              annotationsToggle
            />
          ))}
        </>
      )}
    </>
  );
}
