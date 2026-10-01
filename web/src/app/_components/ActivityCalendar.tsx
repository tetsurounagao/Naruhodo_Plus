"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "../../lib/client";
import { countByLocalDate, currentStreak, localDateKey as dateKey } from "../../lib/streak";

const WEEKS = 26;
/** 0=なし → 濃い緑（GitHub の草と同じ 5 段階）。 */
const LEVELS = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];
/** 月ラベル同士・月ラベルと左端の間に空ける最小の列数（これ未満だと文字が重なる）。 */
const MONTH_LABEL_MIN_GAP = 3;

/** answers=解答した日、quizzes=クイズを生成した日。 */
type Kind = "answers" | "quizzes";

function level(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  if (n <= 3) return 2;
  if (n <= 5) return 3;
  return 4;
}

/**
 * 月ラベルを出す列の番号 → ラベル。
 * 各列の先頭（日曜）の月が前の列と変わったところに出す。左端の列は月の途中から始まるので、
 * 次の月のラベルが近い（MONTH_LABEL_MIN_GAP 列未満）ときは出さない（「3月4月」の重なり防止）。
 */
function monthLabels(columns: { date: Date }[][]): Map<number, string> {
  const starts: number[] = [];
  columns.forEach((col, ci) => {
    if (ci === 0 || col[0].date.getMonth() !== columns[ci - 1][0].date.getMonth()) starts.push(ci);
  });
  const out = new Map<number, string>();
  let last = -Infinity;
  starts.forEach((ci, i) => {
    const next = starts[i + 1];
    if (ci === 0 && next !== undefined && next < MONTH_LABEL_MIN_GAP) return;
    if (ci - last < MONTH_LABEL_MIN_GAP) return;
    out.set(ci, `${columns[ci][0].date.getMonth() + 1}月`);
    last = ci;
  });
  return out;
}

/**
 * 稼働カレンダー。
 * answerTimestamps を渡すと解答モードはそれを使い、自前では取得しない（ホームで今日の解答数用に
 * 取得済みのものを使い回して二重取得を避ける。null は親が読み込み中）。省略時は自前で取得する。
 * titles を渡すとモードに合わせた見出し（h2）を出す。showStreak=false で「連続 N 日」を隠す
 * （ヘッダーに同じ表示があるホーム用）。
 */
export function ActivityCalendar({
  answerTimestamps,
  titles,
  showStreak = true,
}: {
  answerTimestamps?: string[] | null;
  titles?: Record<Kind, string>;
  showStreak?: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("answers");
  // モードごとに一度だけ取得してキャッシュ（切り替えで再取得しない）
  const [countsByKind, setCountsByKind] = useState<Partial<Record<Kind, Record<string, number>>>>({});
  const provided = kind === "answers" && answerTimestamps !== undefined;
  const providedCounts = useMemo(
    () => (answerTimestamps ? countByLocalDate(answerTimestamps) : null),
    [answerTimestamps],
  );
  const counts = provided ? providedCounts : countsByKind[kind] ?? null;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (provided || countsByKind[kind]) return;
    apiGet<{ timestamps: string[] }>(`/api/activity?kind=${kind}`)
      .then((r) => setCountsByKind((prev) => ({ ...prev, [kind]: countByLocalDate(r.timestamps) })))
      .catch(() => setCountsByKind((prev) => ({ ...prev, [kind]: {} })));
  }, [kind, countsByKind, provided]);

  // 横スクロールになる狭い画面では、最新の週（右端）が見えるようにしておく
  const loaded = counts !== null;
  useEffect(() => {
    const el = scrollRef.current;
    if (loaded && el) el.scrollLeft = el.scrollWidth;
  }, [loaded]);

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
  const labels = useMemo(() => monthLabels(columns), [columns]);

  const answers = kind === "answers";

  const head = (
    <div className="actcal-head">
      {titles && <h2 className="actcal-title">{titles[kind]}</h2>}
      <div className="actcal-mode" role="group" aria-label="表示する活動">
        <button
          className={answers ? "active" : undefined}
          aria-pressed={answers}
          onClick={() => setKind("answers")}
        >
          解答
        </button>
        <button
          className={answers ? undefined : "active"}
          aria-pressed={!answers}
          onClick={() => setKind("quizzes")}
        >
          生成
        </button>
      </div>
      {showStreak && answers && counts && <StreakLabel counts={counts} />}
      <div className="actcal-legend muted" aria-hidden="true">
        <span>少</span>
        {LEVELS.map((c, i) => (
          <span key={i} className="sw" style={{ background: c }} />
        ))}
        <span>多</span>
      </div>
    </div>
  );
  const caption = (
    <p className="muted actcal-caption">
      {answers
        ? `クイズを解いた日（直近${WEEKS}週）。`
        : `クイズを生成した日（直近${WEEKS}週）。マスをクリックするとその日の生成分を表示。`}
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
      <div className="actcal" ref={scrollRef}>
        <div className="actcal-months" aria-hidden="true">
          {columns.map((_, ci) => (
            <span key={ci}>{labels.get(ci) ?? ""}</span>
          ))}
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
                    aria-label={`${key} ${n}問生成`}
                    onClick={() => openDay(key)}
                  />
                );
              })}
            </div>
          ))}
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
