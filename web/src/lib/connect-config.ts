import "server-only";

/**
 * /connect セットアップウィザードの純ロジック。
 * 「貼られた値」から接続設定を組み立て・検証する。ここに副作用は持たせない。
 */

/** REST / Auth に使ってよいホスト。 */
const SUPABASE_API_HOST = /^[a-z0-9-]+\.supabase\.co$/i;
/** DB(pooler / direct) に使ってよいホスト。 */
const SUPABASE_DB_HOST = /(^|\.)pooler\.supabase\.com$|^[a-z0-9-]+\.supabase\.co$/i;

export interface WizardInput {
  apiUrl: string;
  anonKey: string;
  serviceKey: string;
  /** Session pooler の接続文字列（Supabase → Connect でコピーするやつ） */
  dbUrl: string;
  /** URI に記号入りパスワードを含めたくない場合の生パスワード */
  dbPassword?: string;
  groqKey?: string;
  clientName?: string;
}

export function projectRefFromUrl(apiUrl: string): string | null {
  try {
    const h = new URL(apiUrl).hostname;
    const m = h.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function normalizeApiUrl(raw: string): string {
  const t = raw.trim().replace(/\/+$/, "");
  // ref だけ渡された場合も許容する
  if (/^[a-z0-9-]+$/i.test(t)) return `https://${t}.supabase.co`;
  return t;
}

export function isAllowedApiHost(apiUrl: string): boolean {
  try {
    return SUPABASE_API_HOST.test(new URL(apiUrl).hostname);
  } catch {
    return false;
  }
}

export interface DbParts {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/** pooler 接続文字列（+ 任意の生パスワード）を pg 用の設定に分解する。 */
export function parseDbUrl(
  dbUrl: string,
  passwordOverride?: string,
): DbParts | { error: string } {
  let u: URL;
  try {
    u = new URL(dbUrl.trim());
  } catch {
    return {
      error:
        "DB 接続文字列を解析できません（Supabase → Connect → Session pooler の URI を貼ってください）",
    };
  }
  if (!SUPABASE_DB_HOST.test(u.hostname)) {
    return { error: `許可されていない DB ホストです: ${u.hostname}` };
  }
  const password =
    (passwordOverride ?? "").trim() || decodeURIComponent(u.password);
  if (!password || password === "[YOUR-PASSWORD]") {
    return {
      error:
        "DB パスワードが未指定です（URI に含めるか、パスワード欄に入力してください）",
    };
  }
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username) || "postgres",
    password,
    database: u.pathname.replace(/^\//, "") || "postgres",
  };
}

export interface EnvFiles {
  "web/.env.local": string;
  "mcp-server/.env.local": string;
  ".env": string;
}

/** scripts/setup.mjs と同じ内容の .env 群を生成する。 */
export function buildEnvFiles(v: WizardInput): EnvFiles {
  const url = normalizeApiUrl(v.apiUrl);
  const webLines = [
    `NEXT_PUBLIC_SUPABASE_URL=${url}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${v.anonKey.trim()}`,
    `SUPABASE_SERVICE_ROLE_KEY=${v.serviceKey.trim()}`,
    ...(v.groqKey?.trim() ? [`GROQ_API_KEY=${v.groqKey.trim()}`] : []),
  ];
  const mcpLines = [
    `SUPABASE_URL=${url}`,
    `SUPABASE_SERVICE_ROLE_KEY=${v.serviceKey.trim()}`,
    `MCP_CLIENT_NAME=${v.clientName?.trim() || "claude"}`,
    `NARUHODO_PREVIEW_BEFORE_SAVE=true`,
  ];
  const rootLines = [
    `# npm run db:migrate 用。アプリ実行時には使わない`,
    `DATABASE_URL=${v.dbUrl.trim()}`,
    ...(v.dbPassword?.trim() ? [`DATABASE_PASSWORD=${v.dbPassword.trim()}`] : []),
  ];
  return {
    "web/.env.local": webLines.join("\n") + "\n",
    "mcp-server/.env.local": mcpLines.join("\n") + "\n",
    ".env": rootLines.join("\n") + "\n",
  };
}

/** Vercel の Environment Variables に貼る用（web が必要とする分だけ）。 */
export function buildVercelBlock(v: WizardInput): string {
  const url = normalizeApiUrl(v.apiUrl);
  return (
    [
      `NEXT_PUBLIC_SUPABASE_URL=${url}`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=${v.anonKey.trim()}`,
      `SUPABASE_SERVICE_ROLE_KEY=${v.serviceKey.trim()}`,
      ...(v.groqKey?.trim() ? [`GROQ_API_KEY=${v.groqKey.trim()}`] : []),
    ].join("\n") + "\n"
  );
}

/**
 * ウィザード用 API を有効にしてよいか。
 * - 本番(Vercel)で全 env が揃っている＝設定済みなら無効（余計な攻撃面を残さない）
 * - 開発中、または env が欠けている、または明示フラグがあれば有効
 */
export function wizardEnabled(): boolean {
  if (process.env.ENABLE_SETUP_WIZARD === "1") return true;
  if (process.env.NODE_ENV !== "production") return true;
  const core = [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ];
  return core.some((x) => !x || !x.trim());
}

/** ローカル実行（= .env.local を書き出してよい環境）か。 */
export function canWriteEnvFiles(): boolean {
  return (
    wizardEnabled() && !process.env.VERCEL && process.env.NODE_ENV !== "production"
  );
}
