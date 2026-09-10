import "server-only";
import { getSupabaseAdmin } from "./supabase/admin";
import { weakTagThreshold } from "./env";
import { reviewInfo } from "./review-schedule";
import type {
  AttemptResult,
  KnowledgeItem,
  QuizChoice,
  QuizLink,
  QuizPublic,
  QuizSortKey,
  QuizStatusFilter,
  ReviewItem,
  TagInfo,
  TagStat,
} from "./types";

function must<T>(res: { data: T | null; error: { message: string } | null }, ctx: string): T {
  if (res.error) throw new Error(`${ctx}: ${res.error.message}`);
  return res.data as T;
}

interface AttemptAgg {
  count: number;
  lastCorrect: boolean | null;
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
    const cur = map.get(r.quiz_id) ?? { count: 0, lastCorrect: null };
    cur.count += 1;
    cur.lastCorrect = r.is_correct;
    map.set(r.quiz_id, cur);
  }
  return map;
}

const QUIZ_SELECT =
  "id, question, choices, created_by, created_at, star, note, last_answered_at, quiz_tags(tags(name))";

function tagsOf(row: any): string[] {
  return (row.quiz_tags ?? [])
    .map((l: any) => l.tags?.name)
    .filter((n: unknown): n is string => typeof n === "string");
}

function toQuizPublic(row: any, agg: Map<string, AttemptAgg>): QuizPublic {
  const a = agg.get(row.id) ?? { count: 0, lastCorrect: null };
  return {
    id: row.id,
    question: row.question,
    choices: row.choices as QuizChoice[],
    tags: tagsOf(row),
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    attempt_count: a.count,
    last_correct: a.lastCorrect,
    last_answered_at: row.last_answered_at ?? null,
    star: row.star ?? 0,
    note: row.note ?? null,
  };
}

function applyStatus(items: QuizPublic[], status: QuizStatusFilter): QuizPublic[] {
  if (status === "unanswered") return items.filter((i) => i.attempt_count === 0);
  if (status === "answered") return items.filter((i) => i.attempt_count > 0);
  return items;
}

function sortQuizzes(items: QuizPublic[], sort: QuizSortKey): QuizPublic[] {
  const byCreated = (dir: 1 | -1) => (a: QuizPublic, b: QuizPublic) =>
    dir * (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);
  // 最終回答が null のものは常に末尾
  const byAnswered =
    (dir: 1 | -1) => (a: QuizPublic, b: QuizPublic) => {
      if (!a.last_answered_at && !b.last_answered_at) return 0;
      if (!a.last_answered_at) return 1;
      if (!b.last_answered_at) return -1;
      return dir * (a.last_answered_at < b.last_answered_at ? -1 : 1);
    };
  const cmp: Record<QuizSortKey, (a: QuizPublic, b: QuizPublic) => number> = {
    created_desc: byCreated(-1),
    created_asc: byCreated(1),
    answered_desc: byAnswered(-1),
    answered_asc: byAnswered(1),
  };
  return [...items].sort(cmp[sort]);
}

/** タグ名 → そのタグが付いたクイズ ID 集合（OR 判定）。tags 未指定なら null。 */
async function quizIdsForTags(tags: string[] | undefined): Promise<Set<string> | null> {
  if (!tags || tags.length === 0) return null;
  const supabase = getSupabaseAdmin();
  const tagRows = must(
    await supabase.from("tags").select("id").in("name", tags),
    "タグ解決",
  ) as { id: string }[];
  if (tagRows.length === 0) return new Set();
  const links = must(
    await supabase
      .from("quiz_tags")
      .select("quiz_id")
      .in(
        "tag_id",
        tagRows.map((t) => t.id),
      ),
    "quiz_tags 取得",
  ) as { quiz_id: string }[];
  return new Set(links.map((l) => l.quiz_id));
}

export interface ListQuizzesOpts {
  tag?: string;
  tags?: string[];
  status?: QuizStatusFilter;
  sort?: QuizSortKey;
  minStar?: number;
  /** 後方互換: true で status="unanswered" 相当 */
  unansweredOnly?: boolean;
  limit?: number;
}

