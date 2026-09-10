"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "../lib/client";
import type { ReviewItem, TagStat } from "../lib/types";
import { TagPie } from "./_components/TagPie";
import { Tag } from "./_components/Tag";
import { ActivityCalendar } from "./_components/ActivityCalendar";

interface HomeData {
  stats: TagStat[];
  unanswered: number;
  unquizzed: number;
  quizTotal: number;
  dueForReview: ReviewItem[];
  dueCount: number;
}

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<HomeData>("/api/home")
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const stats = data?.stats ?? null;
  const weak = (stats ?? []).filter((s) => s.weak);

  return (
    <>
      <h1>ホーム</h1>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <p>
          未解答のクイズ: <strong>{data?.unanswered ?? "…"}</strong> 件（
          <Link href="/quizzes">解く</Link>）
        </p>
        <p>
          まだクイズ化されていない学び: <strong>{data?.unquizzed ?? "…"}</strong> 件（
          <Link href="/knowledge">一覧</Link>）
        </p>
      </div>

      <h2>最近の活動</h2>
      <div className="card">
        <p className="muted" style={{ margin: "0 0 10px", fontSize: "0.85rem" }}>
          クイズを生成した日（直近26週）。マスをクリックするとその日の生成分を表示。
        </p>
        <ActivityCalendar />
      </div>

      {data && data.dueForReview.length > 0 && (
        <>
          <h2>復習のおすすめ</h2>
          <div className="card">
            <ul className="duelist">
              {data.dueForReview.map((it) => (
                <li key={it.id}>
                  <span className="days">{it.days_since}日前</span>
                  <span className="q">{it.question}</span>
                </li>
              ))}
            </ul>
            <p style={{ marginTop: 12 }}>
              <Link href="/review">
                {data.dueCount > data.dueForReview.length
                  ? `さらに表示（全 ${data.dueCount} 件）`
                  : "復習ページで解く →"}
              </Link>
            </p>
          </div>
        </>
      )}

      <h2>出題の内訳</h2>
      {stats === null ? (
        <p className="muted">読み込み中…</p>
      ) : (
        <div className="card">
          <TagPie stats={stats} quizTotal={data?.quizTotal ?? 0} />
        </div>
      )}

      <h2>要復習タグ</h2>
      {stats === null ? (
        <p className="muted">読み込み中…</p>
      ) : weak.length === 0 ? (
        <p className="muted">該当なし。</p>
      ) : (
        <div className="card">
          {weak.map((s) => (
            <div key={s.tag_id}>
              <Tag name={s.tag_name} weak />{" "}
              {Math.round((s.accuracy ?? 0) * 100)}%（{s.correct_attempts}/
              {s.total_attempts}）
            </div>
          ))}
        </div>
      )}

      <h2>全タグの正答率</h2>
      {stats === null ? (
        <p className="muted">読み込み中…</p>
      ) : stats.length === 0 ? (
        <p className="muted">まだ解答履歴がありません。</p>
      ) : (
        <div className="card">
          {stats.map((s) => (
            <div key={s.tag_id}>
              <Tag name={s.tag_name} weak={s.weak} />{" "}
              {s.accuracy === null
                ? "未解答"
                : `${Math.round(s.accuracy * 100)}%（${s.correct_attempts}/${s.total_attempts}）`}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
