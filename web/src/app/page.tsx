"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "../lib/client";
import type { TagStat } from "../lib/types";
import { TagPie } from "./_components/TagPie";

export default function HomePage() {
  const [stats, setStats] = useState<TagStat[] | null>(null);
  const [unanswered, setUnanswered] = useState<number | null>(null);
  const [unquizzed, setUnquizzed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ stats: TagStat[]; unanswered: number; unquizzed: number }>("/api/home")
      .then((d) => {
        setStats(d.stats);
        setUnanswered(d.unanswered);
        setUnquizzed(d.unquizzed);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const weak = (stats ?? []).filter((s) => s.weak);

  return (
    <>
      <h1>ホーム</h1>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <p>
          未解答のクイズ: <strong>{unanswered ?? "…"}</strong> 件（
          <Link href="/quizzes">解く</Link>）
        </p>
        <p>
          まだクイズ化されていない学び: <strong>{unquizzed ?? "…"}</strong> 件（
          <Link href="/knowledge">一覧</Link>）
        </p>
      </div>

      <h2>出題の内訳</h2>
      {stats === null ? (
        <p className="muted">読み込み中…</p>
      ) : (
        <div className="card">
          <TagPie stats={stats} />
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
              <span className="tag weak">{s.tag_name}</span>{" "}
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
              <span className={s.weak ? "tag weak" : "tag"}>{s.tag_name}</span>{" "}
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
