"use client";

import { useEffect, useState } from "react";
import { apiPost } from "../../lib/client";
import { MASTERY_LABELS, masteryOf, nextStreak } from "../../lib/mastery";
import type { AttemptResult, Confidence, QuizPublic } from "../../lib/types";
import { Markdown } from "./Markdown";
import { Stars } from "./Stars";
import { Tag } from "./Tag";
import { QuizRunner } from "./QuizRunner";
import { QuizAnnotations } from "./QuizAnnotations";
import { ExplainPopover } from "./ExplainPopover";
import { CopyPromptButton } from "./CopyPromptButton";
import { Bulb } from "./Bulb";
import { rephraseQuizPrompt } from "../../lib/quiz-prompts";

/** この回数以上解いていて前回正解なら「言い換えた問題を依頼」を出す */
const REPHRASE_MIN_ATTEMPTS = 3;

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
  const [fixNote, setFixNote] = useState<string | null>(quiz.fix_note);
  // なるほど電球の元（自信ありの連続正解回数）。解いたらその場で更新する
  const [streak, setStreak] = useState(quiz.correct_streak);
  const [brightened, setBrightened] = useState(false);

  // 親が一覧を取り直して新しい値が来たら合わせる
  useEffect(() => {
    setStreak(quiz.correct_streak);
    setBrightened(false);
  }, [quiz.correct_streak]);

  function handleAnswered(quizId: string, result: AttemptResult, confidence: Confidence) {
    const next = nextStreak(streak, result.is_correct, confidence);
    setBrightened(masteryOf(next) > masteryOf(streak));
    setStreak(next);
    onAnswered?.(quizId, result);
  }

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
        <span className="quizmeta-bulb">
          <Bulb level={masteryOf(streak)} size={18} brightened={brightened} />
          {/* 読み上げは電球の aria-label（なるほど度: …）で足りるので、文字は見た目だけ */}
          <span aria-hidden="true">{MASTERY_LABELS[masteryOf(streak)]}</span>
        </span>
        <Stars value={star} onChange={saveStar} size={16} />
        {fixNote !== null && (
          <span className="fix-badge" title={fixNote}>
            要修正
          </span>
        )}
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
          onAnswered={handleAnswered}
          onFixNoteChange={setFixNote}
          onClose={() => {
            setOpen(false);
            onClosed?.(quiz.id);
          }}
        />
      ) : (
        <div className="card-actions">
          <button className="primary" onClick={() => setOpen(true)}>
            解く
          </button>
          {/* 問題の形を覚えただけになっていないか、別の問い方で確かめる */}
          {quiz.attempt_count >= REPHRASE_MIN_ATTEMPTS && quiz.last_correct === true && (
            <CopyPromptButton
              text={() => rephraseQuizPrompt({ ...quiz, tags })}
              label="言い換えた問題を依頼（プロンプトをコピー）"
            />
          )}
        </div>
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
            initialFixNote={fixNote}
            onFixNoteChange={setFixNote}
          />
        </details>
      )}
    </div>
  );
}
