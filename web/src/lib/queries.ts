import "server-only";
import { getSupabaseAdmin } from "./supabase/admin";
import { weakTagThreshold } from "./env";
import type {
  AttemptResult,
  KnowledgeItem,
  QuizChoice,
  QuizPublic,
  TagStat,
} from "./types";

function must<T>(res: { data: T | null; error: { message: string } | null }, ctx: string): T {
  if (res.error) throw new Error(`${ctx}: ${res.error.message}`);
  return res.data as T;
}

interface AttemptAgg {
  count: number;
  lastCorrect: boolean | null;
  lastAt: string | null;
}

async function attemptAggByQuiz(): Promise<Map<string, AttemptAgg>> {
  const supabase = getSupabaseAdmin();
  const rows = must(
    await supabase
      .from("quiz_attempts")
      .select("quiz_id, is_correct, answered_at")
      .order("answered_at", { ascending: true }),
    "quiz_attempts 取得",
  ) as { quiz_id: string; is_correct: boolean; answered_at: string }[];

  const map = new Map<string, AttemptAgg>();
  for (const r of rows) {
    const cur = map.get(r.quiz_id) ?? { count: 0, lastCorrect: null, lastAt: null };
    cur.count += 1;
    cur.lastCorrect = r.is_correct;
    cur.lastAt = r.answered_at;
    map.set(r.quiz_id, cur);
  }
  return map;
}

/** 解答画面・一覧向けのクイズ取得（correct_answer は含めない）。 */
export async function listQuizzes(opts: {
  tag?: string;
  unansweredOnly?: boolean;
  limit?: number;
}): Promise<QuizPublic[]> {
  const supabase = getSupabaseAdmin();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

  let quizIdFilter: Set<string> | null = null;
  if (opts.tag) {
    const tagRow = must(
      await supabase.from("tags").select("id").eq("name", opts.tag).maybeSingle(),
      "タグ解決",
    ) as { id: string } | null;
    if (!tagRow) return [];
    const links = must(
      await supabase.from("quiz_tags").select("quiz_id").eq("tag_id", tagRow.id),
      "quiz_tags 取得",
    ) as { quiz_id: string }[];
    quizIdFilter = new Set(links.map((l) => l.quiz_id));
    if (quizIdFilter.size === 0) return [];
  }

  let query = supabase
    .from("quizzes")
    .select("id, question, choices, created_by, created_at, quiz_tags(tags(name))")
    .order("created_at", { ascending: false });
  if (quizIdFilter) query = query.in("id", [...quizIdFilter]);

  const [rowsRes, agg] = await Promise.all([query, attemptAggByQuiz()]);
  const rows = must(rowsRes, "quizzes 取得") as any[];

  const items: QuizPublic[] = rows.map((row) => {
    const tags: string[] = (row.quiz_tags ?? [])
      .map((l: any) => l.tags?.name)
      .filter((n: unknown): n is string => typeof n === "string");
    const a = agg.get(row.id) ?? { count: 0, lastCorrect: null, lastAt: null };
    return {
      id: row.id,
      question: row.question,
      choices: row.choices as QuizChoice[],
      tags,
      created_by: row.created_by ?? null,
      created_at: row.created_at,
      attempt_count: a.count,
      last_correct: a.lastCorrect,
    };
  });

  const filtered = opts.unansweredOnly
    ? items.filter((i) => i.attempt_count === 0)
    : items;
  return filtered.slice(0, limit);
}

export async function getQuizForAnswering(id: string): Promise<QuizPublic | null> {
  const supabase = getSupabaseAdmin();
  const [rowRes, agg] = await Promise.all([
    supabase
      .from("quizzes")
      .select("id, question, choices, created_by, created_at, quiz_tags(tags(name))")
      .eq("id", id)
      .maybeSingle(),
    attemptAggByQuiz(),
  ]);
  const row = must(rowRes, "quiz 取得") as any | null;
  if (!row) return null;

  const tags: string[] = (row.quiz_tags ?? [])
    .map((l: any) => l.tags?.name)
    .filter((n: unknown): n is string => typeof n === "string");
  const a = agg.get(id) ?? { count: 0, lastCorrect: null, lastAt: null };

  return {
    id: row.id,
    question: row.question,
    choices: row.choices as QuizChoice[],
    tags,
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    attempt_count: a.count,
    last_correct: a.lastCorrect,
  };
}

