import { requireUser } from "../../../../lib/auth";
import { handleParams, ok, fail } from "../../../../lib/http";
import { setTagColor } from "../../../../lib/queries";

export const PATCH = handleParams<{ id: string }>(async (req, { id }) => {
  await requireUser();
  const body = (await req.json().catch(() => null)) as
    | { color?: string | null }
    | null;
  if (!body || !("color" in body)) return fail(400, "color を指定してください");

  try {
    const updated = await setTagColor(id, body.color ?? null);
    return ok(updated);
  } catch (e) {
    const m = e instanceof Error ? e.message : "unknown";
    if (m === "tag not found") return fail(404, "タグが見つかりません");
    if (m.startsWith("color")) return fail(400, m);
    throw e;
  }
});
