"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "../../lib/client";
import { shuffle } from "../../lib/shuffle";
import { useRecallFirst } from "../../lib/recall-mode";
import type { AttemptResult, Confidence, QuizPublic } from "../../lib/types";
import { Markdown } from "./Markdown";
import { ExplainPopover } from "./ExplainPopover";
import { SourceKnowledgeView } from "./SourceKnowledgeView";
import { AnswerButtons } from "./AnswerButtons";
import { ResultLabel } from "./ResultLabel";
import { ChoiceRationales, PickedRationale } from "./ChoiceRationales";
import { Confetti } from "./Confetti";
import { SessionSummary } from "./SessionSummary";
import { feedback, useSoundOn } from "../../lib/feedback";
import { comboTier, scoreTurn } from "../../lib/quiz-score";
import { countByLocalDate, localDateKey } from "../../lib/streak";

export interface Answered {
  quiz: QuizPublic;
  result: AttemptResult;
  confidence: Confidence;
  points: number;
}

/** もう一度解くべき問題か（不正解、または あやふやで正解）。 */
function needsRetry(a: Answered): boolean {
  return !a.result.is_correct || a.confidence === "unsure";
}

/** 進捗バーの 1 マスの色分け。 */
function outcomeOf(a: Answered): "ok" | "unsure" | "ng" {
  if (!a.result.is_correct) return "ng";
  return a.confidence === "unsure" ? "unsure" : "ok";
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
  const sound = useSoundOn();
  // スコア・コンボ（ブラウザ内のみ。DB には保存しない）
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  // コンボ表示の演出を再生し直すためのキー
  const [comboPulse, setComboPulse] = useState(0);
  const [comboBroken, setComboBroken] = useState(false);
  const [burst, setBurst] = useState(0);
  const comboRef = useRef(0);
  // 開始時点で今日すでに解いていた数（まとめ画面の「今日の分クリア！」判定用）
  const [todayBefore, setTodayBefore] = useState<number | null>(null);

  useEffect(() => {
    apiGet<{ timestamps: string[] }>("/api/activity?kind=answers&days=2")
      .then((r) => setTodayBefore(countByLocalDate(r.timestamps)[localDateKey(new Date())] ?? 0))
      .catch(() => {});
  }, []);

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
      const turn = scoreTurn(r.is_correct, confidence, comboRef.current);
      comboRef.current = turn.combo;
      setResult(r);
      setAnswered((prev) => [...prev, { quiz, result: r, confidence, points: turn.points }]);
      setScore((s) => s + turn.points);
      setCombo(turn.combo);
      setMaxCombo((m) => Math.max(m, turn.combo));
      setComboBroken(turn.comboBroken);
      if (turn.combo >= 2 && r.is_correct && confidence === "sure") setComboPulse((n) => n + 1);
      // コンボの節目（5, 10, …）は紙吹雪と派手な音
      const milestone = turn.combo >= 5 && turn.combo % 5 === 0 && confidence === "sure" && r.is_correct;
      if (milestone) setBurst((n) => n + 1);
      feedback(
        milestone ? "combo" : !r.is_correct ? "wrong" : confidence === "unsure" ? "unsure" : "correct",
        sound,
        turn.combo,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [quiz, selected, result, busy, sound]);

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
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setComboBroken(false);
    comboRef.current = 0;
    setIndex(0);
    setSelected(null);
    setResult(null);
    setRevealed(false);
  }

  if (done) {
    return (
      <SessionSummary
        answered={answered}
        score={score}
        maxCombo={maxCombo}
        sound={sound}
        todayBefore={todayBefore}
        onRetry={answered.some(needsRetry) ? retryWrong : undefined}
      />
    );
  }

  if (!quiz) return null;

  return (
    <div className="card session">
      {burst > 0 && <Confetti key={burst} count={40} />}
      <div className="session-hud">
        <span className="hud-count">
          {index + 1} / {quizzes.length}
        </span>
        <span className="session-segments" aria-hidden>
          {quizzes.map((q, i) => (
            <span
              key={q.id + i}
              className={
                i < answered.length
                  ? `seg ${outcomeOf(answered[i])}`
                  : i === index
                    ? "seg current"
                    : "seg"
              }
            />
          ))}
        </span>
        <span className="hud-score" key={score}>
          {score} pt
        </span>
      </div>
      {combo >= 2 ? (
        <div key={comboPulse} className={`combo-badge tier-${comboTier(combo)}`}>
          {comboTier(combo) >= 3 ? "⚡" : "🔥"} {combo} COMBO
        </div>
      ) : comboBroken && result ? (
        <div className="combo-broken">コンボが途切れた…</div>
      ) : null}

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
            points={answered[answered.length - 1]?.points}
          />
          <PickedRationale choices={quiz.choices} selected={selected} result={result} />
          {result.explanation && (
            <ExplainPopover showInput onAddToNote={appendToNote}>
              <Markdown>{result.explanation}</Markdown>
            </ExplainPopover>
          )}
          <ChoiceRationales choices={quiz.choices} selected={selected} result={result} />
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
