import "server-only";
import { getSupabaseAdmin } from "./supabase/admin";
import { HttpError } from "./auth";
import {
  MAX_POINTS_PER_ANSWER,
  TREE_MAX_EXP,
  UNSURE_MAX_POINTS,
  treeInfo,
  type TreeInfo,
} from "./tree";

/**
 * ポイントの記録と、神殿の木に捧げる処理（#93）。
 * 得点の計算（コンボ・大当たり）は /play の画面側で行うので、ここでは解答の中身と照らして上限だけ確かめる。
 */

/** 解答してからこの時間を過ぎた解答にはポイントを付けない（あとから水増しできないように） */
const EARN_WINDOW_MS = 30 * 60_000;

function must<T>(res: { data: T | null; error: { message: string } | null }, ctx: string): T {
  if (res.error) throw new Error(`${ctx}: ${res.error.message}`);
  return res.data as T;
}

/** 解答 1 件ぶんの獲得ポイントを記録する（同じ解答に 2 回送られたら上書き）。 */
export async function recordEarning(attemptId: string, points: number): Promise<void> {
  if (!Number.isInteger(points) || points < 0) throw new HttpError(400, "points は 0 以上の整数で指定してください");
  const supabase = getSupabaseAdmin();
  const row = must(
    await supabase
      .from("quiz_attempts")
      .select("is_correct, confidence, answered_at")
      .eq("id", attemptId)
      .maybeSingle(),
    "quiz_attempts 取得",
  ) as { is_correct: boolean; confidence: string | null; answered_at: string } | null;
  if (!row) throw new HttpError(404, "解答が見つかりません");
  if (Date.now() - new Date(row.answered_at).getTime() > EARN_WINDOW_MS)
    throw new HttpError(409, "時間が経った解答にはポイントを付けられません");
  const cap = !row.is_correct ? 0 : row.confidence === "unsure" ? UNSURE_MAX_POINTS : MAX_POINTS_PER_ANSWER;
  if (points > cap) throw new HttpError(400, `この解答で得られるポイントは ${cap} までです`);
  must(
    await supabase
      .from("point_earnings")
      .upsert({ attempt_id: attemptId, points }, { onConflict: "attempt_id" })
      .select("id"),
    "ポイントの記録",
  );
}

/** 解いた後に取り下げた問題のポイントを戻す。 */
export async function removeEarning(attemptId: string): Promise<void> {
  must(
    await getSupabaseAdmin().from("point_earnings").delete().eq("attempt_id", attemptId).select("id"),
    "ポイントの取り消し",
  );
}

function toInfo(rows: { balance: number | string; exp: number | string }[] | null): TreeInfo {
  const r = rows?.[0];
  return treeInfo({ balance: Number(r?.balance ?? 0), exp: Number(r?.exp ?? 0) });
}

export async function getTree(): Promise<TreeInfo> {
  return toInfo(must(await getSupabaseAdmin().rpc("tree_state"), "木の状態の取得"));
}

/** 木に捧げる。残高不足・Lv99 超えは 409。 */
export async function offerToTree(amount: number): Promise<TreeInfo> {
  if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(400, "amount は 1 以上の整数で指定してください");
  const res = await getSupabaseAdmin().rpc("offer_to_tree", { p_amount: amount, p_max_exp: TREE_MAX_EXP });
  if (res.error) {
    if (res.error.message.includes("insufficient points")) throw new HttpError(409, "ポイントが足りません");
    if (res.error.message.includes("exceeds max level")) throw new HttpError(409, "木はもう最大レベルです");
    throw new Error(`木に捧げる: ${res.error.message}`);
  }
  return toInfo(res.data);
}
