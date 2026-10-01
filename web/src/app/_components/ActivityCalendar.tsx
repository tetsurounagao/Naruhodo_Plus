"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "../../lib/client";
import { countByLocalDate, currentStreak, localDateKey as dateKey } from "../../lib/streak";

const WEEKS = 26;
// 0=なし → 濃い緑
const LEVELS = ["#ececea", "#cfe8db", "#9ed7ba", "#5fb591", "#2f6f4f"];

/** answers=解答した日、quizzes=クイズを生成した日。 */
type Kind = "answers" | "quizzes";

function level(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  if (n <= 3) return 2;
  if (n <= 5) return 3;
  return 4;
}

export function ActivityCalendar() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("answers");
  // モードごとに一度だけ取得してキャッシュ（切り替えで再取得しない）
  const [countsByKind, setCountsByKind] = useState<Partial<Record<Kind, Record<string, number>>>>({});
  const counts = countsByKind[kind] ?? null;

  useEffect(() => {
    if (countsByKind[kind]) return;
    apiGet<{ timestamps: string[] }>(`/api/activity?kind=${kind}`)
      .then((r) => setCountsByKind((prev) => ({ ...prev, [kind]: countByLocalDate(r.timestamps) })))
      .catch(() => setCountsByKind((prev) => ({ ...prev, [kind]: {} })));
  }, [kind, countsByKind]);

  const columns = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - (WEEKS * 7 - 1));
    start.setDate(start.getDate() - start.getDay()); // 日曜まで戻す

    const cols: { date: Date; key: string }[][] = [];
    const cur = new Date(start);
    while (cols.length < WEEKS + 1) {
      const col: { date: Date; key: string }[] = [];
      for (let d = 0; d < 7; d++) {
        col.push({ date: new Date(cur), key: dateKey(cur) });
        cur.setDate(cur.getDate() + 1);
      }
      cols.push(col);
      if (col[0].date > today) break;
    }
    return cols;
  }, []);

  const answers = kind === "answers";

  const head = (
    <div className="actcal-head">
      <div className="actcal-mode" role="group" aria-label="表示する活動">
        <button className={answers ? "active" : undefined} onClick={() => setKind("answers")}>
          解答
        </button>
        <button className={answers ? undefined : "active"} onClick={() => setKind("quizzes")}>
          生成
        </button>
      </div>
      {answers && counts && <StreakLabel counts={counts} />}
    </div>
  );
  const caption = (
    <p className="muted actcal-caption">
      {answers
        ? "クイズを解いた日（直近26週）。"
        : "クイズを生成した日（直近26週）。マスをクリックするとその日の生成分を表示。"}
    </p>
  );

  if (counts === null) {
    return (
      <>
        {head}
        {caption}
        <p className="muted">読み込み中…</p>
      </>
    );
  }

  const todayKey = dateKey(new Date());
  const now = new Date();

  function openDay(key: string) {
    const [y, m, d] = key.split("-").map(Number);
    const from = new Date(y, m - 1, d).toISOString();
    const to = new Date(y, m - 1, d + 1).toISOString();
    router.push(`/search?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  }

  return (
    <>
      {head}
      {caption}
      <div className="actcal">
        <div className="actcal-months">
          {columns.map((col, ci) => {
            const first = col[0].date;
            const prevFirst = ci > 0 ? columns[ci - 1][0].date : null;
            const show =
              !prevFirst || first.getMonth() !== prevFirst.getMonth();
            return (
              <span key={ci}>{show ? `${first.getMonth() + 1}月` : ""}</span>
            );
          })}
        </div>
        <div className="actcal-grid">
          {columns.map((col, ci) => (
            <div className="actcal-col" key={ci}>
              {col.map(({ key, date }) => {
                const future = date > now;
                const n = counts[key] ?? 0;
                const className = "actcal-cell" + (key === todayKey ? " today" : "");
                const style = { background: future ? "transparent" : LEVELS[level(n)] };
                // 解答モードは遷移先が無いのでクリック不可（span で描画し title だけ出す）
                if (answers) {
                  return (
                    <span
                      key={key}
                      className={className + " static"}
                      style={style}
                      title={future ? undefined : `${key} ・ ${n}問解答`}
                    />
                  );
                }
                return (
                  <button
                    key={key}
                    className={className}
                    style={style}
                    disabled={future || n === 0}
                    title={`${key} ・ ${n}問`}
                    onClick={() => openDay(key)}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="actcal-legend muted">
          <span>少</span>
          {LEVELS.map((c, i) => (
            <span key={i} className="sw" style={{ background: c }} />
          ))}
          <span>多</span>
        </div>
      </div>
    </>
  );
}

/** 「連続 N 日」。今日まだ解いていなければその旨を添える。 */
function StreakLabel({ counts }: { counts: Record<string, number> }) {
  const days = new Set(Object.keys(counts));
  const streak = currentStreak(days);
  if (streak === 0) return <span className="actcal-streak muted">連続記録なし</span>;
  return (
    <span className="actcal-streak">
      連続 <strong>{streak}</strong> 日
      {!days.has(dateKey(new Date())) && <span className="muted">（今日はまだ）</span>}
    </span>
  );
}
