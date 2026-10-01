import "server-only";
import { getSupabaseAdmin } from "./supabase/admin";
import { weakTagThreshold } from "./env";
import { reviewInfo } from "./review-schedule";
import { normalizeTags } from "./normalize-tags";
import { masteryOf, type Mastery } from "./mastery";
import type {
  AttemptResult,
  HomeSummary,
  MasteryGroup,
  KnowledgeItem,
  QuizChoice,
  QuizLink,
  QuizPublic,
  QuizSortKey,
  QuizStatusFilter,
  HiddenFilter,
  Confidence,
  ReviewItem,
  SourceKnowledge,
  TagInfo,
  TagStat,
  QuizFixSource,
} from "./types";

function must<T>(res: { data: T | null; error: { message: string } | null }, ctx: string): T {
  if (res.error) throw new Error(`${ctx}: ${res.error.message}`);
  return res.data as T;
}

interface AttemptAgg {
  count: number;
  lastCorrect: boolean | null;
  /** 直近から数えた「自信ありの」連続正解回数。直近が不正解・あやふやなら 0。 */
  correctStreak: number;
}

async function attemptAggByQuiz(): Promise<Map<string, AttemptAgg>> {
  const supabase = getSupabaseAdmin();
  const rows = must(
    await supabase
      .from("quiz_attempts")
      .select("quiz_id, is_correct, confidence, answered_at")
      .order("answered_at", { ascending: true }),
    "quiz_attempts 取得",
  ) as {
    quiz_id: string;
    is_correct: boolean;
    confidence: Confidence | null;
    answered_at: string;
  }[];

  const map = new Map<string, AttemptAgg>();
  for (const r of rows) {
    const cur = map.get(r.quiz_id) ?? { count: 0, lastCorrect: null, correctStreak: 0 };
    cur.count += 1;
    cur.lastCorrect = r.is_correct;
    // あやふやで正解（まぐれ当たりの可能性）は連続正解に数えず、早めに再出題する
    const solid = r.is_correct && r.confidence !== "unsure";
    cur.correctStreak = solid ? cur.correctStreak + 1 : 0;
    map.set(r.quiz_id, cur);
  }
  return map;
}

const QUIZ_SELECT =
  "id, question, choices, created_by, created_at, star, note, hidden, fix_note, source_knowledge_id, last_answered_at, quiz_tags(tags(name))";

/** hidden フィルタを Supabase クエリに適用する。 */
function applyHidden<T>(query: T, hidden: HiddenFilter): T {
  const q = query as any;
  if (hidden === "exclude") return q.eq("hidden", false);
  if (hidden === "only") return q.eq("hidden", true);
  return q;
}

function tagsOf(row: any): string[] {
  return (row.quiz_tags ?? [])
    .map((l: any) => l.tags?.name)
    .filter((n: unknown): n is string => typeof n === "string");
}

/**
 * 解答前に返す選択肢から rationale を取り除く。
 * 正解の選択肢の理由が見えると答えが分かってしまうため、rationale は採点後（gradeAndRecord）にだけ返す。
 */
function stripRationale(choices: QuizChoice[] | null | undefined): QuizChoice[] {
  return (choices ?? []).map(({ rationale: _rationale, ...rest }) => rest);
}

