import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { handle, ok, fail } from "../../../../lib/http";

export const POST = handle(async (req) => {
  const body = (await req.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null;

  if (!body?.email || !body?.password) {
    return fail(400, "email と password は必須です");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  });

  if (error || !data.user) {
    return fail(401, "メールアドレスまたはパスワードが違います");
  }

  return ok({ user: { id: data.user.id, email: data.user.email } });
});