/** 解答画面・一覧向けのクイズ取得（correct_answer は含めない）。 */
export async function listQuizzes(opts: ListQuizzesOpts): Promise<QuizPublic[]> {
  const supabase = getSupabaseAdmin();
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const status: QuizStatusFilter = opts.unansweredOnly
    ? "unanswered"
    : (opts.status ?? "all");
  const sort: QuizSortKey = opts.sort ?? "created_desc";
  const minStar = opts.minStar ?? 0;
  const tags = opts.tags ?? (opts.tag ? [opts.tag] : undefined);

  const [idFilter, aggBase] = await Promise.all([
    quizIdsForTags(tags),
    attemptAggByQuiz(),
  ]);
  if (idFilter && idFilter.size === 0) return [];

  let query = supabase.from("quizzes").select(QUIZ_SELECT);
  if (idFilter) query = query.in("id", [...idFilter]);
  const rows = must(await query, "quizzes 取得") as any[];

  let items = rows.map((r) => toQuizPublic(r, aggBase));
  items = applyStatus(items, status).filter((i) => i.star >= minStar);
  items = sortQuizzes(items, sort);
  return items.slice(0, limit);
}

export async function listQuizLinks(quizId: string): Promise<QuizLink[]> {
  const supabase = getSupabaseAdmin();
  const rows = must(
    await supabase
      .from("quiz_links")
      .select("id, url, title, title_status, created_at")
      .eq("quiz_id", quizId)
      .order("created_at", { ascending: true }),
    "quiz_links 取得",
  ) as QuizLink[];
  return rows;
}

export async function getQuizForAnswering(id: string): Promise<QuizPublic | null> {
  const supabase = getSupabaseAdmin();
  const [rowRes, agg, links] = await Promise.all([
    supabase.from("quizzes").select(QUIZ_SELECT).eq("id", id).maybeSingle(),
    attemptAggByQuiz(),
    listQuizLinks(id),
  ]);
  const row = must(rowRes, "quiz 取得") as any | null;
  if (!row) return null;
  return { ...toQuizPublic(row, agg), links };
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
  if (!validIds.has(userAnswer)) throw new Error("invalid user_answer");

  const isCorrect = userAnswer === quiz.correct_answer;
  const now = new Date().toISOString();

  must(
    await supabase
      .from("quiz_attempts")
      .insert({ quiz_id: quizId, user_answer: userAnswer, is_correct: isCorrect })
      .select("id")
      .single(),
    "quiz_attempts 記録",
  );
  must(
    await supabase.from("quizzes").update({ last_answered_at: now }).eq("id", quizId).select("id").single(),
    "last_answered_at 更新",
  );

  return {
    is_correct: isCorrect,
    correct_answer: quiz.correct_answer,
    explanation: quiz.explanation,
  };
}

/** star / note の更新。 */
export async function setQuizAnnotation(
  id: string,
  patch: { star?: number; note?: string | null },
): Promise<{ star: number; note: string | null }> {
  const supabase = getSupabaseAdmin();
  const update: Record<string, unknown> = {};
  if (patch.star !== undefined) {
    const s = Math.round(patch.star);
    if (s < 0 || s > 5) throw new Error("star は 0〜5");
    update.star = s;
  }
  if (patch.note !== undefined) {
    update.note = patch.note === "" ? null : patch.note;
  }
  if (Object.keys(update).length === 0) throw new Error("更新する項目がありません");

  const row = must(
    await supabase.from("quizzes").update(update).eq("id", id).select("star, note").maybeSingle(),
    "注釈の更新",
  ) as { star: number; note: string | null } | null;
  if (!row) throw new Error("quiz not found");
  return row;
}