function toQuizPublic(row: any, agg: Map<string, AttemptAgg>): QuizPublic {
  const a = agg.get(row.id) ?? { count: 0, lastCorrect: null, correctStreak: 0 };
  return {
    id: row.id,
    question: row.question,
    choices: stripRationale(row.choices as QuizChoice[]),
    tags: tagsOf(row),
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    attempt_count: a.count,
    last_correct: a.lastCorrect,
    correct_streak: a.correctStreak,
    last_answered_at: row.last_answered_at ?? null,
    star: row.star ?? 0,
    note: row.note ?? null,
    hidden: row.hidden ?? false,
    fix_note: row.fix_note ?? null,
    source_knowledge_id: row.source_knowledge_id ?? null,
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
  hidden?: HiddenFilter;
  /** true で要修正（fix_note あり）のみ */
  fixOnly?: boolean;
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

  let query = applyHidden(
    supabase.from("quizzes").select(QUIZ_SELECT),
    opts.hidden ?? "exclude",
  );
  if (idFilter) query = query.in("id", [...idFilter]);
  if (opts.fixOnly) query = query.not("fix_note", "is", null);
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
  confidence: Confidence,
): Promise<AttemptResult> {
  const supabase = getSupabaseAdmin();
  const quiz = must(
    await supabase
      .from("quizzes")
      .select("correct_answer, explanation, choices, knowledge_items(question, answer, context)")
      .eq("id", quizId)
      .maybeSingle(),
    "quiz 採点用取得",
  ) as {
    correct_answer: string;
    explanation: string | null;
    choices: QuizChoice[];
    knowledge_items: SourceKnowledge | null;
  } | null;

  if (!quiz) throw new Error("quiz not found");

  const validIds = new Set((quiz.choices ?? []).map((c) => c.id));
  if (!validIds.has(userAnswer)) throw new Error("invalid user_answer");

  const isCorrect = userAnswer === quiz.correct_answer;
  const now = new Date().toISOString();

  must(
    await supabase
      .from("quiz_attempts")
      .insert({ quiz_id: quizId, user_answer: userAnswer, is_correct: isCorrect, confidence })
      .select("id")
      .single(),
    "quiz_attempts 記録",
  );
  must(
    await supabase.from("quizzes").update({ last_answered_at: now }).eq("id", quizId).select("id").single(),
    "last_answered_at 更新",
  );

  const rationales: Record<string, string> = {};
  for (const c of quiz.choices ?? []) {
    if (typeof c.rationale === "string" && c.rationale.trim()) rationales[c.id] = c.rationale;
  }

  return {
    is_correct: isCorrect,
    correct_answer: quiz.correct_answer,
    explanation: quiz.explanation,
    source_knowledge: quiz.knowledge_items ?? null,
    rationales,
  };
}

/** fix_note を保存用に正規化する。空・空白だけの指摘も「要修正」として残す。 */
export function normalizeFixNote(v: string): string {
  const t = v.trim();
  return t === "" ? "（理由の記入なし）" : t;
}

/** star / note / hidden / fix_note の更新。fix_note は null で解除。 */
export async function setQuizAnnotation(
  id: string,
  patch: { star?: number; note?: string | null; hidden?: boolean; fix_note?: string | null },
): Promise<{ star: number; note: string | null; hidden: boolean; fix_note: string | null }> {
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
  if (patch.hidden !== undefined) {
    update.hidden = !!patch.hidden;
  }
  if (patch.fix_note !== undefined) {
    update.fix_note =
      patch.fix_note === null ? null : normalizeFixNote(String(patch.fix_note));
  }
  if (Object.keys(update).length === 0) throw new Error("更新する項目がありません");

  const row = must(
    await supabase
      .from("quizzes")
      .update(update)
      .eq("id", id)
      .select("star, note, hidden, fix_note")
      .maybeSingle(),
    "注釈の更新",
  ) as { star: number; note: string | null; hidden: boolean; fix_note: string | null } | null;
  if (!row) throw new Error("quiz not found");
  return row;
}

/**
 * 修正依頼プロンプト用に、正解・解説を含む問題全体を返す。
 * 回答前の画面に正解が漏れないよう、要修正（fix_note あり）の問題に限る。
 * 見つからなければ null、要修正でなければ "not flagged" を投げる。
 */
export async function getQuizFixSource(id: string): Promise<QuizFixSource | null> {
  const row = must(
    await getSupabaseAdmin()
      .from("quizzes")
      .select(
        "id, question, choices, correct_answer, explanation, fix_note, source_knowledge_id, quiz_tags(tags(name))",
      )
      .eq("id", id)
      .maybeSingle(),
    "修正依頼用の取得",
  ) as any | null;
  if (!row) return null;
  if (row.fix_note === null) throw new Error("not flagged");
  return {
    id: row.id,
    question: row.question,
    choices: row.choices as QuizChoice[],
    correct_answer: row.correct_answer,
    explanation: row.explanation ?? null,
    fix_note: row.fix_note,
    tags: tagsOf(row),
    source_knowledge_id: row.source_knowledge_id ?? null,
  };
}

/** tags テーブルに無い名前を作成し、name → id の対応表を返す。 */
async function ensureTagIds(names: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (names.length === 0) return map;
  const supabase = getSupabaseAdmin();
  must(
    await supabase
      .from("tags")
      .upsert(names.map((name) => ({ name })), {
        onConflict: "name",
        ignoreDuplicates: true,
      })
      .select("id"),
    "タグの upsert",
  );
  const rows = must(
    await supabase.from("tags").select("id, name").in("name", names),
    "タグの取得",
  ) as { id: string; name: string }[];
  for (const r of rows) map.set(r.name, r.id);
  return map;
}

/**
 * クイズのタグを指定リストで置き換える（追加・削除の両方を 1 回で表現）。
 * 名前はサーバー側で機械的に正規化する（AI 類似判定はしない）。
 * 戻り値は正規化後のタグ名一覧。
 */
export async function setQuizTags(
  quizId: string,
  rawNames: string[],
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const exists = must(
    await supabase.from("quizzes").select("id").eq("id", quizId).maybeSingle(),
    "quiz 存在確認",
  ) as { id: string } | null;
  if (!exists) throw new Error("quiz not found");

  const names = normalizeTags(rawNames).slice(0, 30);
  const wanted = await ensureTagIds(names);
  const wantedIds = new Set([...wanted.values()]);

  const current = must(
    await supabase.from("quiz_tags").select("tag_id").eq("quiz_id", quizId),
    "quiz_tags 取得",
  ) as { tag_id: string }[];
  const currentIds = new Set(current.map((r) => r.tag_id));

  const toAdd = [...wantedIds].filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !wantedIds.has(id));

  if (toAdd.length > 0) {
    must(
      await supabase
        .from("quiz_tags")
        .upsert(
          toAdd.map((tag_id) => ({ quiz_id: quizId, tag_id })),
          { ignoreDuplicates: true },
        )
        .select("tag_id"),
      "quiz_tags 追加",
    );
  }
  if (toRemove.length > 0) {
    must(
      await supabase
        .from("quiz_tags")
        .delete()
        .eq("quiz_id", quizId)
        .in("tag_id", toRemove)
        .select("tag_id"),
      "quiz_tags 削除",
    );
  }
  return names;
}

