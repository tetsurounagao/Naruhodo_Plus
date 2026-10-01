"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiPost } from "../../lib/client";
import { shuffle } from "../../lib/shuffle";
import type { AttemptResult, QuizPublic } from "../../lib/types";
import { Markdown } from "./Markdown";
import { ExplainPopover } from "./ExplainPopover";

interface Answered {
  quiz: QuizPublic;
  result: AttemptResult;
}

/** 設問の Markdown から一覧表示用の 1 行を取り出す（コードブロックは飛ばす）。 */
function firstLine(md: string): string {
  const line = md
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  return line ?? md.slice(0, 80);
}

/** 入力欄にフォーカスがあるときはキーボード操作を奪わない。 */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

/**
 * 連続出題。渡されたクイズを 1 問ずつ出し、最後に結果のまとめを出す。
 * 数字キーで選択、Enter で回答・次へ。
 */
export function QuizSession({ quizzes: initial }: { quizzes: QuizPublic[] }) {
  // 開くたびに選択肢の並びを変える（位置で正解を覚えないように）
  const prepare = (qs: QuizPublic[]) => qs.map((q) => ({ ...q, choices: shuffle(q.choices) }));

  const [quizzes, setQuizzes] = useState(() => prepare(initial));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [answered, setAnswered] = useState<Answered[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quiz = quizzes[index] as QuizPublic | undefined;
  const done = index >= quizzes.length;

  const submit = useCallback(async () => {
    if (!quiz || !selected || result || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiPost<AttemptResult>("/api/attempts", {
        quiz_id: quiz.id,
        user_answer: selected,
      });
      setResult(r);
      setAnswered((prev) => [...prev, { quiz, result: r }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [quiz, selected, result, busy]);

  const next = useCallback(() => {
    setSelected(null);
    setResult(null);
    setError(null);
    setIndex((i) => i + 1);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (done || !quiz || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (result) next();
        else void submit();
        return;
      }
      const n = Number(e.key);
      if (!result && Number.isInteger(n) && n >= 1 && n <= quiz.choices.length) {
        setSelected(quiz.choices[n - 1].id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, quiz, result, next, submit]);

  async function appendToNote(snippet: string) {
    if (!quiz) return;
    const cur = quiz.note ?? "";
    const note = (cur ? cur + "\n\n" : "") + "> " + snippet;
    await apiPost(`/api/quizzes/${quiz.id}`, { note }, "PATCH");
    setQuizzes((qs) => qs.map((q) => (q.id === quiz.id ? { ...q, note } : q)));
  }

  function retryWrong() {
    const wrong = answered.filter((a) => !a.result.is_correct).map((a) => a.quiz);
    setQuizzes(prepare(wrong));
    setAnswered([]);
    setIndex(0);
    setSelected(null);
    setResult(null);
  }

  if (done) {
    const correct = answered.filter((a) => a.result.is_correct).length;
    const wrong = answered.filter((a) => !a.result.is_correct);
    return (
      <div className="card session-summary">
        <p className="session-score">
          {answered.length} 問中 <strong>{correct}</strong> 問正解
        </p>
        {wrong.length > 0 ? (
          <>
            <h2>間違えた問題</h2>
            <ul className="duelist">
              {wrong.map((a) => (
                <li key={a.quiz.id}>
                  <span className="q">{firstLine(a.quiz.question)}</span>
                </li>
              ))}
            </ul>
            <p style={{ marginTop: 12 }}>
              <button className="primary" onClick={retryWrong}>
                間違えた問題だけもう一度
              </button>{" "}
              <Link href="/">ホームへ</Link>
            </p>
          </>
        ) : (
          <p>
            全問正解です。 <Link href="/">ホームへ</Link>
          </p>
        )}
      </div>
    );
  }

  if (!quiz) return null;

  return (
    <div className="card session">
      <div className="session-progress">
        <span>
          {index + 1} / {quizzes.length}
        </span>
        <span className="session-bar">
          <span style={{ width: `${(index / quizzes.length) * 100}%` }} />
        </span>
      </div>

      <div className="md-q">
        <ExplainPopover>
          <Markdown>{quiz.question}</Markdown>
        </ExplainPopover>
      </div>
      <div>
        {quiz.tags.map((t) => (
          <span className="tag" key={t}>
            {t}
          </span>
        ))}
      </div>

      <ul className="choices">
        {quiz.choices.map((c, i) => {
          let cls = "";
          if (result) {
            if (c.id === result.correct_answer) cls = "correct";
            else if (c.id === selected) cls = "wrong";
          } else if (c.id === selected) {
            cls = "selected";
          }
          return (
            <li key={c.id}>
              <button className={cls} disabled={!!result} onClick={() => setSelected(c.id)}>
                <span className="choice-key">{i + 1}</span>
                {c.type === "code" ? (
                  <code className="choice-code">{c.content}</code>
                ) : c.type === "image" ? (
                  <img src={c.content} alt="" />
                ) : (
                  <span>{c.content}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {error && <p className="error">{error}</p>}

      {!result ? (
        <button className="primary" disabled={!selected || busy} onClick={submit}>
          回答する <span className="kbd">Enter</span>
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
          <p style={{ marginTop: 12 }}>
            <button className="primary" onClick={next}>
              {index + 1 < quizzes.length ? "次へ" : "結果を見る"} <span className="kbd">Enter</span>
            </button>
          </p>
        </>
      )}
    </div>
  );
}
