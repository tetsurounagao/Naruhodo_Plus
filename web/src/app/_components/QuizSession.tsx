"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost } from "../../lib/client";
import { shuffle } from "../../lib/shuffle";
import { useRecallFirst } from "../../lib/recall-mode";
import { MASTERY_LABELS, masteryOf, nextStreak } from "../../lib/mastery";
import { daysBetween, nextInterval } from "../../lib/review-schedule";
import type { AttemptResult, Confidence, QuizPublic } from "../../lib/types";
import { Markdown } from "./Markdown";
import { ExplainPopover } from "./ExplainPopover";
import { SourceKnowledgeView } from "./SourceKnowledgeView";
import { ChoiceRationales, PickedRationale } from "./ChoiceRationales";
import { ChoiceTiles, fitsTwoColumns } from "./ChoiceTiles";
import { AnswerBar } from "./AnswerBar";
import { PlaySettings } from "./PlaySettings";
import { Bulb } from "./Bulb";
import { bulbChangeOf } from "./BulbChange";
import { CloseIcon, FlameIcon } from "./PlayIcons";
import { Confetti } from "./Confetti";
import { SessionSummary } from "./SessionSummary";
import { WithdrawPanel } from "./WithdrawPanel";
import { JackpotOverlay } from "./JackpotOverlay";

/** 何問連続で正解したら「大当たり」か、そのときのボーナス点 */
const JACKPOT_COMBO = 10;
const JACKPOT_BONUS = 100;
import { feedback, useSoundOn } from "../../lib/feedback";
import { comboTier, scoreTurn } from "../../lib/quiz-score";
import { countByLocalDate, localDateKey } from "../../lib/streak";
import { notifyAnswered } from "../../lib/daily-goal";

