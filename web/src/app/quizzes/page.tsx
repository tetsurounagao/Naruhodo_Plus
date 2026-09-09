"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/client";
import type { AttemptResult, QuizPublic } from "../../lib/types";

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState<QuizPublic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyUnanswered, setOnlyUnanswered] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(() => {
    setQuizzes(null);
    apiGet<{ quizzes: QuizPublic[] }>(
      `/api/quizzes${onlyUnanswered ? "?unanswered=1" : ""}`,
    )
      .then((r) => setQuizzes(r.quizzes))
      .catch((e: Error) => setError(e.message));
  }, [onlyUnanswered]);

  useEffect(load, [load]);

  return (
    <>
      <h1>クイズ</h1>
      {error && <p className="error">{error}</p>}

      <label style={{ fontWeight: 400 }}>
        <input
          type="checkbox"
          style={{ width: "auto", marginRight: 8 }}
          checked={onlyUnanswered}
          onChange={(e) => {
            setActiveId(null);
            setOnlyUnanswered(e.target.checked);
          }}
        />
        未解答のみ表示
      </label>

      {quizzes === null ? (
        <p className="muted">読み込み中…</p>
      ) : quizzes.length === 0 ? (
        <p className="muted">
          対象のクイズがありません。「未出題の学び」からクイズ生成を依頼してください。
        </p>
      ) : (
        quizzes.map((q) =>
          activeId === q.id ? (
            <QuizRunner
              key={q.id}
              id={q.id}
              onDone={() => {
                setActiveId(null);
                load();
              }}
            />
          ) : (
            <div className="card" key={q.id}>
              <p style={{ fontWeight: 600 }}>{q.question}</p>
              <div>
                {q.tags.map((t) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                解答 {q.attempt_count} 回
                {q.last_correct === null
                  ? ""
                  : ` / 前回 ${q.last_correct ? "正解" : "不正解"}`}
                {q.created_by ? ` / by ${q.created_by}` : ""}
              </p>
              <button className="primary" onClick={() => setActiveId(q.id)}>
                解く
              </button>
            </div>
          ),
        )
      )}
    </>
  );
}

function QuizRunner({ id, onDone }: { id: string; onDone: () => void }) {
  const [quiz, setQuiz] = useState<QuizPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet<{ quiz: QuizPublic }>(`/api/quizzes/${id}`)
      .then((r) => setQuiz(r.quiz))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  async function submit() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiPost<AttemptResult>("/api/attempts", {
        quiz_id: id,
        user_answer: selected,
      });
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!quiz) return <p className="muted">読み込み中…</p>;

  return (
    <div className="card">
      <p style={{ fontWeight: 600 }}>{quiz.question}</p>
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
                {c.content}
              </button>
            </li>
          );
        })}
      </ul>

      {!result ? (
        <button
          className="primary"
          disabled={!selected || busy}
          onClick={submit}
        >
          回答する
        </button>
      ) : (
        <>
          <p className={result.is_correct ? "result-ok" : "result-ng"}>
            {result.is_correct ? "正解" : "不正解"}
          </p>
          {result.explanation && <p>{result.explanation}</p>}
          <button onClick={onDone}>一覧に戻る</button>
        </>
      )}
    </div>
  );
}