/** 解答を採点し履歴に記録する。正誤判定はここ（サーバー）で行う。 */
export async function gradeAndRecord(
  quizId: string,
  userAnswer: string,
): Promise<AttemptResult> {
  const supabase = getSupabaseAdmin();
  const quiz = must(
    await supabase
      .from("quizzes")
      .select("correct_answer, explanation, choices")
      .eq("id", quizId)
      .maybeSingle(),
    "quiz 採点用取得",
  ) as { correct_answer: string; explanation: string | null; choices: QuizChoice[] } | null;

  if (!quiz) throw new Error("quiz not found");

  const validIds = new Set((quiz.choices ?? []).map((c) => c.id));
  if (!validIds.has(userAnswer)) {
    throw new Error("invalid user_answer");
  }

  const isCorrect = userAnswer === quiz.correct_answer;

  must(
    await supabase
      .from("quiz_attempts")
      .insert({ quiz_id: quizId, user_answer: userAnswer, is_correct: isCorrect })
      .select("id")
      .single(),
    "quiz_attempts 記録",
  );

  return {
    is_correct: isCorrect,
    correct_answer: quiz.correct_answer,
    explanation: quiz.explanation,
  };
}

/** クイズ未生成の学び一覧。「クイズ化を依頼」用。 */
export async function listUnquizzedKnowledge(limit = 100): Promise<KnowledgeItem[]> {
  const supabase = getSupabaseAdmin();

  const [quizRes, rowsRes] = await Promise.all([
    supabase.from("quizzes").select("source_knowledge_id"),
    supabase
      .from("knowledge_items")
      .select("*, knowledge_item_tags(tags(name))")
      .order("created_at", { ascending: false }),
  ]);
  const quizRows = must(quizRes, "quizzes 集計") as {
    source_knowledge_id: string | null;
  }[];
  const quizzed = new Set(
    quizRows.map((r) => r.source_knowledge_id).filter((v): v is string => Boolean(v)),
  );
  const rows = must(rowsRes, "knowledge_items 取得") as any[];

  return rows
    .filter((r) => !quizzed.has(r.id))
    .slice(0, limit)
    .map((row) => {
      const tags: string[] = (row.knowledge_item_tags ?? [])
        .map((l: any) => l.tags?.name)
        .filter((n: unknown): n is string => typeof n === "string");
      return {
        id: row.id,
        question: row.question,
        answer: row.answer,
        context: row.context ?? null,
        source: row.source ?? null,
        tags,
        quiz_count: 0,
        created_at: row.created_at,
      };
    });
}

export async function listTagStats(): Promise<TagStat[]> {
  const supabase = getSupabaseAdmin();
  const [statsRes, qtRes] = await Promise.all([
    supabase.from("tag_stats").select("*").order("total_attempts", { ascending: false }),
    supabase.from("quiz_tags").select("tag_id"),
  ]);
  const rows = must(statsRes, "tag_stats 取得") as Omit<
    TagStat,
    "weak" | "quiz_count"
  >[];

  // タグ別のクイズ数（出題比率用）。quiz_tags を全件取ってコード側で集計。
  const qtRows = must(qtRes, "quiz_tags 取得") as { tag_id: string }[];
  const quizCountByTag = new Map<string, number>();
  for (const r of qtRows) {
    quizCountByTag.set(r.tag_id, (quizCountByTag.get(r.tag_id) ?? 0) + 1);
  }

  const { minAttempts, maxAccuracy } = weakTagThreshold;
  return rows.map((r) => ({
    ...r,
    quiz_count: quizCountByTag.get(r.tag_id) ?? 0,
    weak:
      r.total_attempts >= minAttempts &&
      r.accuracy !== null &&
      r.accuracy < maxAccuracy,
  }));
}

/** ホーム画面が必要とするものを 1 回の呼び出しでまとめて返す。 */
export async function homeSummary(): Promise<{
  stats: TagStat[];
  unanswered: number;
  unquizzed: number;
}> {
  const [stats, unansweredQuizzes, unquizzed] = await Promise.all([
    listTagStats(),
    listQuizzes({ unansweredOnly: true }),
    listUnquizzedKnowledge(),
  ]);
  return {
    stats,
    unanswered: unansweredQuizzes.length,
    unquizzed: unquizzed.length,
  };
}
