"use client";

import { useState } from "react";
import { apiGet } from "../../lib/client";
import type { AttemptResult, QuizPublic } from "../../lib/types";
import { QuizCard } from "../_components/QuizCard";
import { QuizFilters, type FilterState } from "../_components/QuizFilters";

const DEFAULT_FILTERS: FilterState = {
  status: "all",
  sort: "created_desc",
  minStar: 0,
};

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [tags, setTags] = useState("");
  const [includeNote, setIncludeNote] = useState(false);
  const [includeTitles, setIncludeTitles] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const [results, setResults] = useState<QuizPublic[] | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    setResults(null);
    setError(null);
    const p = new URLSearchParams({
      status: filters.status,
      sort: filters.sort,
      minStar: String(filters.minStar),
    });
    if (q.trim()) p.set("q", q.trim());
    const tagList = tags
      .split(/[,、\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tagList.length) p.set("tags", tagList.join(","));
    if (includeNote) p.set("note", "1");
    if (includeTitles) p.set("titles", "1");

    try {
      const r = await apiGet<{ quizzes: QuizPublic[] }>(`/api/search?${p}`);
      setResults(r.quizzes);
      setSearched(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function onAnswered(quizId: string, result: AttemptResult) {
    setResults((prev) =>
      prev
        ? prev.map((x) =>
            x.id === quizId
              ? {
                  ...x,
                  attempt_count: x.attempt_count + 1,
                  last_correct: result.is_correct,
                  last_answered_at: new Date().toISOString(),
                }
              : x,
          )
        : prev,
    );
  }

  return (
    <>
      <h1>検索</h1>
      <form onSubmit={run} className="card">
        <label htmlFor="q">キーワード</label>
        <input
          id="q"
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="設問・選択肢・解説から検索（スペース区切りで AND）"
        />
        <label htmlFor="tags">タグ（カンマ区切り・いずれか一致）</label>
        <input
          id="tags"
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="例: react, hooks"
        />
        <div className="filters" style={{ marginTop: 10 }}>
          <label>
            <input
              type="checkbox"
              checked={includeNote}
              onChange={(e) => setIncludeNote(e.target.checked)}
            />
            メモも対象
          </label>
          <label>
            <input
              type="checkbox"
              checked={includeTitles}
              onChange={(e) => setIncludeTitles(e.target.checked)}
            />
            参考リンクのタイトルも対象
          </label>
        </div>
        <QuizFilters value={filters} onChange={setFilters} />
        <p style={{ marginTop: 4 }}>
          <button type="submit" className="primary">
            検索
          </button>
        </p>
      </form>

      {error && <p className="error">{error}</p>}

      {results === null && searched && <p className="muted">検索中…</p>}
      {results !== null && (
        <>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            {results.length} 件
          </p>
          {results.length === 0 ? (
            <p className="muted">該当するクイズはありません。</p>
          ) : (
            results.map((quiz) => (
              <QuizCard
                key={quiz.id}
                quiz={quiz}
                onAnswered={onAnswered}
                annotationsToggle
              />
            ))
          )}
        </>
      )}
    </>
  );
}
