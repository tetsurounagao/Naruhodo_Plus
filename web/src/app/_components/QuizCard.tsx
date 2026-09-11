"use client";

import { useState } from "react";
import { apiPost } from "../../lib/client";
import type { AttemptResult, QuizPublic } from "../../lib/types";
import { Markdown } from "./Markdown";
import { Stars } from "./Stars";
import { Tag } from "./Tag";
import { QuizRunner } from "./QuizRunner";
import { QuizAnnotations } from "./QuizAnnotations";
import { ExplainPopover } from "./ExplainPopover";

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
  onChanged,
  onClosed,
  extraMeta,
  annotationsToggle = false,
}: {
  quiz: QuizPublic;
  onAnswered?: (quizId: string, result: AttemptResult) => void;
  onChanged?: (quizId: string) => void;
  /** 解答後、QuizRunner の「閉じる」が押されたときに呼ばれる（採点結果を見せ終えたタイミング）。 */
  onClosed?: (quizId: string) => void;
  extraMeta?: string;
  annotationsToggle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [star, setStar] = useState(quiz.star);
  const [tags, setTags] = useState<string[]>(quiz.tags);

  async function saveStar(v: number) {
    const prev = star;
    setStar(v);
    try {
      await apiPost(`/api/quizzes/${quiz.id}`, { star: v }, "PATCH");
    } catch {
      setStar(prev);
    }
  }

  return (
    <div className="card">
      <div className="md-q">
        <ExplainPopover>
          <Markdown>{quiz.question}</Markdown>
        </ExplainPopover>
      </div>
      <div>
        {tags.map((t) => (
          <Tag name={t} key={t} />
        ))}
      </div>

      <div className="quizmeta">
        <Stars value={star} onChange={saveStar} size={16} />
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
          onClose={() => {
            setOpen(false);
            onClosed?.(quiz.id);
          }}
        />
      ) : (
        <button className="primary" onClick={() => setOpen(true)}>
          解く
        </button>
      )}

      {annotationsToggle && !open && (
        <details style={{ marginTop: 10 }}>
          <summary className="muted" style={{ cursor: "pointer" }}>
            メモ・タグ・参考リンク
          </summary>
          <QuizAnnotations
            quizId={quiz.id}
            initialNote={quiz.note}
            initialLinks={quiz.links}
            initialTags={tags}
            onTagsChange={setTags}
            initialHidden={quiz.hidden}
            onHiddenChange={() => onChanged?.(quiz.id)}
          />
        </details>
      )}
    </div>
  );
}
