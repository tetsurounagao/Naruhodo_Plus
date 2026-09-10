"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/client";
import type { AttemptResult, QuizPublic } from "../../lib/types";
import { Markdown } from "./Markdown";
import { QuizAnnotations } from "./QuizAnnotations";
import { ExplainPopover } from "./ExplainPopover";

/**
 * 1 問を解く UI。設問文は呼び出し側（QuizCard）が表示している前提でここでは繰り返さない。
 * 選択肢・採点結果・解説・star/メモ/リンクの編集を描画する。
 * onAnswered で親（一覧）が回答回数などをその場で更新できる。
 */
export function QuizRunner({
  quizId,
  onAnswered,
  onClose,
}: {
  quizId: string;
  onAnswered?: (quizId: string, result: AttemptResult) => void;
  onClose: () => void;
}) {
  const [quiz, setQuiz] = useState<QuizPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet<{ quiz: QuizPublic }>(`/api/quizzes/${quizId}`)
      .then((r) => setQuiz(r.quiz))
      .catch((e: Error) => setError(e.message));
  }, [quizId]);

  async function submit() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiPost<AttemptResult>("/api/attempts", {
        quiz_id: quizId,
        user_answer: selected,
      });
      setResult(r);
      onAnswered?.(quizId, r);
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

  return (
    <div>
      <ul className="choices">
        {quiz.choices.map((c) => {
          let cls = "";
          if (result) {
            if (c.id === result.correct_answer) cls = "correct";
            else if (c.id === selected) cls = "wrong";
          } else if (c.id === selected) {
            cls = "selected";
          }
          return (
            <li key={c.id}>
              <button
                className={cls}
                disabled={!!result}
                onClick={() => setSelected(c.id)}
              >
                {c.type === "code" ? (
                  <code className="choice-code">{c.content}</code>
                ) : c.type === "image" ? (
                  <img src={c.content} alt="" />
                ) : (
                  c.content
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {!result ? (
        <button className="primary" disabled={!selected || busy} onClick={submit}>
          回答する
        </button>
      ) : (
        <>
          <p className={result.is_correct ? "result-ok" : "result-ng"}>
            {result.is_correct ? "正解" : "不正解"}
          </p>
          {result.explanation && (
            <ExplainPopover showInput onAddToNote={appendToNote}>
              <Markdown>{result.explanation}</Markdown>
            </ExplainPopover>
          )}
        </>
      )}

      {showAnnotations && (
        <QuizAnnotations
          key={`annot-${quiz.note ?? ""}`}
          quizId={quiz.id}
          initialNote={quiz.note}
          initialLinks={quiz.links}
          initialTags={quiz.tags}
        />
      )}

      <p style={{ marginTop: 12 }}>
        <button onClick={onClose}>閉じる</button>
      </p>
    </div>
  );
}
