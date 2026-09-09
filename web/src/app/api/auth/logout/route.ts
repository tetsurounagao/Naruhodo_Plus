import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { handle, ok } from "../../../../lib/http";

export const POST = handle(async () => {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return ok({ ok: true });
});
