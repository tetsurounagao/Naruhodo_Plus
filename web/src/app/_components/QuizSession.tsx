"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiPost } from "../../lib/client";
import { shuffle } from "../../lib/shuffle";
import { useRecallFirst } from "../../lib/recall-mode";
import type { AttemptResult, Confidence, QuizPublic } from "../../lib/types";
import { Markdown } from "./Markdown";
import { ExplainPopover } from "./ExplainPopover";
import { SourceKnowledgeView } from "./SourceKnowledgeView";
import { AnswerButtons } from "./AnswerButtons";
import { ResultLabel } from "./ResultLabel";

interface Answered {
  quiz: QuizPublic;
  result: AttemptResult;
  confidence: Confidence;
}

/** もう一度解くべき問題か（不正解、または あやふやで正解）。 */
function needsRetry(a: Answered): boolean {
  return !a.result.is_correct || a.confidence === "unsure";
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
  if (el.tagName === "INPUT") {
    // チェックボックス等は文字入力ではないのでキー操作を通す
    const type = (el as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit"].includes(type);
  }
  return el.tagName === "TEXTAREA" || el.isContentEditable;
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
  const recallFirst = useRecallFirst();
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quiz = quizzes[index] as QuizPublic | undefined;
  const done = index >= quizzes.length;
  const hideChoices = recallFirst && !revealed && !result;

  const submit = useCallback(async (confidence: Confidence) => {
    if (!quiz || !selected || result || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiPost<AttemptResult>("/api/attempts", {
        quiz_id: quiz.id,
        user_answer: selected,
        confidence,
      });
      setResult(r);
      setAnswered((prev) => [...prev, { quiz, result: r, confidence }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [quiz, selected, result, busy]);

  const next = useCallback(() => {
    setSelected(null);
    setResult(null);
    setRevealed(false);
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
        else if (hideChoices) setRevealed(true);
        else void submit(e.shiftKey ? "unsure" : "sure");
        return;
      }
      const n = Number(e.key);
      if (!result && !hideChoices && Number.isInteger(n) && n >= 1 && n <= quiz.choices.length) {
        setSelected(quiz.choices[n - 1].id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, quiz, result, hideChoices, next, submit]);

  async function appendToNote(snippet: string) {
    if (!quiz) return;
    const cur = quiz.note ?? "";
    const note = (cur ? cur + "\n\n" : "") + "> " + snippet;
    await apiPost(`/api/quizzes/${quiz.id}`, { note }, "PATCH");
    setQuizzes((qs) => qs.map((q) => (q.id === quiz.id ? { ...q, note } : q)));
  }

  function retryWrong() {
    const retry = answered.filter(needsRetry).map((a) => a.quiz);
    setQuizzes(prepare(retry));
    setAnswered([]);
    setIndex(0);
    setSelected(null);
    setResult(null);
    setRevealed(false);
  }

  if (done) {
    const correct = answered.filter((a) => a.result.is_correct).length;
    const wrong = answered.filter((a) => !a.result.is_correct);
    const unsure = answered.filter((a) => a.result.is_correct && a.confidence === "unsure");
    const list = (title: string, items: Answered[]) =>
      items.length > 0 && (
        <>
          <h2>{title}</h2>
          <ul className="duelist">
            {items.map((a) => (
              <li key={a.quiz.id}>
                <span className="q">{firstLine(a.quiz.question)}</span>
              </li>
            ))}
          </ul>
        </>
      );
    return (
      <div className="card session-summary">
        <p className="session-score">
          {answered.length} 問中 <strong>{correct}</strong> 問正解
          {unsure.length > 0 && <span className="muted">（うち あやふや {unsure.length} 問）</span>}
        </p>
        {wrong.length + unsure.length > 0 ? (
          <>
            {list("間違えた問題", wrong)}
            {list("あやふやだった問題", unsure)}
            <p style={{ marginTop: 12 }}>
              <button className="primary" onClick={retryWrong}>
                間違えた・あやふやだった問題をもう一度
              </button>{" "}
              <Link href="/">ホームへ</Link>
            </p>
          </>
        ) : (
          <p>
            全問 自信ありで正解です。 <Link href="/">ホームへ</Link>
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

      {hideChoices ? (
        <div className="recall-prompt">
          <p className="muted">まず自分で答えを考えてから、選択肢を表示してください。</p>
          <button className="primary" onClick={() => setRevealed(true)}>
            選択肢を表示 <span className="kbd">Enter</span>
          </button>
        </div>
      ) : (
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
      )}

      {error && <p className="error">{error}</p>}

      {hideChoices ? null : !result ? (
        <AnswerButtons disabled={!selected || busy} onSubmit={submit} showKeys />
      ) : (
        <>
          <ResultLabel
            isCorrect={result.is_correct}
            confidence={answered[answered.length - 1]?.confidence ?? "sure"}
          />
          {result.explanation && (
            <ExplainPopover showInput onAddToNote={appendToNote}>
              <Markdown>{result.explanation}</Markdown>
            </ExplainPopover>
          )}
          <SourceKnowledgeView knowledge={result.source_knowledge} />
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
