import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * DB アクセス層（CRUD のみ）。MCP サーバーは生成 AI ロジックを持たず、
 * ここで Supabase への読み書きに徹する。
 */

export interface KnowledgeRow {
  id: string;
  question: string;
  answer: string;
  context: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeWithTags extends KnowledgeRow {
  tags: string[];
  quiz_count: number;
}

export interface QuizChoice {
  id: string;
  type: "text" | "image";
  content: string;
}

export interface SaveQuizInput {
  question: string;
  choices: QuizChoice[];
  correctAnswer: string;
  explanation?: string;
  sourceKnowledgeId?: string;
  createdBy: string;
  tags: string[];
}

export interface TagStatRow {
  tag_id: string;
  tag_name: string;
  total_attempts: number;
  correct_attempts: number;
  accuracy: number | null;
}

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

/**
 * タグ名（正規化済み）を upsert し、name→id の対応を返す。
 */
export async function ensureTags(
  supabase: SupabaseClient,
  names: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (names.length === 0) return map;

  const { error: upsertError } = await supabase
    .from("tags")
    .upsert(
      names.map((name) => ({ name })),
      { onConflict: "name", ignoreDuplicates: true },
    );
  if (upsertError) fail("タグの upsert に失敗", upsertError);

  const { data, error } = await supabase
    .from("tags")
    .select("id, name")
    .in("name", names);
  if (error) fail("タグの取得に失敗", error);

  for (const row of data ?? []) map.set(row.name as string, row.id as string);
  return map;
}

/**
 * 学びを 1 件保存し、タグを紐づける。
 */
export async function insertKnowledge(
  supabase: SupabaseClient,
  input: {
    question: string;
    answer: string;
    context?: string;
    source?: string;
    tags: string[];
  },
): Promise<KnowledgeRow> {
  const { data, error } = await supabase
    .from("knowledge_items")
    .insert({
      question: input.question,
      answer: input.answer,
      context: input.context ?? null,
      source: input.source ?? null,
    })
    .select()
    .single();
  if (error) fail("学びの保存に失敗", error);

  const row = data as KnowledgeRow;

  if (input.tags.length > 0) {
    const tagMap = await ensureTags(supabase, input.tags);
    const links = input.tags
      .map((name) => tagMap.get(name))
      .filter((id): id is string => Boolean(id))
      .map((tag_id) => ({ knowledge_item_id: row.id, tag_id }));
    const { error: linkError } = await supabase
      .from("knowledge_item_tags")
      .upsert(links, { ignoreDuplicates: true });
    if (linkError) fail("学びとタグの紐づけに失敗", linkError);
  }

  return row;
}

/**
 * 条件を指定して学びを抽出する。tags はいずれか 1 つでも一致すればヒット（OR）。
 */
export async function listKnowledge(
  supabase: SupabaseClient,
  opts: { tags?: string[]; unquizzedOnly?: boolean; limit?: number },
): Promise<KnowledgeWithTags[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

  // タグ絞り込み: 指定タグ id に紐づく knowledge_item_id を集める
  let idFilter: Set<string> | null = null;
  if (opts.tags && opts.tags.length > 0) {
    const { data: tagRows, error: tagErr } = await supabase
      .from("tags")
      .select("id")
      .in("name", opts.tags);
    if (tagErr) fail("タグの解決に失敗", tagErr);
    const tagIds = (tagRows ?? []).map((r) => r.id as string);
    if (tagIds.length === 0) return [];

    const { data: linkRows, error: linkErr } = await supabase
      .from("knowledge_item_tags")
      .select("knowledge_item_id")
      .in("tag_id", tagIds);
    if (linkErr) fail("タグ紐づけの取得に失敗", linkErr);
    idFilter = new Set((linkRows ?? []).map((r) => r.knowledge_item_id as string));
    if (idFilter.size === 0) return [];
  }

  // クイズ化済み判定用に source_knowledge_id を集計
  const { data: quizRows, error: quizErr } = await supabase
    .from("quizzes")
    .select("source_knowledge_id");
  if (quizErr) fail("クイズ件数の取得に失敗", quizErr);
  const quizCount = new Map<string, number>();
  for (const r of quizRows ?? []) {
    const sid = r.source_knowledge_id as string | null;
    if (sid) quizCount.set(sid, (quizCount.get(sid) ?? 0) + 1);
  }

  let query = supabase
    .from("knowledge_items")
    .select("*, knowledge_item_tags(tags(name))")
    .order("created_at", { ascending: false });
  if (idFilter) query = query.in("id", [...idFilter]);

  const { data, error } = await query;
  if (error) fail("学びの一覧取得に失敗", error);

  const items: KnowledgeWithTags[] = (data ?? []).map((row: any) => {
    const tags: string[] = (row.knowledge_item_tags ?? [])
      .map((l: any) => l.tags?.name)
      .filter((n: unknown): n is string => typeof n === "string");
    const { knowledge_item_tags, ...rest } = row;
    return {
      ...(rest as KnowledgeRow),
      tags,
      quiz_count: quizCount.get(row.id as string) ?? 0,
    };
  });

  const filtered = opts.unquizzedOnly
    ? items.filter((i) => i.quiz_count === 0)
    : items;

  return filtered.slice(0, limit);
}

/**
 * 生成済みクイズを 1 件保存し、タグを紐づける。
 */
export async function insertQuiz(
  supabase: SupabaseClient,
  input: SaveQuizInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("quizzes")
    .insert({
      question: input.question,
      choices: input.choices,
      correct_answer: input.correctAnswer,
      explanation: input.explanation ?? null,
      source_knowledge_id: input.sourceKnowledgeId ?? null,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error) fail("クイズの保存に失敗", error);

  const quizId = (data as { id: string }).id;

  if (input.tags.length > 0) {
    const tagMap = await ensureTags(supabase, input.tags);
    const links = input.tags
      .map((name) => tagMap.get(name))
      .filter((id): id is string => Boolean(id))
      .map((tag_id) => ({ quiz_id: quizId, tag_id }));
    const { error: linkError } = await supabase
      .from("quiz_tags")
      .upsert(links, { ignoreDuplicates: true });
    if (linkError) fail("クイズとタグの紐づけに失敗", linkError);
  }

  return { id: quizId };
}

/**
 * タグ別の正答率集計を取得する。閾値（要復習判定）は呼び出し側で適用する。
 */
export async function getTagStats(
  supabase: SupabaseClient,
  tag?: string,
): Promise<TagStatRow[]> {
  let query = supabase
    .from("tag_stats")
    .select("*")
    .order("total_attempts", { ascending: false });
  if (tag) query = query.eq("tag_name", tag);

  const { data, error } = await query;
  if (error) fail("タグ集計の取得に失敗", error);
  return (data ?? []) as TagStatRow[];
}

/**
 * 学びが存在するか確認する（save_quiz の source_knowledge_id 検証用）。
 */
export async function knowledgeExists(
  supabase: SupabaseClient,
  id: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("knowledge_items")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) fail("学びの存在確認に失敗", error);
  return Boolean(data);
}
