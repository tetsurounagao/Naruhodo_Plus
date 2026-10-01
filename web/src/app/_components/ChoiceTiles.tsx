"use client";

import type { AttemptResult, QuizChoice } from "../../lib/types";
import { ChoiceContent } from "./ChoiceContent";

/** PC で 2 列に並べてよい選択肢の最大文字数。 */
const TWO_COLUMN_MAX_CHARS = 60;

/**
 * 選択肢を PC で 2 列に並べてよいか。全部が文字で、いちばん長いものが 60 文字以下のときだけ。
 * コード・画像を含む・長い文があるときは 1 列（スマホは CSS 側で常に 1 列）。
 */
export function fitsTwoColumns(choices: QuizChoice[]): boolean {
  return (
    choices.length > 1 &&
    choices.every((c) => c.type === "text" && [...c.content].length <= TWO_COLUMN_MAX_CHARS)
  );
}

/**
 * 選択肢のタイル（/play と一覧から解く で共通）。番号のバッジ付き。
 * 選択中 = 紫、解答後は 正解 = 緑 / 自分の誤答 = 赤（#66 の pop / shake はそのまま効く）。
 */
export function ChoiceTiles({
  choices,
  selected,
  result,
  onSelect,
  twoColumns = false,
}: {
  choices: QuizChoice[];
  selected: string | null;
  result: AttemptResult | null;
  onSelect: (choiceId: string) => void;
  twoColumns?: boolean;
}) {
  return (
    <ul className={`choices choice-tiles${twoColumns ? " two-col" : ""}`}>
      {choices.map((c, i) => {
        const isCorrect = !!result && c.id === result.correct_answer;
        const isWrong = !!result && !isCorrect && c.id === selected;
        const cls = isCorrect ? "correct" : isWrong ? "wrong" : !result && c.id === selected ? "selected" : "";
        return (
          <li key={c.id}>
            <button
              type="button"
              className={cls}
              disabled={!!result}
              aria-pressed={result ? undefined : c.id === selected}
              onClick={() => onSelect(c.id)}
            >
              <span className="choice-key">{i + 1}</span>
              <ChoiceContent choice={c} />
              {/* 色だけに頼らず、読み上げでも結果が分かるように */}
              {isCorrect && <span className="play-visually-hidden">（正解）</span>}
              {isWrong && <span className="play-visually-hidden">（あなたの回答・不正解）</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
