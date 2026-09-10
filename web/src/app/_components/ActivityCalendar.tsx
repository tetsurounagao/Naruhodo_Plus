"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "../../lib/client";

const WEEKS = 26;
// 0=なし → 濃い緑
const LEVELS = ["#ececea", "#cfe8db", "#9ed7ba", "#5fb591", "#2f6f4f"];

function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function level(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  if (n <= 3) return 2;
  if (n <= 5) return 3;
  return 4;
}

export function ActivityCalendar() {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    apiGet<{ timestamps: string[] }>("/api/activity")
      .then((r) => {
        const c: Record<string, number> = {};
        for (const ts of r.timestamps) {
          const k = dateKey(new Date(ts));
          c[k] = (c[k] ?? 0) + 1;
        }
        setCounts(c);
      })
      .catch(() => setCounts({}));
  }, []);

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

  if (counts === null) return <p className="muted">読み込み中…</p>;

  const todayKey = dateKey(new Date());
  const now = new Date();

  function openDay(key: string) {
    const [y, m, d] = key.split("-").map(Number);
    const from = new Date(y, m - 1, d).toISOString();
    const to = new Date(y, m - 1, d + 1).toISOString();
    router.push(`/search?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  }

  return (
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
              const n = counts![key] ?? 0;
              return (
                <button
                  key={key}
                  className={"actcal-cell" + (key === todayKey ? " today" : "")}
                  style={{ background: future ? "transparent" : LEVELS[level(n)] }}
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
  );
}
