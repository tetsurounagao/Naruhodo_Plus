import { requireUser } from "../../../../lib/auth";
import { getSupabaseAdmin } from "../../../../lib/supabase/admin";
import { handle, ok } from "../../../../lib/http";

/**
 * セットアップの進捗チェック。各項目は個別に try/catch し、1 つ失敗しても全体は返す。
 * 値そのものは返さない（設定済みかどうかの真偽のみ）。
 */

interface Check {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
  optional?: boolean;
}

async function tableExists(table: string): Promise<boolean> {
  try {
    const { error } = await getSupabaseAdmin()
      .from(table)
      .select("*", { head: true, count: "exact" });
    return !error;
  } catch {
    return false;
  }
}

export const GET = handle(async () => {
  await requireUser();

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    GROQ_API_KEY: !!process.env.GROQ_API_KEY,
  };

  const checks: Check[] = [];

  checks.push({
    id: "env-core",
    label: "Supabase の環境変数（URL / Publishable / Secret）",
    ok:
      env.NEXT_PUBLIC_SUPABASE_URL &&
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      env.SUPABASE_SERVICE_ROLE_KEY,
    detail: "未設定なら npm run setup または web/.env.local / Vercel の環境変数を確認",
  });

  let supabaseOk = false;
  try {
    const { error } = await getSupabaseAdmin()
      .from("knowledge_items")
      .select("id", { head: true, count: "exact" });
    // relation が無い = 接続はできているがスキーマ未適用
    supabaseOk = !error || /does not exist|schema cache/i.test(error.message);
  } catch (e) {
    supabaseOk = false;
    checks.push({
      id: "supabase-conn",
      label: "Supabase への接続",
      ok: false,
      detail: (e as Error).message,
    });
  }
  if (!checks.find((c) => c.id === "supabase-conn")) {
    checks.push({
      id: "supabase-conn",
      label: "Supabase への接続",
      ok: supabaseOk,
    });
  }

  const [k, q, ql, ts] = await Promise.all([
    tableExists("knowledge_items"),
    tableExists("quizzes"),
    tableExists("quiz_links"),
    tableExists("tag_stats"),
  ]);
  checks.push({
    id: "schema",
    label: "スキーマ適用（knowledge_items / quizzes / quiz_links / tag_stats）",
    ok: k && q && ql && ts,
    detail: k && q && ql && ts ? undefined : "npm run db:migrate を実行",
  });

  let usersExist = false;
  try {
    const { data } = await getSupabaseAdmin().auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    usersExist = (data?.users.length ?? 0) > 0;
  } catch {
    /* ignore */
  }
  checks.push({
    id: "user",
    label: "ログインユーザー",
    ok: usersExist,
    detail: usersExist ? undefined : "/login からアカウントを作成",
  });

  checks.push({
    id: "groq",
    label: "Groq API キー（用語調べ機能・任意）",
    ok: env.GROQ_API_KEY,
    optional: true,
    detail: env.GROQ_API_KEY ? undefined : "未設定なら用語調べ機能は無効",
  });

  return ok({
    checks,
    cwdHint: process.cwd(),
  });
});
