"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../../lib/client";
import type { AttemptResult, QuizPublic } from "../../lib/types";
import { QuizCard } from "../_components/QuizCard";
import { QuizFilters, type FilterState } from "../_components/QuizFilters";
import { Pager, PAGE_SIZE } from "../_components/Pager";

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
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setQuizzes(null);
    setPage(1);
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

  function goPage(n: number) {
    setPage(n);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

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
          {quizzes
            .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
            .map((q) => (
              <QuizCard
                key={q.id}
                quiz={q}
                onAnswered={onAnswered}
                onChanged={load}
                annotationsToggle
              />
            ))}
          <Pager page={page} total={quizzes.length} onPage={goPage} />
        </>
      )}
    </>
  );
}
