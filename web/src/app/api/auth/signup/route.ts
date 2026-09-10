import { getSupabaseAdmin } from "../../../../lib/supabase/admin";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { handle, ok, fail } from "../../../../lib/http";

/**
 * 初回ユーザーの登録（ブートストラップ）。
 * まだユーザーが 0 人のときだけ受け付ける。以降は Supabase ダッシュボードで追加する。
 * SMTP 未設定でも使えるよう admin.createUser + email_confirm:true で作る。
 */

async function usersExist(): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().auth.admin.listUsers({
    page: 1,
    perPage: 1,
  });
  if (error) throw new Error(error.message);
  return data.users.length > 0;
}

export const GET = handle(async () => {
  return ok({ available: !(await usersExist()) });
});

export const POST = handle(async (req) => {
  if (await usersExist()) {
    return fail(403, "既にユーザーが登録されています。追加は Supabase ダッシュボードで行ってください");
  }

  const body = (await req.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null;
  if (!body?.email || !body?.password) {
    return fail(400, "email と password は必須です");
  }
  if (body.password.length < 8) {
    return fail(400, "パスワードは 8 文字以上にしてください");
  }

  const admin = getSupabaseAdmin();
  const { error: createErr } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
  });
  if (createErr) return fail(400, createErr.message);

  // そのままログイン状態にする
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  });
  if (error || !data.user) {
    // 作成はできたのでログインだけ促す
    return ok({ user: { email: body.email }, needsLogin: true });
  }
  return ok({ user: { id: data.user.id, email: data.user.email } });
});
