"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiGet } from "../../lib/client";
import type { QuizPublic, ReviewItem } from "../../lib/types";
import { QuizSession } from "../_components/QuizSession";

/** 1 セッションで出す最大問題数。 */
const SESSION_SIZE = 10;

/** 解答回数の少ない順 → 最終回答が古い順（未回答が先頭）。 */
function leastPracticedFirst(a: QuizPublic, b: QuizPublic): number {
  if (a.attempt_count !== b.attempt_count) return a.attempt_count - b.attempt_count;
  return (a.last_answered_at ?? "").localeCompare(b.last_answered_at ?? "");
}

async function loadQuizzes(mode: string | null, tag: string | null): Promise<QuizPublic[]> {
  if (tag) {
    const p = new URLSearchParams({ tags: tag });
    const r = await apiGet<{ quizzes: QuizPublic[] }>(`/api/quizzes?${p}`);
    return r.quizzes.sort(leastPracticedFirst);
  }
  if (mode === "unanswered") {
    const r = await apiGet<{ quizzes: QuizPublic[] }>(
      "/api/quizzes?status=unanswered&sort=created_asc",
    );
    return r.quizzes;
  }
  // 既定は復習（超過日数の大きい順で返ってくる）
  const r = await apiGet<{ items: ReviewItem[] }>("/api/review");
  return r.items;
}

function titleOf(mode: string | null, tag: string | null): string {
  if (tag) return `タグ「${tag}」を解く`;
  if (mode === "unanswered") return "未解答の問題を解く";
  return "今日の復習";
}

function Play() {
  const params = useSearchParams();
  const mode = params.get("mode");
  const tag = params.get("tag");
  const [quizzes, setQuizzes] = useState<QuizPublic[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQuizzes(null);
    loadQuizzes(mode, tag)
      .then((qs) => setQuizzes(qs.slice(0, SESSION_SIZE)))
      .catch((e: Error) => setError(e.message));
  }, [mode, tag]);

  const playing = quizzes !== null && quizzes.length > 0;

  return (
    <>
      {/* 解いている間は上部バーをすっきりさせるため、見出しは読み上げ用にだけ残す */}
      <h1 className={playing ? "play-visually-hidden" : undefined}>{titleOf(mode, tag)}</h1>
      {error && <p className="error">{error}</p>}
      {quizzes === null ? (
        !error && <p className="muted">読み込み中…</p>
      ) : quizzes.length === 0 ? (
        <p className="muted">
          出題できる問題がありません。<Link href="/">ホームへ</Link>
        </p>
      ) : (
        // 選択肢を隠す・効果音の切り替えとキー操作の説明は、上部バーの設定ボタンにまとめた
        <QuizSession key={`${mode}-${tag}`} quizzes={quizzes} />
      )}
    </>
  );
}

export default function PlayPage() {
  return (
    <Suspense fallback={null}>
      <Play />
    </Suspense>
  );
}
