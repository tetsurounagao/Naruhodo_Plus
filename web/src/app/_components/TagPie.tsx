"use client";

import type { TagStat } from "../../lib/types";

/**
 * タグ別の出題比率（要件 §9 の円グラフ）。
 *
 * データビズ方針: 全ペア隣接となる円グラフで色だけに識別を負わせられるのは 3 色まで。
 * そのため色スライスは上位 3 タグ + 「その他」に畳み、残りは下の内訳リスト（表の代わり）に
 * 全タグ分を出す。凡例と内訳は必ず出す（色のみに依存しない）。
 * パレットは dataviz スキルの検証済みカテゴリ配色 slot 1-3（light）。
 */
const SLICE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"];
const OTHER_COLOR = "#8a8a84";
const TOP_N = 3;

interface Slice {
  label: string;
  count: number;
  color: string;
}

export function TagPie({ stats }: { stats: TagStat[] }) {
  const withQuizzes = stats
    .filter((s) => s.quiz_count > 0)
    .sort((a, b) => b.quiz_count - a.quiz_count);

  const total = withQuizzes.reduce((sum, s) => sum + s.quiz_count, 0);

  if (total === 0) {
    return <p className="muted">まだクイズがありません。</p>;
  }

  const top = withQuizzes.slice(0, TOP_N);
  const rest = withQuizzes.slice(TOP_N);
  const slices: Slice[] = top.map((s, i) => ({
    label: s.tag_name,
    count: s.quiz_count,
    color: SLICE_COLORS[i],
  }));
  if (rest.length > 0) {
    slices.push({
      label: `その他（${rest.length}タグ）`,
      count: rest.reduce((sum, s) => sum + s.quiz_count, 0),
      color: OTHER_COLOR,
    });
  }

  // C = 100 になる半径。dashoffset 25 で真上スタート。
  const R = 100 / (2 * Math.PI);
  const GAP = 0.8; // スライス間の隙間（viewBox 単位）
  let acc = 0;

  const pct = (n: number) => Math.round((n / total) * 100);

  return (
    <div className="tagpie">
      <svg viewBox="0 0 42 42" className="tagpie-svg" role="img" aria-label="タグ別の出題比率">
        <circle cx="21" cy="21" r={R} fill="none" stroke="#ececea" strokeWidth="6" />
        {slices.map((s) => {
          const len = (s.count / total) * 100;
          const dash = Math.max(len - GAP, 0.01);
          const offset = 25 - acc;
          acc += len;
          return (
            <circle
              key={s.label}
              cx="21"
              cy="21"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="6"
              strokeDasharray={`${dash} ${100 - dash}`}
              strokeDashoffset={offset}
            >
              <title>{`${s.label}: ${s.count}問 (${pct(s.count)}%)`}</title>
            </circle>
          );
        })}
        <text x="21" y="20.5" textAnchor="middle" className="tagpie-total">
          {total}
        </text>
        <text x="21" y="25" textAnchor="middle" className="tagpie-unit">
          問
        </text>
      </svg>

      <ul className="tagpie-legend">
        {slices.map((s) => (
          <li key={s.label}>
            <span className="sw" style={{ background: s.color }} />
            {s.label}
            <span className="muted">
              {" "}
              {s.count}問 / {pct(s.count)}%
            </span>
          </li>
        ))}
      </ul>

      {rest.length > 0 && (
        <details className="tagpie-breakdown">
          <summary>全タグの内訳</summary>
          <ul>
            {withQuizzes.map((s) => (
              <li key={s.tag_id}>
                {s.tag_name}
                <span className="muted">
                  {" "}
                  {s.quiz_count}問 / {pct(s.quiz_count)}%
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
