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
import { NEW_PER_DAY } from "../lib/term";
/** 要復習タグの付箋を何枚まで出すか。灯った知識のボードと高さがそろう枚数にする（残りは下の「タグ別の内訳と正答率」へ）。 */
const WEAK_STICKY_MAX = 3;

export default function HomePage() {
  const [data, setData] = useState<HomeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 解答日時。今日の解答数とカレンダー（解答モード）の両方で使う（取得は 1 回）
  const [answerTs, setAnswerTs] = useState<string[] | null>(null);

  useEffect(() => {
    apiGet<HomeSummary>(`/api/home?tz=${new Date().getTimezoneOffset()}`)
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

      {data && <BacklogCard data={data} />}

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

/**
 * 最上部の「今日やること」。溜まっている復習の総数は見せず、今日の 1 ターム（lib/term.ts）だけを出す。
 * 目標（1 ターム）を解き終えたら「今日の分クリア！」と「もう 1 ターム」。
 */
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
  const term = data?.term;
  const unquizzed = data?.unquizzed ?? 0;
  const cleared = todayCount !== null && todayCount >= DAILY_GOAL;

  return (
    <section className="card taped home-today" aria-labelledby="home-today-title">
      <div className="today-main">
        <h1 id="home-today-title" className="squiggle">
          今日やること
        </h1>
        <p className="today-goal">
          {todayCount === null ? (
            " "
          ) : !cleared ? (
            <>
              <span className="marker">あと {DAILY_GOAL - todayCount} 問</span>で今日の分クリア
            </>
          ) : (
            <>
              <span className="marker">今日の分クリア！</span>
              {term && term.size > 0 ? "物足りなければ、もう 1 タームどうぞ。" : "おつかれさまでした。"}
            </>
          )}
        </p>
        {!term ? (
          loading && <p className="muted today-none">読み込み中…</p>
        ) : term.size > 0 ? (
          <div className="today-cta">
            <Link className={cleared ? "button-link secondary" : "button-link"} href="/play?mode=today">
              {cleared ? "もう 1 ターム" : "今日のタームを始める"}（{term.size} 問）
            </Link>
          </div>
        ) : (
          <p className="muted today-none">
            今日解く問題はもうありません。<Link href="/quizzes">クイズ一覧</Link>
            から好きな問題を解き直せます。
          </p>
        )}
      </div>

      {term && (
        <ul className="today-counts">
          <li className={term.review > 0 ? "today-count due" : "today-count"}>
            <span className="today-count-num">{term.review}</span>
            <span className="today-count-label" title="忘れかけている順に出します">復習</span>
          </li>
          <li className="today-count unanswered">
            <span className="today-count-num">{term.fresh}</span>
            <span className="today-count-label">新しい問題</span>
          </li>
          {term.waitingFresh > 0 && (
            <li className="today-waiting muted">
              控えの新しい問題 {term.waitingFresh} 問は、1 日 {NEW_PER_DAY} 問ずつ出題します
            </li>
          )}
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

/**
 * 実際に溜まっている復習の数。ふだんは閉じておき、押したときだけ見せる
 * （総数が常に見えると気が重くなるので、ホームの主役は今日のタームにしている）。
 */
function BacklogCard({ data }: { data: HomeSummary }) {
  const due = data.dueCount;
  const waiting = data.term.waitingFresh;
  const days = Math.ceil(due / DAILY_GOAL);
  return (
    <details className="card home-backlog">
      <summary>実際の復習の数を見る</summary>
      <ul className="backlog-stats">
        <li>
          <span className="backlog-num">{due}</span>
          <span className="backlog-label">復習期限が来ている問題</span>
        </li>
        <li>
          <span className="backlog-num">{waiting}</span>
          <span className="backlog-label">控えの新しい問題（1 日 {NEW_PER_DAY} 問ずつ）</span>
        </li>
        <li>
          <span className="backlog-num">{days}</span>
          <span className="backlog-label">1 日 1 ターム（{DAILY_GOAL} 問）で消化すると、約 {days} 日</span>
        </li>
      </ul>
      <p className="muted backlog-note">
        正解するほど次に出るまでの間隔が延びるので、実際にはこれより早く減っていきます。
        {due > 0 && (
          <>
            {" "}
            <Link href="/review">一覧を見る</Link>
          </>
        )}
      </p>
    </details>
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
