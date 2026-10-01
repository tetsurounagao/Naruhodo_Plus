"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet } from "../lib/client";
import type { HomeSummary, TagStat } from "../lib/types";
import { TagPie } from "./_components/TagPie";
import { Tag } from "./_components/Tag";
import { ActivityCalendar } from "./_components/ActivityCalendar";
import { CopyPromptButton } from "./_components/CopyPromptButton";
import { MasteryBoard } from "./_components/MasteryBoard";
import { batchQuizPrompt } from "../lib/quiz-prompts";
import { countByLocalDate, localDateKey } from "../lib/streak";
import { DAILY_GOAL } from "../lib/daily-goal";

/** /play の 1 セッションの最大問題数（play/page.tsx の SESSION_SIZE と揃える）。 */
const SESSION_SIZE = 10;
/** 要復習タグの付箋を何枚まで出すか。灯った知識のボードと高さがそろう枚数にする（残りは下の「タグ別の内訳と正答率」へ）。 */
const WEAK_STICKY_MAX = 3;

export default function HomePage() {
  const [data, setData] = useState<HomeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 解答日時。今日の解答数とカレンダー（解答モード）の両方で使う（取得は 1 回）
  const [answerTs, setAnswerTs] = useState<string[] | null>(null);

  useEffect(() => {
    apiGet<HomeSummary>("/api/home")
      .then(setData)
      .catch((e: Error) => setError(e.message));
    apiGet<{ timestamps: string[] }>("/api/activity?kind=answers")
      .then((r) => setAnswerTs(r.timestamps))
      .catch(() => setAnswerTs([]));
  }, []);

  const todayCount = useMemo(
    () => (answerTs ? countByLocalDate(answerTs)[localDateKey(new Date())] ?? 0 : null),
    [answerTs],
  );

  const stats = data?.stats ?? null;
  // 付箋は正答率の低い順（上限で切るときに一番苦手なものから残す）
  const weak = (stats ?? [])
    .filter((s) => s.weak)
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0));

  return (
    <div className="home">
      {error && <p className="error home-full">{error}</p>}

      <TodayCard data={data} todayCount={todayCount} loading={data === null && !error} />

      <section className="card home-board">
        {data === null ? (
          <>
            <h2>灯った知識</h2>
            {!error && <p className="muted">読み込み中…</p>}
          </>
        ) : (
          <MasteryBoard groups={data.mastery} lit={data.masteryLit} total={data.masteryTotal} />
        )}
      </section>

      <section className="home-weak" aria-labelledby="home-weak-title">
        <h2 id="home-weak-title">要復習タグ</h2>
        {stats === null ? (
          !error && <p className="muted">読み込み中…</p>
        ) : (
          <WeakStickies weak={weak} />
        )}
      </section>

      <section className="card home-cal">
        <ActivityCalendar
          answerTimestamps={answerTs}
          titles={{ answers: "解いた日", quizzes: "クイズを作った日" }}
          showStreak={false}
        />
      </section>

      <details className="card home-details">
        <summary>タグ別の内訳と正答率</summary>
        <h3>出題の内訳</h3>
        {stats === null ? (
          <p className="muted">読み込み中…</p>
        ) : (
          <TagPie stats={stats} quizTotal={data?.quizTotal ?? 0} />
        )}
        <h3>全タグの正答率</h3>
        {stats === null ? (
          <p className="muted">読み込み中…</p>
        ) : stats.length === 0 ? (
          <p className="muted">まだ解答履歴がありません。</p>
        ) : (
          <ul className="home-accuracy">
            {stats.map((s) => (
              <li key={s.tag_id}>
                <Tag name={s.tag_name} weak={s.weak} />{" "}
                {s.accuracy === null
                  ? "未解答"
                  : `${Math.round(s.accuracy * 100)}%（${s.correct_attempts}/${s.total_attempts}）`}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}

/** 最上部の「今日やること」。今日の目標までの残り・始めるボタン・件数の内訳。 */
function TodayCard({
  data,
  todayCount,
  loading,
}: {
  data: HomeSummary | null;
  /** 今日解いた問題数。null は読み込み中 */
  todayCount: number | null;
  loading: boolean;
}) {
  const due = data?.dueCount ?? 0;
  const unanswered = data?.unanswered ?? 0;
  const unquizzed = data?.unquizzed ?? 0;
  const hasTask = due > 0 || unanswered > 0;

  return (
    <section className="card taped home-today" aria-labelledby="home-today-title">
      <div className="today-main">
        <h1 id="home-today-title" className="squiggle">
          今日やること
        </h1>
        <p className="today-goal">
          {todayCount === null ? (
            " "
          ) : todayCount < DAILY_GOAL ? (
            <>
              <span className="marker">あと {DAILY_GOAL - todayCount} 問</span>で今日の分クリア
            </>
          ) : (
            <>
              <span className="marker">今日の分クリア！</span>
              {hasTask ? "余力があればもう少しどうぞ。" : "おつかれさまでした。"}
            </>
          )}
        </p>
        {data === null ? (
          loading && <p className="muted today-none">読み込み中…</p>
        ) : hasTask ? (
          <div className="today-cta">
            {due > 0 && (
              <Link className="button-link" href="/play?mode=review">
                今日の復習を始める（{Math.min(due, SESSION_SIZE)} 問）
              </Link>
            )}
            {unanswered > 0 && (
              <Link
                className={due > 0 ? "button-link secondary" : "button-link"}
                href="/play?mode=unanswered"
              >
                未解答を解く（{Math.min(unanswered, SESSION_SIZE)} 問）
              </Link>
            )}
          </div>
        ) : (
          <p className="muted today-none">
            今日やることはありません。<Link href="/quizzes">クイズ一覧</Link>
            から好きな問題を解き直せます。
          </p>
        )}
      </div>

      {data && (
        <ul className="today-counts">
          <li className={due > 0 ? "today-count due" : "today-count"}>
            <span className="today-count-num">{due}</span>
            <Link href="/review" className="today-count-label">
              復習
            </Link>
          </li>
          <li className="today-count unanswered">
            <span className="today-count-num">{unanswered}</span>
            <Link href="/quizzes" className="today-count-label">
              未解答
            </Link>
          </li>
          {unquizzed > 0 && (
            <li className="today-count unquizzed">
              <span className="today-count-num">{unquizzed}</span>
              <Link href="/knowledge" className="today-count-label">
                未出題の学び
              </Link>
              <CopyPromptButton text={batchQuizPrompt} label="依頼をコピー" />
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/** 要復習タグの付箋。黄・ピンクと傾きを交互に。無いときも付箋 1 枚で知らせる。 */
function WeakStickies({ weak }: { weak: TagStat[] }) {
  if (weak.length === 0) {
    return (
      <div className="sticky weak-sticky">
        <div className="weak-sticky-name">苦手なタグはまだありません</div>
        <div className="weak-sticky-rate">正答率が低いタグがあると、ここに貼り出されます。</div>
      </div>
    );
  }
  const shown = weak.slice(0, WEAK_STICKY_MAX);
  const rest = weak.length - shown.length;
  return (
    <>
      <ul className="weak-stickies">
        {shown.map((s, i) => (
          <li key={s.tag_id} className={i % 2 === 1 ? "sticky pink tilt-right weak-sticky" : "sticky weak-sticky"}>
            <div className="weak-sticky-name">{s.tag_name}</div>
            <div className="weak-sticky-rate">
              正答率 {Math.round((s.accuracy ?? 0) * 100)}%（{s.correct_attempts}/{s.total_attempts}）
            </div>
            <Link href={`/play?tag=${encodeURIComponent(s.tag_name)}`}>このタグを解く →</Link>
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <p className="muted weak-rest">ほか {rest} タグは下の「タグ別の内訳と正答率」から。</p>
      )}
    </>
  );
}
