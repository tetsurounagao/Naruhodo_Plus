"use client";

import type { MasteryGroup } from "../../lib/types";
import { MASTERY_LABELS, type Mastery } from "../../lib/mastery";
import { Bulb } from "./Bulb";
import { Tag } from "./Tag";

const LEVELS: Mastery[] = [0, 1, 2, 3];

/** 行ごとの内訳（読み上げ用）。例: 「12問: まだ 4・ほんのり 5・明るい 2・身についた 1」 */
function describe(levels: Mastery[]): string {
  const parts = LEVELS.map((lv) => [lv, levels.filter((l) => l === lv).length] as const)
    .filter(([, n]) => n > 0)
    .map(([lv, n]) => `${MASTERY_LABELS[lv]} ${n}`);
  return `${levels.length}問: ${parts.join("・")}`;
}

/**
 * 灯った知識（なるほど電球ボード）。タグごとに、その問題の電球を明るい順に並べる。
 * 並び・まとめ方はサーバー側（queries.ts の buildMasteryBoard）で決めたものをそのまま出す。
 */
export function MasteryBoard({
  groups,
  lit,
  total,
}: {
  groups: MasteryGroup[];
  lit: number;
  total: number;
}) {
  return (
    <>
      <div className="mastery-head">
        <h2>灯った知識</h2>
        {total > 0 && (
          <span className="mastery-count">
            <span className="mastery-lit">{lit}</span> / {total} 点灯
          </span>
        )}
      </div>

      {total === 0 ? (
        <p className="muted mastery-empty">
          まだクイズがありません。学びをクイズにすると、ここに電球が並びます。
        </p>
      ) : (
        <>
          <ul className="mastery-rows">
            {groups.map((g) => (
              <li key={`${g.kind}:${g.label}`} className="mastery-row">
                <span className="mastery-tag">
                  {g.kind === "tag" ? (
                    <Tag name={g.label} />
                  ) : (
                    <span
                      className="tag mastery-tag-plain"
                      title={g.kind === "other" ? `ほか ${g.tagCount} タグ` : undefined}
                    >
                      {g.label}
                    </span>
                  )}
                </span>
                {/* 電球 1 つずつの読み上げは冗長なので、行の内訳を 1 文で読ませる（電球の title はマウスで見える） */}
                <span className="visually-hidden">{describe(g.levels)}</span>
                <span className="mastery-bulbs" aria-hidden="true">
                  {g.levels.map((lv, i) => (
                    <Bulb key={i} level={lv} size={20} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <div className="mastery-legend">
            {LEVELS.map((lv) => (
              <span key={lv}>
                <span aria-hidden="true">
                  <Bulb level={lv} size={16} />
                </span>
                {MASTERY_LABELS[lv]}
              </span>
            ))}
            <span className="mastery-legend-note">自信ありで続けて正解するほど明るくなる</span>
          </div>
        </>
      )}
    </>
  );
}
