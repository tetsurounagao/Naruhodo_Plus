"use client";

import type { AttemptResult, QuizChoice } from "../../lib/types";
import { Markdown } from "./Markdown";

/** 選択肢の中身を 1 行ぶんの見出しとして出す（画像は小さく）。 */
function ChoiceLabel({ choice }: { choice: QuizChoice }) {
  if (choice.type === "code") return <code className="choice-code">{choice.content}</code>;
  if (choice.type === "image") return <img className="rationale-img" src={choice.content} alt="" />;
  return <span>{choice.content}</span>;
}

/**
 * 誤答したとき、選んだ選択肢がなぜ違うのかを結果表示のすぐ下に目立たせて出す。
 * 正解したとき・その選択肢に理由が無いときは何も出さない。
 */
export function PickedRationale({
  choices,
  selected,
  result,
}: {
  choices: QuizChoice[];
  selected: string | null;
  result: AttemptResult;
}) {
  if (result.is_correct || !selected) return null;
  const text = result.rationales?.[selected];
  const choice = choices.find((c) => c.id === selected);
  if (!text || !choice) return null;
  return (
    <div className="picked-rationale">
      <p className="picked-rationale-head">
        選んだ選択肢: <ChoiceLabel choice={choice} /> が違う理由
      </p>
      <Markdown>{text}</Markdown>
    </div>
  );
}

/** 全選択肢の理由を折りたたみで出す。理由が 1 つも無い（既存の）クイズでは何も出さない。 */
export function ChoiceRationales({
  choices,
  selected,
  result,
}: {
  choices: QuizChoice[];
  selected: string | null;
  result: AttemptResult;
}) {
  const rationales = result.rationales ?? {};
  if (!choices.some((c) => rationales[c.id])) return null;
  return (
    <details className="choice-rationales">
      <summary>選択肢ごとの解説</summary>
      <ul>
        {choices.map((c) => {
          const isCorrect = c.id === result.correct_answer;
          return (
            <li key={c.id} className={isCorrect ? "correct" : ""}>
              <p className="choice-rationale-head">
                <span className={isCorrect ? "badge-ok" : "badge-ng"}>{isCorrect ? "正解" : "誤り"}</span>
                <ChoiceLabel choice={c} />
                {c.id === selected && <span className="muted">（あなたの回答）</span>}
              </p>
              {rationales[c.id] ? (
                <Markdown>{rationales[c.id]}</Markdown>
              ) : (
                <p className="muted">（解説なし）</p>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
