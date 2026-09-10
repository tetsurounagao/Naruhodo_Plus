"use client";

import { useState } from "react";
import type { AttemptResult, QuizPublic } from "../../lib/types";
import { Markdown } from "./Markdown";
import { Stars } from "./Stars";
import { QuizRunner } from "./QuizRunner";
import { QuizAnnotations } from "./QuizAnnotations";

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

/**
 * 一覧（/quizzes・/search・/review）で使うクイズカード。
 * 「解く」で QuizRunner をその場に展開。annotationsToggle=true でメモ・リンクの
 * 折りたたみも出す（/search 用）。
 */
export function QuizCard({
  quiz,
  onAnswered,
  extraMeta,
  annotationsToggle = false,
}: {
  quiz: QuizPublic;
  onAnswered?: (quizId: string, result: AttemptResult) => void;
  extraMeta?: string;
  annotationsToggle?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card">
      <div className="md-q">
        <Markdown>{quiz.question}</Markdown>
      </div>
      <div>
        {quiz.tags.map((t) => (
          <span className="tag" key={t}>
            {t}
          </span>
        ))}
      </div>

      <div className="quizmeta">
        <Stars value={quiz.star} size={14} />
        <span>解答 {quiz.attempt_count} 回</span>
        {quiz.last_correct !== null && (
          <span>前回 {quiz.last_correct ? "正解" : "不正解"}</span>
        )}
        {fmtDate(quiz.last_answered_at) && (
          <span>最終 {fmtDate(quiz.last_answered_at)}</span>
        )}
        {extraMeta && <span>{extraMeta}</span>}
        {quiz.created_by && <span>by {quiz.created_by}</span>}
      </div>

      {open ? (
        <QuizRunner
          quizId={quiz.id}
          onAnswered={onAnswered}
          onClose={() => setOpen(false)}
        />
      ) : (
        <button className="primary" onClick={() => setOpen(true)}>
          解く
        </button>
      )}

      {annotationsToggle && !open && (
        <details style={{ marginTop: 10 }}>
          <summary className="muted" style={{ cursor: "pointer" }}>
            メモ・参考リンク
          </summary>
          <QuizAnnotations
            quizId={quiz.id}
            initialStar={quiz.star}
            initialNote={quiz.note}
            initialLinks={quiz.links}
          />
        </details>
      )}
    </div>
  );
}
