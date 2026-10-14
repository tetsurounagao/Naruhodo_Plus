import "server-only";
import { getSupabaseAdmin } from "./supabase/admin";
import { listTagStats } from "./queries";
import { getTree } from "./points";
import { jstDateKey, jstDayRange, longestCombo, streakUntil, type DailyReport, type DayAttempt } from "./daily-report";

/** Slack 通知（#95）用に、日本時間の「今日」の成果を集める。集計だけで AI は呼ばない。 */

function must<T>(res: { data: T | null; error: { message: string } | null }, ctx: string): T {
  if (res.error) throw new Error(`${ctx}: ${res.error.message}`);
  return res.data as T;
}

/** 連続学習日数を数えるために見る日数 */
const STREAK_LOOKBACK_DAYS = 400;

export async function collectDailyReport(now = new Date()): Promise<DailyReport> {
  const supabase = getSupabaseAdmin();
  const { key, from, to } = jstDayRange(now);
  const since = new Date(Date.parse(from) - STREAK_LOOKBACK_DAYS * 86_400_000).toISOString();

  const [attemptsRes, earningsRes, pastRes, knowledgeRes, quizzesRes, tagStats, tree] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select("is_correct, confidence")
      .gte("answered_at", from)
      .lt("answered_at", to)
      .order("answered_at", { ascending: true }),
    supabase.from("point_earnings").select("points").gte("created_at", from).lt("created_at", to),
    supabase
      .from("quiz_attempts")
      .select("answered_at")
      .gte("answered_at", since)
      .lt("answered_at", to)
      .order("answered_at", { ascending: false }),
    supabase
      .from("knowledge_items")
      .select("knowledge_item_tags(tags(name))")
      .gte("created_at", from)
      .lt("created_at", to),
    supabase
      .from("quizzes")
      .select("id", { count: "exact", head: true })
      .eq("hidden", false)
      .gte("created_at", from)
      .lt("created_at", to),
    listTagStats(),
    getTree(),
  ]);

  const attempts = must(attemptsRes, "今日の解答の取得") as DayAttempt[];
  const earnings = must(earningsRes, "今日のポイントの取得") as { points: number }[];
  const past = must(pastRes, "解答日の取得") as { answered_at: string }[];
  const knowledge = must(knowledgeRes, "今日の知識の取得") as unknown as {
    knowledge_item_tags: { tags: { name: string } | null }[] | null;
  }[];
  if (quizzesRes.error) throw new Error(`今日のクイズの取得: ${quizzesRes.error.message}`);

  const tagCount = new Map<string, number>();
  for (const k of knowledge)
    for (const t of k.knowledge_item_tags ?? [])
      if (t.tags) tagCount.set(t.tags.name, (tagCount.get(t.tags.name) ?? 0) + 1);

  return {
    date: key,
    answered: attempts.length,
    correct: attempts.filter((a) => a.is_correct).length,
    sureCorrect: attempts.filter((a) => a.is_correct && a.confidence !== "unsure").length,
    points: earnings.reduce((s, e) => s + e.points, 0),
    combo: longestCombo(attempts),
    streak: streakUntil(new Set(past.map((p) => jstDateKey(p.answered_at))), key),
    newKnowledge: knowledge.length,
    newTags: [...tagCount.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
    newQuizzes: quizzesRes.count ?? 0,
    weakTags: tagStats
      .filter((t) => t.weak && t.accuracy !== null)
      .sort((a, b) => Number(a.accuracy) - Number(b.accuracy))
      .slice(0, 3)
      .map((t) => ({ name: t.tag_name, accuracy: Number(t.accuracy) })),
    tree: { level: tree.level, toNext: tree.toNext, maxed: tree.maxed, balance: tree.balance },
  };
}

/**
 * ワークフロービルダーの Webhook（https://hooks.slack.com/triggers/...）か。
 * アプリを入れられないワークスペース向け。ワークフロー側で `text` という変数を作っておく。
 */
export function isWorkflowWebhook(webhookUrl: string): boolean {
  return /^https:\/\/hooks\.slack\.com\/triggers\//.test(webhookUrl);
}

/** Slack の Incoming Webhook / ワークフローの Webhook に送る。 */
export async function postToSlack(webhookUrl: string, text: string): Promise<void> {
  // ワークフローは決めた変数以外を受け付けないことがあるので text だけ送る
  const body = isWorkflowWebhook(webhookUrl) ? { text } : { text, unfurl_links: false };
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Slack への送信に失敗しました: ${res.status} ${await res.text()}`);
}