export interface Answered {
  quiz: QuizPublic;
  result: AttemptResult;
  confidence: Confidence;
  points: number;
  /** この解答の直前のコンボと最大コンボ（解答後に取り下げたとき元に戻すため） */
  comboBefore: number;
  maxComboBefore: number;
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
 * 数字キーで選択、Enter で回答・次へ。回答ボタンと結果は画面下の固定バー（AnswerBar）に出す。
 * 精度の悪い問題は「取り下げ」でき、そのときは reserve（予備）から 1 問を最後に足す。
 */
export function QuizSession({
  quizzes: initial,
  reserve: initialReserve = [],
  reserveFresh: initialReserveFresh = [],
}: {
  quizzes: QuizPublic[];
  /** 取り下げたときに足す予備の問題（出題順） */
  reserve?: QuizPublic[];
  /**
   * 新しい問題の予備（今日のタームのみ）。解く前に新しい問題を取り下げたらここから足し、
   * タームの「新しい問題 N 問」を保つ（解く前の取り下げは 1 日の枠を使わないため）。
   */
  reserveFresh?: QuizPublic[];
}) {
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
  // 10 問連続正解の「大当たり」演出を出しているか
  const [jackpot, setJackpot] = useState(false);
  const closeJackpot = useCallback(() => setJackpot(false), []);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  // 取り下げ
  const [reserve, setReserve] = useState(initialReserve);
  const [reserveFresh, setReserveFresh] = useState(initialReserveFresh);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawn, setWithdrawn] = useState(0);
  // 今の問題に「簡単すぎた」を付けたか
  const [easy, setEasy] = useState(false);
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
  const last = answered[answered.length - 1];

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
      notifyAnswered();
      const comboBefore = comboRef.current;
      const maxComboBefore = maxComboRef.current;
      const turn = scoreTurn(r.is_correct, confidence, comboBefore);
      const solid = confidence === "sure" && r.is_correct;
      const jackpotHit = solid && turn.combo === JACKPOT_COMBO;
      // 大当たりのボーナスはこの問題の得点に足す（解いた後に取り下げたら一緒に外れる）
      if (jackpotHit) turn.points += JACKPOT_BONUS;
      // 貯めたポイントは神殿の木に捧げられる（#93）。記録に失敗しても解答の流れは止めない
      if (turn.points > 0) {
        apiPost("/api/points", { attempt_id: r.attempt_id, points: turn.points }).catch((e: Error) =>
          console.warn("[points] 記録に失敗:", e.message),
        );
      }
      comboRef.current = turn.combo;
      maxComboRef.current = Math.max(maxComboBefore, turn.combo);
      setResult(r);
      setAnswered((prev) => [
        ...prev,
        { quiz, result: r, confidence, points: turn.points, comboBefore, maxComboBefore },
      ]);
      setScore((s) => s + turn.points);
      setCombo(turn.combo);
      setMaxCombo(maxComboRef.current);
      setComboBroken(turn.comboBroken);
      if (turn.combo >= 2 && r.is_correct && confidence === "sure") setComboPulse((n) => n + 1);
      // コンボの節目（5, 10, …）は紙吹雪と派手な音
      const milestone = solid && !jackpotHit && turn.combo >= 5 && turn.combo % 5 === 0;
      if (milestone) setBurst((n) => n + 1);
      if (jackpotHit) setJackpot(true);
      feedback(
        jackpotHit
          ? "jackpot"
          : milestone
            ? "combo"
            : !r.is_correct
              ? "wrong"
              : confidence === "unsure"
                ? "unsure"
                : "correct",
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
    setWithdrawing(false);
    setEasy(false);
    setIndex((i) => i + 1);
    window.scrollTo({ top: 0 });
  }, []);

  /**
   * 今の問題を取り下げる。「問題がおかしい」に回し、このセッションから外して予備から 1 問足す。
   * 解答後に取り下げたときは、その問題の得点・コンボをセッションの結果から外す
   * （解答履歴は DB に残る）。
   */
  async function withdraw(reason: string) {
    if (!quiz) return;
    setWithdrawBusy(true);
    setError(null);
    try {
      await apiPost(`/api/quizzes/${quiz.id}`, { fix_note: reason }, "PATCH");
    } catch (e) {
      setError((e as Error).message);
      setWithdrawBusy(false);
      return;
    }
    if (result && last && last.quiz.id === quiz.id) {
      comboRef.current = last.comboBefore;
      maxComboRef.current = last.maxComboBefore;
      setAnswered((prev) => prev.slice(0, -1));
      setScore((s) => s - last.points);
      if (last.points > 0) {
        apiPost(`/api/points/${last.result.attempt_id}`, null, "DELETE").catch((e: Error) =>
          console.warn("[points] 取り消しに失敗:", e.message),
        );
      }
      setCombo(last.comboBefore);
      setMaxCombo(last.maxComboBefore);
      setComboBroken(false);
    }
    // 解く前に取り下げた新しい問題 → 新しい問題の予備から。それ以外（復習・解いた後）→ 復習の予備から。
    // 片方が尽きたらもう片方から足す
    const freshFirst = !result && quiz.attempt_count === 0;
    const primary = freshFirst ? reserveFresh : reserve;
    const secondary = freshFirst ? reserve : reserveFresh;
    const fromPrimary = primary.length > 0;
    const replacement = fromPrimary ? primary[0] : secondary[0];
    if (replacement) {
      const takeFresh = fromPrimary === freshFirst;
      if (takeFresh) setReserveFresh((r) => r.slice(1));
      else setReserve((r) => r.slice(1));
    }
    setQuizzes((qs) => {
      const without = qs.filter((_, i) => i !== index);
      return replacement ? [...without, ...prepare([replacement])] : without;
    });
    // index はそのまま（次の問題が同じ位置に繰り上がる）
    setSelected(null);
    setResult(null);
    setRevealed(false);
    setWithdrawing(false);
    setWithdrawBusy(false);
    setEasy(false);
    setWithdrawn((n) => n + 1);
    window.scrollTo({ top: 0 });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (done || !quiz || withdrawing || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
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
  }, [done, quiz, result, hideChoices, withdrawing, next, submit]);

  async function appendToNote(snippet: string) {
    if (!quiz) return;
    const cur = quiz.note ?? "";
    const note = (cur ? cur + "\n\n" : "") + "> " + snippet;
    await apiPost(`/api/quizzes/${quiz.id}`, { note }, "PATCH");
    setQuizzes((qs) => qs.map((q) => (q.id === quiz.id ? { ...q, note } : q)));
  }

  function retryWrong() {
    // 電球の段階が今回の解答のぶん変わっているので、連続正解回数を更新してから出し直す
    const now = Date.now();
    const retry = answered.filter(needsRetry).map((a) => ({
      ...a.quiz,
      correct_streak: nextStreak(a.quiz.correct_streak, a.result.is_correct, a.confidence),
      interval_days: nextInterval(
        a.quiz.interval_days,
        a.quiz.last_answered_at ? daysBetween(a.quiz.last_answered_at, now) : 0,
        a.result.is_correct,
        a.confidence,
      ),
      last_answered_at: new Date(now).toISOString(),
    }));
    setQuizzes(prepare(retry));
    setAnswered([]);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setComboBroken(false);
    comboRef.current = 0;
    maxComboRef.current = 0;
    setEasy(false);
    setIndex(0);
    setSelected(null);
    setResult(null);
    setRevealed(false);
  }

  if (done) {
    if (answered.length === 0) {
      return (
        <div className="card session-summary">
          <p>出題できる問題がなくなりました（取り下げ {withdrawn} 問）。</p>
          <p>
            <Link href="/">ホームへ</Link>
          </p>
        </div>
      );
    }
    return (
      <SessionSummary
        answered={answered}
        score={score}
        maxCombo={maxCombo}
        sound={sound}
        todayBefore={todayBefore}
        withdrawn={withdrawn}
        onRetry={answered.some(needsRetry) ? retryWrong : undefined}
      />
    );
  }

  if (!quiz) return null;

  // 問題カードの電球: 解答後は新しい段階を出し、明るくなったら「明るくなった」を添える
  const change =
    result && last ? bulbChangeOf(quiz, result.is_correct, easy ? "easy" : last.confidence) : null;
  const level = change ? change.to : masteryOf(quiz.correct_streak);
  const brightened = !!change && change.to > change.from;

  const hasRationales = !!result && quiz.choices.some((c) => result.rationales?.[c.id]);
  const hasSource = !!result?.source_knowledge;
  const hasRows = hasRationales || hasSource;

  return (
    <div className="play">
      {burst > 0 && <Confetti key={burst} count={40} />}
      {jackpot && <JackpotOverlay bonus={JACKPOT_BONUS} onClose={closeJackpot} />}

      <div className="play-topbar">
        <Link href="/" className="play-icon-link" aria-label="やめる">
          <CloseIcon />
        </Link>
        <div
          className="play-progress"
          role="progressbar"
          aria-label="進み具合"
          aria-valuemin={0}
          aria-valuemax={quizzes.length}
          aria-valuenow={answered.length}
          aria-valuetext={`${quizzes.length} 問中 ${index + 1} 問目`}
        >
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
        </div>
        {combo >= 2 ? (
          <div className="play-combo-slot">
            <span key={comboPulse} className={`combo-badge play-combo tier-${comboTier(combo)}`}>
              <FlameIcon size={comboTier(combo) >= 2 ? 18 : 16} />
              {combo} コンボ
            </span>
          </div>
        ) : comboBroken && result ? (
          <div className="play-combo-slot">
            <span className="combo-broken">コンボが途切れた…</span>
          </div>
        ) : null}
        <span className="play-score" key={score}>
          {score} pt
        </span>
        <PlaySettings />
      </div>

      <section className="card play-question" aria-label={`${index + 1} 問目`}>
        <div className="play-question-meta">
          <Bulb level={level} size={26} brightened={brightened} />
          {brightened ? (
            <span className="mastery-chip up">明るくなった</span>
          ) : (
            <span className="mastery-label" aria-hidden="true">
              {MASTERY_LABELS[level]}
            </span>
          )}
          <span className="play-question-tags">
            {quiz.tags.map((t) => (
              <span className="tag" key={t}>
                {t}
              </span>
            ))}
          </span>
          {!withdrawing && (
            <button
              type="button"
              className="withdraw-trigger"
              onClick={() => setWithdrawing(true)}
              title="精度の悪い問題を取り下げて、代わりの問題を足す"
            >
              取り下げる
            </button>
          )}
        </div>
        {withdrawing && (
          <WithdrawPanel
            busy={withdrawBusy}
            onWithdraw={(reason) => void withdraw(reason)}
            onCancel={() => setWithdrawing(false)}
          />
        )}
        <div className="md-q">
          <ExplainPopover>
            <Markdown>{quiz.question}</Markdown>
          </ExplainPopover>
        </div>
      </section>

      {hideChoices ? (
        <div className="recall-prompt">
          <p className="muted">まず自分で答えを考えてから、選択肢を表示してください。</p>
        </div>
      ) : (
        <ChoiceTiles
          choices={quiz.choices}
          selected={selected}
          result={result}
          onSelect={setSelected}
          twoColumns={fitsTwoColumns(quiz.choices)}
        />
      )}

      {result && (
        <div className="answer-after">
          <PickedRationale choices={quiz.choices} selected={selected} result={result} />
          <div className={`answer-after-grid${result.explanation && hasRows ? " split" : ""}`}>
            {result.explanation && (
              <div className="sticky answer-note">
                <p className="answer-note-head">解説</p>
                <ExplainPopover showInput onAddToNote={appendToNote}>
                  <Markdown>{result.explanation}</Markdown>
                </ExplainPopover>
              </div>
            )}
            {hasRows && (
              <div className="answer-rows">
                <ChoiceRationales choices={quiz.choices} selected={selected} result={result} />
                <SourceKnowledgeView knowledge={result.source_knowledge} />
              </div>
            )}
          </div>
        </div>
      )}

      {result && last ? (
        <AnswerBar
          mode="result"
          result={result}
          confidence={last.confidence}
          points={last.points}
          quiz={quiz}
          easy={easy}
          onEasy={() => setEasy(true)}
          nextLabel={index + 1 < quizzes.length ? "次へ" : "結果を見る"}
          onNext={next}
        />
      ) : hideChoices ? (
        <AnswerBar mode="reveal" onReveal={() => setRevealed(true)} error={error} />
      ) : (
        <AnswerBar
          mode="answer"
          disabled={!selected || busy}
          onSubmit={(c) => void submit(c)}
          error={error}
        />
      )}
    </div>
  );
}