/** 直近 days 日に「生成された」クイズで使用が多いタグ（多い順）。手動追加の候補用。 */
export async function recentlyActiveTags(
  days = 5,
  limit = 8,
): Promise<{ name: string; count: number }[]> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = must(
    await supabase
      .from("quiz_tags")
      .select("tags(name), quizzes!inner(created_at)")
      .gte("quizzes.created_at", since),
    "直近タグ集計",
  ) as any[];

  const count = new Map<string, number>();
  for (const r of rows) {
    const name: string | undefined = r.tags?.name;
    if (!name) continue;
    count.set(name, (count.get(name) ?? 0) + 1);
  }
  return [...count.entries()]
    .map(([name, c]) => ({ name, count: c }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
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

/** 非表示でないクイズに紐づく quiz_tags（tag_id のみ）。集計用。 */
async function visibleQuizTagIds(): Promise<string[]> {
  const rows = must(
    await getSupabaseAdmin()
      .from("quiz_tags")
      .select("tag_id, quizzes!inner(hidden)")
      .eq("quizzes.hidden", false),
    "quiz_tags 取得",
  ) as { tag_id: string }[];
  return rows.map((r) => r.tag_id);
}

/**
 * 学びを物理削除する。タグ紐づけは cascade で消え、非表示クイズの source は null になる。
 * 表示中のクイズが紐づく学びは消さない（未出題の学びの整理用途のため）。
 */
export async function deleteKnowledge(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const quizRes = await supabase
    .from("quizzes")
    .select("id", { count: "exact", head: true })
    .eq("source_knowledge_id", id)
    .eq("hidden", false);
  if (quizRes.error) throw new Error(`quizzes 確認: ${quizRes.error.message}`);
  if ((quizRes.count ?? 0) > 0) throw new Error("knowledge has quizzes");

  const row = must(
    await supabase
      .from("knowledge_items")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle(),
    "学びの削除",
  ) as { id: string } | null;
  if (!row) throw new Error("knowledge not found");
}

/**
 * 学び一覧（新しい順）。quiz_count は非表示を除いた紐づくクイズ数。
 * unquizzedOnly=true で未出題（クイズ 0 件）のみ。「クイズ化を依頼」の起点。
 */
export async function listKnowledge(
  opts: { unquizzedOnly?: boolean; limit?: number } = {},
): Promise<KnowledgeItem[]> {
  const supabase = getSupabaseAdmin();
  const [quizRes, rowsRes] = await Promise.all([
    supabase.from("quizzes").select("source_knowledge_id").eq("hidden", false),
    supabase
      .from("knowledge_items")
      .select("*, knowledge_item_tags(tags(name))")
      .order("created_at", { ascending: false }),
  ]);
  const quizRows = must(quizRes, "quizzes 集計") as {
    source_knowledge_id: string | null;
  }[];
  const quizCount = new Map<string, number>();
  for (const r of quizRows) {
    if (r.source_knowledge_id) {
      quizCount.set(r.source_knowledge_id, (quizCount.get(r.source_knowledge_id) ?? 0) + 1);
    }
  }
  const rows = must(rowsRes, "knowledge_items 取得") as any[];

  const items = rows.map((row) => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    context: row.context ?? null,
    source: row.source ?? null,
    tags: (row.knowledge_item_tags ?? [])
      .map((l: any) => l.tags?.name)
      .filter((n: unknown): n is string => typeof n === "string"),
    quiz_count: quizCount.get(row.id) ?? 0,
    created_at: row.created_at,
  }));
  const filtered = opts.unquizzedOnly ? items.filter((i) => i.quiz_count === 0) : items;
  return opts.limit ? filtered.slice(0, opts.limit) : filtered;
}

