"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiGet } from "../../lib/client";
import { feedback, prefersReducedMotion } from "../../lib/feedback";
import { RANK_MESSAGES, rankOf } from "../../lib/quiz-score";
import { countByLocalDate, currentStreak, localDateKey } from "../../lib/streak";
import type { Answered } from "./QuizSession";
import { Confetti } from "./Confetti";
import { Bulb } from "./Bulb";
import { bulbChangeOf } from "./BulbChange";
import { FlameIcon } from "./PlayIcons";

/** 設問の Markdown から一覧表示用の 1 行を取り出す（コードブロックは飛ばす）。 */
function firstLine(md: string): string {
  const line = md
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  return line ?? md.slice(0, 80);
}

/** 0 から target まで数字を増やして見せる。 */
function useCountUp(target: number, ms = 900): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setN(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start) / ms, 1);
      setN(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

// 自己ベスト（このブラウザ内のみ）
const BEST_KEY = "naruhodo:best";
interface Best {
  score: number;
  combo: number;
}
function readBest(): Best {
  try {
    const v = JSON.parse(window.localStorage.getItem(BEST_KEY) ?? "null");
    if (v && typeof v.score === "number" && typeof v.combo === "number") return v;
  } catch {
    // 読めなければ初回扱い
  }
  return { score: 0, combo: 0 };
}
function writeBest(b: Best): void {
  try {
    window.localStorage.setItem(BEST_KEY, JSON.stringify(b));
  } catch {
    // 保存できなくても表示には影響しない
  }
}

/** このセッションで なるほど電球 が明るくなった（段階が上がった）問題の数。 */
function countBrightened(answered: Answered[]): number {
  return answered.filter((a) => {
    const c = bulbChangeOf(a.quiz.correct_streak, a.result.is_correct, a.confidence);
    return c.to > c.from;
  }).length;
}

/**
 * 連続出題のまとめ。ランクのスタンプ・スコアのカウントアップ・統計のタイル
 * （正解数・最大コンボ・明るくなった電球・連続学習日数）・自己ベストを出す。
 */
export function SessionSummary({
  answered,
  score,
  maxCombo,
  sound,
  todayBefore,
  onRetry,
}: {
  answered: Answered[];
  score: number;
  maxCombo: number;
  sound: boolean;
  /** セッション開始時点で今日すでに解いていた数（不明なら null） */
  todayBefore: number | null;
  onRetry?: () => void;
}) {
  const total = answered.length;
  const sure = answered.filter((a) => a.result.is_correct && a.confidence === "sure").length;
  const unsure = answered.filter((a) => a.result.is_correct && a.confidence === "unsure");
  const wrong = answered.filter((a) => !a.result.is_correct);
  const rank = rankOf(sure, unsure.length, total);
  const shown = useCountUp(score);
  const brightened = countBrightened(answered);

  const [newBest, setNewBest] = useState<{ score: boolean; combo: boolean } | null>(null);
  const [streak, setStreak] = useState<{ days: number; firstToday: boolean } | null>(null);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;

    const prev = readBest();
    const best = { score: Math.max(prev.score, score), combo: Math.max(prev.combo, maxCombo) };
    // 初回（ベストが 0）は「更新」と言わない
    setNewBest({
      score: prev.score > 0 && score > prev.score,
      combo: prev.combo > 0 && maxCombo > prev.combo,
    });
    writeBest(best);

    if (rank === "S" || rank === "A") feedback("fanfare", sound);

    // 開始時点で今日まだ解いておらず、今は解いている → 「今日の分クリア！」
    apiGet<{ timestamps: string[] }>("/api/activity?kind=answers&days=400")
      .then((r) => {
        const counts = countByLocalDate(r.timestamps);
        const today = counts[localDateKey(new Date())] ?? 0;
        setStreak({
          days: currentStreak(new Set(Object.keys(counts))),
          firstToday: todayBefore === 0 && today > 0,
        });
      })
      .catch(() => {});
  }, [score, maxCombo, rank, sound, todayBefore]);

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
      {(rank === "S" || rank === "A") && <Confetti count={rank === "S" ? 90 : 50} />}

      <p className="summary-kicker">{total} 問おつかれさま！</p>
      <div className="summary-hero">
        <span className={`rank-stamp rank-${rank}`} role="img" aria-label={`ランク ${rank}`}>
          {rank}
        </span>
        <div>
          <p className="summary-score">
            <strong>{shown}</strong> pt
            {newBest?.score && <span className="best-badge">自己ベスト更新！</span>}
          </p>
          <p className="summary-message">{RANK_MESSAGES[rank]}</p>
        </div>
      </div>

      <div className="summary-stats">
        <div>
          <span className="stat-num">
            {sure + unsure.length}/{total}
          </span>
          <span className="stat-label">正解</span>
        </div>
        <div>
          <span className="stat-num">
            {maxCombo}
            {newBest?.combo && <span className="best-dot">NEW</span>}
          </span>
          <span className="stat-label">最大コンボ</span>
        </div>
        <div className={brightened > 0 ? "stat-bulb lit" : "stat-bulb"}>
          <span className="stat-num">
            <Bulb level={brightened > 0 ? 3 : 0} size={26} brightened={brightened > 0} title="なるほど電球" />
            {brightened}
          </span>
          <span className="stat-label">明るくなった電球</span>
        </div>
        {streak && streak.days > 0 && (
          <div className={streak.firstToday ? "stat-streak streak-up" : "stat-streak"}>
            <span className="stat-num">
              <FlameIcon size={24} />
              {streak.days}
            </span>
            <span className="stat-label">
              {streak.firstToday ? "日連続！今日の分クリア" : "日連続"}
            </span>
          </div>
        )}
      </div>

      {list("間違えた問題", wrong)}
      {list("あやふやだった問題", unsure)}

      <p className="button-row">
        {onRetry && (
          <button className="primary" onClick={onRetry}>
            間違えた・あやふやだった問題をもう一度
          </button>
        )}
        <Link className={onRetry ? "button-link secondary" : "button-link"} href="/">
          ホームへ
        </Link>
      </p>
    </div>
  );
}
