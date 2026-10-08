"use client";

import { useEffect, useRef, useState } from "react";
import { MASTERY_LABELS } from "../../lib/mastery";
import type { AttemptResult, Confidence } from "../../lib/types";
import { AnswerButtons } from "./AnswerButtons";
import { BulbChange, bulbChangeOf, type ScheduleQuiz } from "./BulbChange";
import { EasyButton } from "./EasyButton";
import { ResultLabel } from "./ResultLabel";

type Props =
  /** 選択肢を隠すモードで、まだ選択肢を出していない */
  | { mode: "reveal"; onReveal: () => void; error?: string | null }
  /** 解答前 */
  | {
      mode: "answer";
      disabled: boolean;
      onSubmit: (confidence: Confidence) => void;
      error?: string | null;
    }
  /** 解答後 */
  | {
      mode: "result";
      result: AttemptResult;
      confidence: Confidence;
      points: number;
      /** 解答前の連続正解回数（電球の変化を出すため） */
      quiz: ScheduleQuiz;
      /** 「簡単すぎた」を押したか */
      easy: boolean;
      onEasy: () => void;
      nextLabel: string;
      onNext: () => void;
    };

function toneOf(isCorrect: boolean, confidence: Confidence): "ok" | "unsure" | "ng" {
  if (!isCorrect) return "ng";
  return confidence === "unsure" ? "unsure" : "ok";
}

/** 読み上げ用の結果の要約（画面ではスタンプ・電球で見せている内容）。 */
function resultSummary(p: Extract<Props, { mode: "result" }>): string {
  const c = bulbChangeOf(p.quiz, p.result.is_correct, p.easy ? "easy" : p.confidence);
  const head = !p.result.is_correct ? "不正解" : p.confidence === "unsure" ? "正解（あやふや）" : "正解";
  const pts = p.points > 0 ? `、${p.points} ポイント獲得` : "";
  const bulb =
    c.to > c.from ? "電球が明るくなった" : c.to < c.from ? "電球が暗くなった" : `なるほど度は${MASTERY_LABELS[c.to]}`;
  return `${head}${pts}。${bulb}。次の復習は ${c.days} 日後。`;
}

/**
 * /play の画面下に固定する回答バー。
 * 解答前は「自信あり / あやふや」、解答後はバー全体を結果表示（スタンプ・獲得 pt・電球の変化・次へ）に切り替える。
 * 固定バーの裏に本文が隠れないよう、バーと同じ高さの余白を本文の最後に置く。
 */
export function AnswerBar(props: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(120);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const update = () => setHeight(el.offsetHeight);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tone = props.mode === "result" ? toneOf(props.result.is_correct, props.confidence) : "idle";

  return (
    <>
      <div className="answer-bar-spacer" style={{ height: height + 24 }} aria-hidden="true" />
      <div ref={barRef} className={`answer-bar ${tone}`} role="region" aria-label="回答">
        {/* 解答後の結果を読み上げる（領域は常に置いておき、中身だけ差し替える） */}
        <p className="play-visually-hidden" aria-live="polite">
          {props.mode === "result" ? resultSummary(props) : ""}
        </p>
        <div className="answer-bar-inner">
          {props.mode === "reveal" && (
            <div className="answer-bar-reveal">
              <p className="answer-hint">まず自分で答えを考えてから</p>
              <button type="button" className="primary" onClick={props.onReveal}>
                選択肢を表示
                <span className="kbd">Enter</span>
              </button>
            </div>
          )}
          {props.mode === "answer" && (
            <AnswerButtons disabled={props.disabled} onSubmit={props.onSubmit} showKeys />
          )}
          {props.mode !== "result" && props.error && (
            <p className="error answer-bar-error" role="alert">
              {props.error}
            </p>
          )}
          {props.mode === "result" && (
            <div className="answer-bar-result">
              <ResultLabel
                isCorrect={props.result.is_correct}
                confidence={props.confidence}
                points={props.points}
                note={false}
              />
              <BulbChange
                quiz={props.quiz}
                isCorrect={props.result.is_correct}
                confidence={props.easy ? "easy" : props.confidence}
              />
              {props.result.is_correct && props.confidence === "sure" && !props.easy && (
                <EasyButton attemptId={props.result.attempt_id} onDone={props.onEasy} />
              )}
              <button type="button" className="answer-bar-next" onClick={props.onNext}>
                {props.nextLabel}
                <span className="kbd">Enter</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
