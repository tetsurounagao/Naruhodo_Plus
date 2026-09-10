import { handle, ok, fail } from "../../../../lib/http";
import {
  buildEnvFiles,
  buildVercelBlock,
  canWriteEnvFiles,
  isAllowedApiHost,
  normalizeApiUrl,
  parseDbUrl,
  projectRefFromUrl,
  wizardEnabled,
  type WizardInput,
} from "../../../../lib/connect-config";

export const runtime = "nodejs";

interface Check {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** REST/Auth の疎通を 1 本試す（apikey ヘッダのみ）。 */
async function ping(
  base: string,
  path: string,
  key: string,
): Promise<{ ok: boolean; status: number; detail?: string }> {
  try {
    const res = await fetchWithTimeout(`${base}${path}`, {
      headers: { apikey: key },
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, detail: (e as Error).message };
  }
}

export const POST = handle(async (req) => {
  if (!wizardEnabled()) {
    return fail(403, "セットアップウィザードは無効です（設定済み）。再設定は ENABLE_SETUP_WIZARD=1 で有効化してください。");
  }

  const body = (await req.json().catch(() => null)) as Partial<WizardInput> | null;
  if (!body) return fail(400, "JSON ボディが必要です");

  const v: WizardInput = {
    apiUrl: normalizeApiUrl(String(body.apiUrl ?? "")),
    anonKey: String(body.anonKey ?? "").trim(),
    serviceKey: String(body.serviceKey ?? "").trim(),
    dbUrl: String(body.dbUrl ?? "").trim(),
    dbPassword: body.dbPassword ? String(body.dbPassword).trim() : undefined,
    groqKey: body.groqKey ? String(body.groqKey).trim() : undefined,
    clientName: body.clientName ? String(body.clientName).trim() : undefined,
  };

  const checks: Check[] = [];
  let usersExist = false;

  // 1. API URL の形
  const ref = projectRefFromUrl(v.apiUrl);
  const hostOk = isAllowedApiHost(v.apiUrl);
  checks.push({
    id: "api-url",
    label: "API URL（https://<ref>.supabase.co）",
    ok: hostOk && !!ref,
    detail: hostOk ? undefined : "Supabase の API URL を入力してください",
  });

  // 2/3. キーの有効性
  if (hostOk) {
    if (v.anonKey) {
      // anon(publishable) は RLS 全拒否で REST を読めないので Auth で検証する
      const r = await ping(v.apiUrl, "/auth/v1/health", v.anonKey);
      checks.push({
        id: "key-anon",
        label: "Publishable (anon) key が有効",
        ok: r.ok,
        detail: r.ok
          ? undefined
          : `HTTP ${r.status}${r.detail ? ` / ${r.detail}` : ""}（キーを確認）`,
      });
    } else {
      checks.push({ id: "key-anon", label: "Publishable (anon) key", ok: false, detail: "未入力" });
    }

    if (v.serviceKey) {
      // service は RLS を貫通するので REST ルートが 200 になる
      const r = await ping(v.apiUrl, "/rest/v1/", v.serviceKey);
      checks.push({
        id: "key-service",
        label: "Secret (service_role) key が有効",
        ok: r.ok,
        detail: r.ok ? undefined : `HTTP ${r.status}${r.detail ? ` / ${r.detail}` : ""}（キーを確認）`,
      });

      // 4. Auth Admin でユーザー数（初回ユーザー判定）
      try {
        const res = await fetchWithTimeout(
          `${v.apiUrl}/auth/v1/admin/users?page=1&per_page=1`,
          { headers: { apikey: v.serviceKey, Authorization: `Bearer ${v.serviceKey}` } },
        );
        if (res.ok) {
          const j = (await res.json().catch(() => ({}))) as { users?: unknown[] };
          usersExist = Array.isArray(j.users) && j.users.length > 0;
          checks.push({
            id: "auth-admin",
            label: "Auth Admin API に到達",
            ok: true,
            detail: usersExist ? "既にユーザーあり" : "ユーザー 0 人（/login で作成可）",
          });
        } else {
          checks.push({
            id: "auth-admin",
            label: "Auth Admin API に到達",
            ok: false,
            detail: `HTTP ${res.status}（Secret key を確認）`,
          });
        }
      } catch (e) {
        checks.push({ id: "auth-admin", label: "Auth Admin API に到達", ok: false, detail: (e as Error).message });
      }
    } else {
      checks.push({ id: "rest-service", label: "Secret (service_role) key", ok: false, detail: "未入力" });
    }
  }

  // 5/6. DB（pooler）接続 + スキーマ
  const parsed = parseDbUrl(v.dbUrl, v.dbPassword);
  if ("error" in parsed) {
    checks.push({ id: "db-connect", label: "DB 接続文字列", ok: false, detail: parsed.error });
  } else {
    let client: { query: (q: string) => Promise<{ rows: Array<Record<string, unknown>> }>; end: () => Promise<void> } | null = null;
    try {
      const pg = (await import("pg")).default;
      client = new pg.Client({
        host: parsed.host,
        port: parsed.port,
        user: parsed.user,
        password: parsed.password,
        database: parsed.database,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 8000,
        statement_timeout: 8000,
      });
      await (client as unknown as { connect: () => Promise<void> }).connect();
      await client.query("select 1");
      checks.push({ id: "db-connect", label: "DB（Session pooler）に接続", ok: true });

      const reg = await client.query("select to_regclass('public.quizzes') as t");
      const applied = !!reg.rows[0]?.t;
      checks.push({
        id: "db-schema",
        label: "スキーマ適用済み（quizzes テーブル）",
        ok: applied,
        detail: applied ? undefined : "npm run db:migrate を実行",
      });
    } catch (e) {
      const msg = (e as Error).message;
      checks.push({
        id: "db-connect",
        label: "DB（Session pooler）に接続",
        ok: false,
        detail: /tenant or user not found/i.test(msg)
          ? "ユーザー名 / project-ref の誤り。Connect → Session pooler の URI を貼り直してください"
          : /password authentication failed/i.test(msg)
            ? "DB パスワードが違います"
            : msg,
      });
    } finally {
      if (client) await client.end().catch(() => {});
    }
  }

  const required = checks.filter((c) => c.id !== "db-schema");
  const allOk = required.every((c) => c.ok);

  return ok({
    ok: allOk,
    checks,
    projectRef: ref,
    usersExist,
    canWrite: canWriteEnvFiles(),
    envFiles: allOk ? buildEnvFiles(v) : null,
    vercelBlock: allOk ? buildVercelBlock(v) : null,
  });
});
