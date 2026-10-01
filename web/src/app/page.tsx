"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet } from "../lib/client";
import type { TagStat } from "../lib/types";
import { TagPie } from "./_components/TagPie";
import { Tag } from "./_components/Tag";
import { ActivityCalendar } from "./_components/ActivityCalendar";
import { CopyPromptButton } from "./_components/CopyPromptButton";
import { batchQuizPrompt } from "../lib/quiz-prompts";
import { currentStreak, localDateKey } from "../lib/streak";

interface HomeData {
  stats: TagStat[];
  unanswered: number;
  unquizzed: number;
  quizTotal: number;
  dueCount: number;
}

/** /play の 1 セッションの最大問題数（play/page.tsx の SESSION_SIZE と揃える）。 */
const SESSION_SIZE = 10;

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 解答日時。連続日数とカレンダー（解答モード）の両方で使う（取得は 1 回）
  const [answerTs, setAnswerTs] = useState<string[] | null>(null);

  useEffect(() => {
    apiGet<HomeData>("/api/home")
      .then(setData)
      .catch((e: Error) => setError(e.message));
    apiGet<{ timestamps: string[] }>("/api/activity?kind=answers")
      .then((r) => setAnswerTs(r.timestamps))
      .catch(() => setAnswerTs([]));
  }, []);

  const answerDays = useMemo(
    () => (answerTs ? new Set(answerTs.map((ts) => localDateKey(new Date(ts)))) : null),
    [answerTs],
  );

  const stats = data?.stats ?? null;
  const weak = (stats ?? []).filter((s) => s.weak);

  return (
    <>
      <h1>ホーム</h1>
      {error && <p className="error">{error}</p>}

      <h2>今日やること</h2>
      <div className="card">
        {answerDays && <StreakLine days={answerDays} />}
        {data === null ? (
          !error && <p className="muted">読み込み中…</p>
        ) : data.dueCount === 0 && data.unanswered === 0 && data.unquizzed === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            今日やることはありません。
          </p>
        ) : (
          <ul className="today-list">
            {data.dueCount > 0 && (
              <li>
                <span className="today-label">
                  復習 <strong>{data.dueCount}</strong> 問
                </span>
                <span className="today-actions">
                  <Link className="button-link" href="/play?mode=review">
                    今日の復習を始める（{Math.min(data.dueCount, SESSION_SIZE)}問）
                  </Link>
                  <Link href="/review">一覧</Link>
                </span>
              </li>
            )}
            {data.unanswered > 0 && (
              <li>
                <span className="today-label">
                  未解答 <strong>{data.unanswered}</strong> 問
                </span>
                <span className="today-actions">
                  <Link
                    className={data.dueCount > 0 ? "button-link secondary" : "button-link"}
                    href="/play?mode=unanswered"
                  >
                    未解答を解く（{Math.min(data.unanswered, SESSION_SIZE)}問）
                  </Link>
                  <Link href="/quizzes">一覧</Link>
                </span>
              </li>
            )}
            {data.unquizzed > 0 && (
              <li>
                <span className="today-label">
                  未出題の学び <strong>{data.unquizzed}</strong> 件
                </span>
                <span className="today-actions">
                  <CopyPromptButton
                    text={batchQuizPrompt}
                    label="まとめてクイズ化を依頼（プロンプトをコピー）"
                  />
                  <Link href="/knowledge">一覧</Link>
                </span>
              </li>
            )}
          </ul>
        )}
      </div>

      <h2>最近の活動</h2>
      <div className="card">
        <ActivityCalendar answerTimestamps={answerTs} />
      </div>

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
              {s.total_attempts}）{" "}
              <Link href={`/play?tag=${encodeURIComponent(s.tag_name)}`}>このタグを解く →</Link>
            </div>
          ))}
        </div>
      )}

      <h2>出題の内訳</h2>
      {stats === null ? (
        <p className="muted">読み込み中…</p>
      ) : (
        <div className="card">
          <TagPie stats={stats} quizTotal={data?.quizTotal ?? 0} />
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

/** 連続学習日数の 1 行。今日まだ解いていなければ「今日解くと N+1 日」と促す。 */
function StreakLine({ days }: { days: Set<string> }) {
  const streak = currentStreak(days);
  const doneToday = days.has(localDateKey(new Date()));
  return (
    <p className="today-streak">
      {streak === 0 ? (
        <span className="muted">連続学習の記録はまだありません。今日 1 問解くとスタート。</span>
      ) : doneToday ? (
        <>
          連続学習 <strong>{streak}</strong> 日（今日も解答済み）
        </>
      ) : (
        <>
          連続学習 <strong>{streak}</strong> 日
          <span className="muted">（今日解くと {streak + 1} 日）</span>
        </>
      )}
    </p>
  );
}