/** クイズ未生成の学び一覧。「クイズ化を依頼」用。 */
export async function listUnquizzedKnowledge(limit = 100): Promise<KnowledgeItem[]> {
  return listKnowledge({ unquizzedOnly: true, limit });
}

export async function listTagStats(): Promise<TagStat[]> {
  const supabase = getSupabaseAdmin();
  const [statsRes, visibleTagIds] = await Promise.all([
    supabase.from("tag_stats").select("*").order("total_attempts", { ascending: false }),
    visibleQuizTagIds(),
  ]);
  const rows = must(statsRes, "tag_stats 取得") as Omit<
    TagStat,
    "weak" | "quiz_count"
  >[];
  const quizCountByTag = new Map<string, number>();
  for (const tid of visibleTagIds) {
    quizCountByTag.set(tid, (quizCountByTag.get(tid) ?? 0) + 1);
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
  const [tagsRes, visibleTagIds] = await Promise.all([
    supabase.from("tags").select("id, name, color"),
    visibleQuizTagIds(),
  ]);
  const tags = must(tagsRes, "tags 取得") as {
    id: string;
    name: string;
    color: string | null;
  }[];
  const count = new Map<string, number>();
  for (const tid of visibleTagIds) count.set(tid, (count.get(tid) ?? 0) + 1);

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
  hidden?: HiddenFilter;
  /** true で要修正（fix_note あり）のみ */
  fixOnly?: boolean;
  /** 生成日レンジ（ISO）。created_at >= from かつ < to */
  createdFrom?: string;
  createdTo?: string;
  limit?: number;
}

/** 稼働カレンダー用: 直近 days 日のクイズ生成日時（ISO）の配列。非表示は除外。 */
export async function activityTimestamps(days = 190): Promise<string[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = must(
    await getSupabaseAdmin()
      .from("quizzes")
      .select("created_at")
      .eq("hidden", false)
      .gte("created_at", since),
    "生成日時の取得",
  ) as { created_at: string }[];
  return rows.map((r) => r.created_at);
}

/**
 * 稼働カレンダー・連続学習日数用: 直近 days 日の解答日時（ISO）の配列。
 * 非表示クイズへの解答も含める。「その日に学習した」事実は後からクイズを非表示にしても
 * 変わらないため（除外すると、非表示にしただけで過去の連続日数が途切れてしまう）。
 */
export async function answerTimestamps(days = 190): Promise<string[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = must(
    await getSupabaseAdmin()
      .from("quiz_attempts")
      .select("answered_at")
      .gte("answered_at", since)
      // 件数上限（PostgREST の max rows）に当たっても直近側が残るよう新しい順
      .order("answered_at", { ascending: false }),
    "解答日時の取得",
  ) as { answered_at: string }[];
  return rows.map((r) => r.answered_at);
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

  let query = applyHidden(
    supabase.from("quizzes").select(QUIZ_SELECT),
    opts.hidden ?? "exclude",
  );
  if (idFilter) query = query.in("id", [...idFilter]);
  if (opts.fixOnly) query = query.not("fix_note", "is", null);
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
    supabase.from("quizzes").select(QUIZ_SELECT).eq("hidden", false),
    attemptAggByQuiz(),
  ]);
  const rows = must(rowsRes, "quizzes 取得") as any[];

  const out: ReviewItem[] = [];
  for (const row of rows) {
    const base = toQuizPublic(row, agg);
    const info = reviewInfo(base.last_answered_at, agg.get(base.id)?.correctStreak ?? 0);
    if (!info || !info.due) continue;
    out.push({ ...base, days_since: info.daysSince, overdue_days: info.overdueDays });
  }
  out.sort((a, b) => b.overdue_days - a.overdue_days);
  return out;
}

