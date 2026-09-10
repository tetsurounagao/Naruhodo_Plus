"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet } from "../../lib/client";
import type { AttemptResult, QuizPublic } from "../../lib/types";
import { QuizCard } from "../_components/QuizCard";
import { QuizFilters, type FilterState } from "../_components/QuizFilters";

const DEFAULT_FILTERS: FilterState = {
  status: "all",
  sort: "created_desc",
  minStar: 0,
  hiddenOnly: false,
};

function SearchInner() {
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [tags, setTags] = useState("");
  const [includeNote, setIncludeNote] = useState(false);
  const [includeTitles, setIncludeTitles] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const [results, setResults] = useState<QuizPublic[] | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{
    from: string;
    to: string;
    label: string;
  } | null>(null);

  async function run(
    e?: React.FormEvent,
    override?: { q?: string; tags?: string; from?: string; to?: string },
  ) {
    e?.preventDefault();
    setResults(null);
    setError(null);

    const qv = (override?.q ?? q).trim();
    const tagsRaw = override?.tags ?? tags;
    const tagList = tagsRaw
      .split(/[,、\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    // override に from キーがあれば（undefined でも）それを使う＝解除も表現できる
    const fromV = override && "from" in override ? override.from : dateRange?.from;
    const toV = override && "to" in override ? override.to : dateRange?.to;

    const p = new URLSearchParams({
      status: filters.status,
      sort: filters.sort,
      minStar: String(filters.minStar),
      hidden: filters.hiddenOnly ? "only" : "exclude",
    });
    if (qv) p.set("q", qv);
    if (tagList.length) p.set("tags", tagList.join(","));
    if (includeNote) p.set("note", "1");
    if (includeTitles) p.set("titles", "1");
    if (fromV) p.set("from", fromV);
    if (toV) p.set("to", toV);

    try {
      const r = await apiGet<{ quizzes: QuizPublic[] }>(`/api/search?${p}`);
      setResults(r.quizzes);
      setSearched(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // URL の ?tags= / ?q= / ?from=&to= があれば反映して自動実行
  useEffect(() => {
    const t = params.get("tags") ?? "";
    const query = params.get("q") ?? "";
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    if (!t && !query && !from) return;
    setTags(
      t
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .join(", "),
    );
    setQ(query);
    if (from) {
      setDateRange({
        from,
        to,
        label: new Date(from).toLocaleDateString("ja-JP"),
      });
    } else {
      setDateRange(null);
    }
    run(undefined, {
      q: query,
      tags: t,
      from: from || undefined,
      to: to || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

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
        {dateRange && (
          <p style={{ marginTop: 8, fontSize: "0.85rem" }}>
            生成日: <strong>{dateRange.label}</strong>{" "}
            <button
              type="button"
              onClick={() => {
                setDateRange(null);
                run(undefined, { from: undefined, to: undefined });
              }}
              style={{ padding: "2px 8px", fontSize: "0.8rem" }}
            >
              解除
            </button>
          </p>
        )}
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
                onChanged={() => run()}
                annotationsToggle
              />
            ))
          )}
        </>
      )}
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchInner />
    </Suspense>
  );
}
