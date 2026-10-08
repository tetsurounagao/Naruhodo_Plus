"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/client";
import type { AttemptResult, Confidence, QuizPublic } from "../../lib/types";
import { shuffle } from "../../lib/shuffle";
import { useRecallFirst } from "../../lib/recall-mode";
import { feedback, useSoundOn } from "../../lib/feedback";
import { notifyAnswered } from "../../lib/daily-goal";
import { Markdown } from "./Markdown";
import { QuizAnnotations } from "./QuizAnnotations";
import { ExplainPopover } from "./ExplainPopover";
import { SourceKnowledgeView } from "./SourceKnowledgeView";
import { ChoiceTiles } from "./ChoiceTiles";
import { AnswerButtons } from "./AnswerButtons";
import { ResultLabel } from "./ResultLabel";
import { BulbChange } from "./BulbChange";
import { EasyButton } from "./EasyButton";
import { ChoiceRationales, PickedRationale } from "./ChoiceRationales";

/**
 * 1 問を解く UI。設問文は呼び出し側（QuizCard）が表示している前提でここでは繰り返さない。
 * 選択肢（/play と同じタイル・1 列）・採点結果・解説・star/メモ/リンクの編集を描画する。
 * 回答ボタンと結果は /play と違って固定バーにせず、カードの中に出す。
 * onAnswered で親（一覧）が回答回数・なるほど電球などをその場で更新できる。
 */
export function QuizRunner({
  quizId,
  onAnswered,
  onClose,
  onFixNoteChange,
}: {
  quizId: string;
  onAnswered?: (quizId: string, result: AttemptResult, confidence: Confidence) => void;
  onClose: () => void;
  /** 「問題がおかしい」フラグの変更を親（カードの表示）に伝える */
  onFixNoteChange?: (fixNote: string | null) => void;
}) {
  const [quiz, setQuiz] = useState<QuizPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [confidence, setConfidence] = useState<Confidence>("sure");
  // 「簡単すぎた」を付けたか
  const [easy, setEasy] = useState(false);
  const sound = useSoundOn();
  const [busy, setBusy] = useState(false);
  const recallFirst = useRecallFirst();
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    apiGet<{ quiz: QuizPublic }>(`/api/quizzes/${quizId}`)
      // 位置で正解を覚えないよう、開くたびに選択肢の並びを変える
      .then((r) => setQuiz({ ...r.quiz, choices: shuffle(r.quiz.choices) }))
      .catch((e: Error) => setError(e.message));
  }, [quizId]);

  async function submit(conf: Confidence) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiPost<AttemptResult>("/api/attempts", {
        quiz_id: quizId,
        user_answer: selected,
        confidence: conf,
      });
      setConfidence(conf);
      setResult(r);
      feedback(!r.is_correct ? "wrong" : conf === "unsure" ? "unsure" : "correct", sound);
      notifyAnswered();
      onAnswered?.(quizId, r, conf);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function appendToNote(snippet: string) {
    const cur = quiz?.note ?? "";
    const next = (cur ? cur + "\n\n" : "") + "> " + snippet;
    await apiPost(`/api/quizzes/${quizId}`, { note: next }, "PATCH");
    setQuiz((q) => (q ? { ...q, note: next } : q));
  }

  if (error) return <p className="error">{error}</p>;
  if (!quiz) return <p className="muted">読み込み中…</p>;

  const showAnnotations = result !== null || quiz.attempt_count > 0;
  const hideChoices = recallFirst && !revealed && !result;

  return (
    <div className="runner">
      {hideChoices ? (
        <div className="recall-prompt">
          <p className="muted">まず自分で答えを考えてから、選択肢を表示してください。</p>
          <button className="primary" onClick={() => setRevealed(true)}>
            選択肢を表示
          </button>
        </div>
      ) : (
        <>
          <ChoiceTiles
            choices={quiz.choices}
            selected={selected}
            result={result}
            onSelect={setSelected}
          />

          {!result && <AnswerButtons disabled={!selected || busy} onSubmit={submit} />}
        </>
      )}

      {result && (
        <>
          <div
            className={`runner-result ${!result.is_correct ? "ng" : confidence === "unsure" ? "unsure" : "ok"}`}
            aria-live="polite"
          >
            <ResultLabel isCorrect={result.is_correct} confidence={confidence} />
            <BulbChange
              quiz={quiz}
              isCorrect={result.is_correct}
              confidence={easy ? "easy" : confidence}
              size={18}
            />
            {result.is_correct && confidence === "sure" && !easy && (
              <EasyButton attemptId={result.attempt_id} onDone={() => setEasy(true)} />
            )}
          </div>
          <PickedRationale choices={quiz.choices} selected={selected} result={result} />
          {result.explanation && (
            <div className="sticky answer-note">
              <p className="answer-note-head">解説</p>
              <ExplainPopover showInput onAddToNote={appendToNote}>
                <Markdown>{result.explanation}</Markdown>
              </ExplainPopover>
            </div>
          )}
          <div className="answer-rows">
            <ChoiceRationales choices={quiz.choices} selected={selected} result={result} />
            <SourceKnowledgeView knowledge={result.source_knowledge} />
          </div>
        </>
      )}

      {showAnnotations && (
        <QuizAnnotations
          key={`annot-${quiz.note ?? ""}`}
          quizId={quiz.id}
          initialNote={quiz.note}
          initialLinks={quiz.links}
          initialTags={quiz.tags}
          initialHidden={quiz.hidden}
          initialFixNote={quiz.fix_note}
          onFixNoteChange={(v) => {
            setQuiz((q) => (q ? { ...q, fix_note: v } : q));
            onFixNoteChange?.(v);
          }}
        />
      )}

      <p style={{ marginTop: 12 }}>
        <button onClick={onClose}>閉じる</button>
      </p>
    </div>
  );
}