/**
 * ホーム画面が必要とするものを 1 回の呼び出しでまとめて返す。
 * 非表示でないクイズと解答集計は 1 回だけ取得し、未解答数・復習数・電球ボードをそこから数える
 * （listQuizzes / dueForReview をそれぞれ呼ぶと同じ取得が 2 回ずつ走るため）。AI 呼び出しはしない。
 */
export async function homeSummary(): Promise<HomeSummary> {
  const supabase = getSupabaseAdmin();
  const [stats, unquizzed, quizRes, agg] = await Promise.all([
    listTagStats(),
    listUnquizzedKnowledge(),
    supabase.from("quizzes").select(QUIZ_SELECT).eq("hidden", false),
    attemptAggByQuiz(),
  ]);
  const quizzes = (must(quizRes, "quizzes 取得") as any[]).map((r) => toQuizPublic(r, agg));
  const board = buildMasteryBoard(quizzes);
  return {
    stats,
    unanswered: quizzes.filter((q) => q.attempt_count === 0).length,
    unquizzed: unquizzed.length,
    quizTotal: quizzes.length,
    // dueForReview と同じ判定（最終回答からの経過日数 ≥ 連続正解回数に応じた間隔）
    dueCount: quizzes.filter((q) => reviewInfo(q.last_answered_at, q.correct_streak)?.due).length,
    ...board,
  };
}

/** なるほど電球ボードに出すタグ行の上限。超えた分は「その他」にまとめる。 */
const MASTERY_BOARD_MAX_TAGS = 6;

/**
 * なるほど電球ボード（ホームの「灯った知識」）を組み立てる純関数。
 * - 1 問は 1 行にだけ入れる。複数タグなら、そのクイズのタグのうち問題数が最も多いタグ
 *   （同数ならタグ名順で先のもの）。タグ無しは「タグなし」。
 * - 行は問題数の多い順。上限を超えたタグは「その他」にまとめ、「その他」「タグなし」は末尾。
 * - 行内の電球は明るい順。明るさは masteryOf(連続正解回数)。
 */
export function buildMasteryBoard(
  quizzes: QuizPublic[],
): Pick<HomeSummary, "mastery" | "masteryLit" | "masteryTotal"> {
  const quizCountByTag = new Map<string, number>();
  for (const q of quizzes) {
    for (const t of q.tags) quizCountByTag.set(t, (quizCountByTag.get(t) ?? 0) + 1);
  }
  const countOf = (t: string) => quizCountByTag.get(t) ?? 0;

  const levelsByTag = new Map<string, Mastery[]>();
  const untagged: Mastery[] = [];
  let lit = 0;
  for (const q of quizzes) {
    const level = masteryOf(q.correct_streak);
    if (level > 0) lit += 1;
    if (q.tags.length === 0) {
      untagged.push(level);
      continue;
    }
    const home = q.tags.reduce((best, t) =>
      countOf(t) > countOf(best) || (countOf(t) === countOf(best) && t < best) ? t : best,
    );
    const list = levelsByTag.get(home) ?? [];
    list.push(level);
    levelsByTag.set(home, list);
  }

  const brightFirst = (levels: Mastery[]) => [...levels].sort((a, b) => b - a);
  const tagRows: MasteryGroup[] = [...levelsByTag]
    .map(([tag, levels]) => ({ kind: "tag" as const, label: tag, levels }))
    .sort((a, b) => b.levels.length - a.levels.length || (a.label < b.label ? -1 : 1));

  const overflow = tagRows.length > MASTERY_BOARD_MAX_TAGS;
  const shown = overflow ? tagRows.slice(0, MASTERY_BOARD_MAX_TAGS - 1) : tagRows;
  const rest = overflow ? tagRows.slice(MASTERY_BOARD_MAX_TAGS - 1) : [];

  const mastery: MasteryGroup[] = shown.map((g) => ({ ...g, levels: brightFirst(g.levels) }));
  if (rest.length > 0) {
    mastery.push({
      kind: "other",
      label: "その他",
      tagCount: rest.length,
      levels: brightFirst(rest.flatMap((g) => g.levels)),
    });
  }
  if (untagged.length > 0) {
    mastery.push({ kind: "untagged", label: "タグなし", levels: brightFirst(untagged) });
  }
  return { mastery, masteryLit: lit, masteryTotal: quizzes.length };
}
