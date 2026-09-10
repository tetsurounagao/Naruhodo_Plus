/**
 * .env / 環境変数から Postgres 接続設定を組み立てる共有ユニット。
 * migrate.mjs / backup.mjs / restore.mjs が同じロジックを使う。
 *
 * - DATABASE_URL を new URL() で分解（connectionString 任せにしない）
 * - パスワードに記号が含まれて URL が壊れる場合に備え、DATABASE_PASSWORD で上書き可能
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "..", "..");

/** リポジトリ直下の .env を素朴にパースする（export 前置・クォート許容）。 */
export function readEnvFile(root = repoRoot) {
  const out = {};
  const envPath = resolve(root, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

/**
 * pg.Client に渡す接続設定を返す。失敗時は分かりやすいメッセージで例外。
 * @returns {{ host: string, port: number, user: string, password: string, database: string, ssl: object }}
 */
export function resolveDbConfig({ root = repoRoot } = {}) {
  const fileEnv = readEnvFile(root);
  const url = process.env.DATABASE_URL || fileEnv.DATABASE_URL || null;
  const passwordOverride =
    process.env.DATABASE_PASSWORD || fileEnv.DATABASE_PASSWORD || undefined;

  if (!url) {
    throw new Error(
      "DATABASE_URL が見つかりません。npm run setup を実行するか .env に設定してください。",
    );
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      "DATABASE_URL を解析できませんでした。パスワードに記号が含まれる場合は、\n" +
        "URL のパスワード部分を x などに置き換え、生パスワードを DATABASE_PASSWORD に書いてください。",
    );
  }

  const config = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    user: decodeURIComponent(parsed.username),
    password: passwordOverride ?? decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, "") || "postgres",
    ssl: { rejectUnauthorized: false },
  };
  if (!config.password) {
    throw new Error(
      "パスワードが空です。DATABASE_PASSWORD に実際の DB パスワードを設定してください。",
    );
  }
  return { config, usedPasswordOverride: Boolean(passwordOverride) };
}

/** 接続エラー時の共通ヒント文（各スクリプトの catch で使う）。 */
export function authHint(message) {
  // pooler が「プロジェクト参照 / ユーザー名が違う」と言うケース
  // 例: "Tenant or user not found" / "tenant/user postgres.xxx not found"
  if (/tenant\s*(?:or|\/)\s*user\b.*not found/i.test(message)) {
    return [
      "",
      "ヒント: 接続先のユーザー名 / プロジェクト参照が違う可能性があります。",
      "  - Session pooler の URI をそのまま使う（ユーザー名は postgres.<project-ref>）",
      "  - <project-ref> は Supabase API URL のサブドメイン（https://<project-ref>.supabase.co）",
      "  - Supabase → Connect → Session pooler の文字列をコピーし直すのが確実",
    ].join("\n");
  }
  if (!/password authentication failed/i.test(message)) return "";
  return [
    "",
    "ヒント:",
    "  - DATABASE_URL の [YOUR-PASSWORD] を実際の DB パスワードに置き換えたか確認",
    "  - パスワードに記号(+ / @ ? # 等)が含まれると URI が壊れます。",
    "    Supabase → Settings → Database → Reset database password で記号なしに再設定するのが確実",
    "  - Session pooler の URI（ユーザー名は postgres.<project-ref>、ホストは *.pooler.supabase.com:5432）を使う",
  ].join("\n");
}