export async function addQuizLink(quizId: string, url: string): Promise<QuizLink> {
  const supabase = getSupabaseAdmin();
  // クイズの存在確認
  const exists = must(
    await supabase.from("quizzes").select("id").eq("id", quizId).maybeSingle(),
    "quiz 存在確認",
  ) as { id: string } | null;
  if (!exists) throw new Error("quiz not found");

  const row = must(
    await supabase
      .from("quiz_links")
      .insert({ quiz_id: quizId, url, title_status: "pending" })
      .select("id, url, title, title_status, created_at")
      .single(),
    "quiz_link 追加",
  ) as QuizLink;
  return row;
}

export async function updateLinkTitle(
  linkId: string,
  title: string | null,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  must(
    await supabase
      .from("quiz_links")
      .update({ title, title_status: title ? "ok" : "failed" })
      .eq("id", linkId)
      .select("id")
      .maybeSingle(),
    "quiz_link タイトル更新",
  );
}

export async function deleteQuizLink(quizId: string, linkId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  must(
    await supabase.from("quiz_links").delete().eq("id", linkId).eq("quiz_id", quizId).select("id").maybeSingle(),
    "quiz_link 削除",
  );
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
    .map((row) => ({
      id: row.id,
      question: row.question,
      answer: row.answer,
      context: row.context ?? null,
      source: row.source ?? null,
      tags: (row.knowledge_item_tags ?? [])
        .map((l: any) => l.tags?.name)
        .filter((n: unknown): n is string => typeof n === "string"),
      quiz_count: 0,
      created_at: row.created_at,
    }));
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

/** 全タグ（色・クイズ数つき）。/tags ページと色マップに使う。 */
export async function listTags(): Promise<TagInfo[]> {
  const supabase = getSupabaseAdmin();
  const [tagsRes, qtRes] = await Promise.all([
    supabase.from("tags").select("id, name, color"),
    supabase.from("quiz_tags").select("tag_id"),
  ]);
  const tags = must(tagsRes, "tags 取得") as {
    id: string;
    name: string;
    color: string | null;
  }[];
  const qtRows = must(qtRes, "quiz_tags 取得") as { tag_id: string }[];
  const count = new Map<string, number>();
  for (const r of qtRows) count.set(r.tag_id, (count.get(r.tag_id) ?? 0) + 1);

  return tags
    .map((t) => ({ ...t, quiz_count: count.get(t.id) ?? 0 }))
    .sort((a, b) => b.quiz_count - a.quiz_count || a.name.localeCompare(b.name));
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function setTagColor(
  id: string,
  color: string | null,
): Promise<{ id: string; color: string | null }> {
  if (color !== null && !HEX.test(color)) throw new Error("color は #RRGGBB 形式");
  const supabase = getSupabaseAdmin();
  const row = must(
    await supabase
      .from("tags")
      .update({ color: color ? color.toLowerCase() : null })
      .eq("id", id)
      .select("id, color")
      .maybeSingle(),
    "タグ色の更新",
  ) as { id: string; color: string | null } | null;
  if (!row) throw new Error("tag not found");
  return row;
}

export interface SearchOpts {
  q?: string;
  tags?: string[];
  status?: QuizStatusFilter;
  sort?: QuizSortKey;
  minStar?: number;
  includeNote?: boolean;
  includeLinkTitles?: boolean;
  /** 生成日レンジ（ISO）。created_at >= from かつ < to */
  createdFrom?: string;
  createdTo?: string;
  limit?: number;
}

/** 稼働カレンダー用: 直近 days 日のクイズ生成日時（ISO）の配列。 */
export async function activityTimestamps(days = 190): Promise<string[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = must(
    await getSupabaseAdmin()
      .from("quizzes")
      .select("created_at")
      .gte("created_at", since),
    "生成日時の取得",
  ) as { created_at: string }[];
  return rows.map((r) => r.created_at);
}

/** キーワード + タグ + フィルタでクイズを検索する。 */
export async function searchQuizzes(opts: SearchOpts): Promise<QuizPublic[]> {
  const supabase = getSupabaseAdmin();
  const status: QuizStatusFilter = opts.status ?? "all";
  const sort: QuizSortKey = opts.sort ?? "created_desc";
  const minStar = opts.minStar ?? 0;
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const tokens = (opts.q ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const [idFilter, agg, expRows, linkRows] = await Promise.all([
    quizIdsForTags(opts.tags),
    attemptAggByQuiz(),
    tokens.length ? supabase.from("quizzes").select("id, explanation") : Promise.resolve({ data: [], error: null }),
    tokens.length && opts.includeLinkTitles
      ? supabase.from("quiz_links").select("quiz_id, title").eq("title_status", "ok")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (idFilter && idFilter.size === 0) return [];

  const explByQuiz = new Map<string, string>();
  for (const r of (must(expRows as any, "explanation 取得") as { id: string; explanation: string | null }[]) ?? []) {
    if (r.explanation) explByQuiz.set(r.id, r.explanation);
  }
  const titlesByQuiz = new Map<string, string[]>();
  for (const r of (must(linkRows as any, "link title 取得") as { quiz_id: string; title: string | null }[]) ?? []) {
    if (r.title) {
      const arr = titlesByQuiz.get(r.quiz_id) ?? [];
      arr.push(r.title);
      titlesByQuiz.set(r.quiz_id, arr);
    }
  }

  let query = supabase.from("quizzes").select(QUIZ_SELECT);
  if (idFilter) query = query.in("id", [...idFilter]);
  const rows = must(await query, "quizzes 取得") as any[];

  let items = rows.map((r) => toQuizPublic(r, agg));

  if (tokens.length) {
    items = items.filter((it) => {
      const parts: string[] = [it.question];
      for (const c of it.choices) parts.push(c.content);
      const exp = explByQuiz.get(it.id);
      if (exp) parts.push(exp);
      if (opts.includeNote && it.note) parts.push(it.note);
      if (opts.includeLinkTitles) parts.push(...(titlesByQuiz.get(it.id) ?? []));
      const haystack = parts.join("\n").toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }

  items = applyStatus(items, status).filter((i) => i.star >= minStar);
  if (opts.createdFrom) items = items.filter((i) => i.created_at >= opts.createdFrom!);
  if (opts.createdTo) items = items.filter((i) => i.created_at < opts.createdTo!);
  items = sortQuizzes(items, sort);
  return items.slice(0, limit);
}

/** 復習おすすめ（忘却曲線ベース）。超過日数の大きい順の全件。 */
export async function dueForReview(): Promise<ReviewItem[]> {
  const supabase = getSupabaseAdmin();
  const [rowsRes, agg] = await Promise.all([
    supabase.from("quizzes").select(QUIZ_SELECT),
    attemptAggByQuiz(),
  ]);
  const rows = must(rowsRes, "quizzes 取得") as any[];

  const out: ReviewItem[] = [];
  for (const row of rows) {
    const base = toQuizPublic(row, agg);
    const info = reviewInfo(base.last_answered_at, base.attempt_count, base.last_correct);
    if (!info || !info.due) continue;
    out.push({ ...base, days_since: info.daysSince, overdue_days: info.overdueDays });
  }
  out.sort((a, b) => b.overdue_days - a.overdue_days);
  return out;
}

/** ホーム画面が必要とするものを 1 回の呼び出しでまとめて返す。 */
export async function homeSummary(): Promise<{
  stats: TagStat[];
  unanswered: number;
  unquizzed: number;
  quizTotal: number;
  dueForReview: ReviewItem[];
  dueCount: number;
}> {
  const supabase = getSupabaseAdmin();
  const [stats, unansweredQuizzes, unquizzed, due, countRes] = await Promise.all([
    listTagStats(),
    listQuizzes({ status: "unanswered" }),
    listUnquizzedKnowledge(),
    dueForReview(),
    supabase.from("quizzes").select("id", { count: "exact", head: true }),
  ]);
  return {
    stats,
    unanswered: unansweredQuizzes.length,
    unquizzed: unquizzed.length,
    quizTotal: countRes.count ?? 0,
    dueForReview: due.slice(0, 5),
    dueCount: due.length,
  };
}
