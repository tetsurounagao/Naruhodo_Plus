#!/usr/bin/env node
/**
 * セットアップ。質問に答えると以下を書き出す:
 *   - mcp-server/.env.local
 *   - web/.env.local
 *   - .env                （DATABASE_URL。npm run db:migrate が使う）
 *
 * 既存ファイルは上書きしない（--force で上書き）。値はどこにも送信しない。
 *
 * 非対話（TTY でない / CI）では環境変数から読む:
 *   SETUP_SUPABASE_URL, SETUP_ANON_KEY, SETUP_SERVICE_KEY, SETUP_DATABASE_URL,
 *   SETUP_DATABASE_PASSWORD(任意), SETUP_GROQ_KEY(任意), SETUP_CLIENT_NAME(既定 claude)
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv, env, exit } from "node:process";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const force = argv.includes("--force");
const interactive = stdin.isTTY && !argv.includes("--from-env");

function readExisting(relPath) {
  const abs = resolve(root, relPath);
  if (!existsSync(abs)) return {};
  const out = {};
  for (const line of readFileSync(abs, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function writeEnv(relPath, lines) {
  const abs = resolve(root, relPath);
  if (existsSync(abs) && !force) {
    console.log(`  skip: ${relPath}（既存。上書きは npm run setup -- --force）`);
    return;
  }
  writeFileSync(abs, lines.join("\n") + "\n", "utf8");
  console.log(`  wrote: ${relPath}`);
}

async function collect() {
  const web = readExisting("web/.env.local");
  const mcp = readExisting("mcp-server/.env.local");
  const rootEnv = readExisting(".env");

  const defaults = {
    supabaseUrl: web.NEXT_PUBLIC_SUPABASE_URL || mcp.SUPABASE_URL || "",
    anonKey: web.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    serviceKey: web.SUPABASE_SERVICE_ROLE_KEY || mcp.SUPABASE_SERVICE_ROLE_KEY || "",
    dbUrl: rootEnv.DATABASE_URL || "",
    dbPassword: rootEnv.DATABASE_PASSWORD || "",
    groqKey: web.GROQ_API_KEY || "",
    clientName: mcp.MCP_CLIENT_NAME || "claude",
  };

  if (!interactive) {
    return {
      supabaseUrl: env.SETUP_SUPABASE_URL || defaults.supabaseUrl,
      anonKey: env.SETUP_ANON_KEY || defaults.anonKey,
      serviceKey: env.SETUP_SERVICE_KEY || defaults.serviceKey,
      dbUrl: env.SETUP_DATABASE_URL || defaults.dbUrl,
      dbPassword: env.SETUP_DATABASE_PASSWORD || defaults.dbPassword,
      groqKey: env.SETUP_GROQ_KEY || defaults.groqKey,
      clientName: env.SETUP_CLIENT_NAME || defaults.clientName,
    };
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const ask = async (label, def, { required = true, secret = false } = {}) => {
    const suffix = def ? ` [${secret ? "****（既存値）" : def}]` : "";
    for (;;) {
      const raw = (await rl.question(`${label}${suffix}: `)).trim();
      const val = raw || def;
      if (val || !required) return val;
      console.log("  必須です。");
    }
  };

  console.log("\nNaruhodo+ セットアップ");
  console.log("値は Supabase ダッシュボード → Settings → API / Connect から取得。\n");
  const out = {
    supabaseUrl: await ask("Supabase API URL (https://xxxx.supabase.co)", defaults.supabaseUrl),
    anonKey: await ask("Supabase Publishable key (sb_publishable_... / anon)", defaults.anonKey, { secret: true }),
    serviceKey: await ask("Supabase Secret key (sb_secret_... / service_role)", defaults.serviceKey, { secret: true }),
    dbUrl: await ask("Supabase DB 接続文字列（Session pooler の URI・*.pooler.supabase.com:5432）", defaults.dbUrl, { secret: true }),
    dbPassword: await ask(
      "DB パスワード（URI に含めているなら空 Enter。記号入りはここに生で貼ると確実）",
      defaults.dbPassword,
      { required: false, secret: true },
    ),
    groqKey: await ask("Groq API key（用語調べ機能・任意。空でスキップ）", defaults.groqKey, { required: false, secret: true }),
    clientName: await ask("MCP 呼び出し元 AI 名", defaults.clientName),
  };
  rl.close();
  return out;
}

async function main() {
  const v = await collect();
  const missing = ["supabaseUrl", "anonKey", "serviceKey", "dbUrl"].filter((k) => !v[k]);
  if (missing.length) {
    console.error(`必須の値が未指定です: ${missing.join(", ")}`);
    exit(1);
  }
  const url = v.supabaseUrl.replace(/\/+$/, "");
  console.log("");

  writeEnv("mcp-server/.env.local", [
    `SUPABASE_URL=${url}`,
    `SUPABASE_SERVICE_ROLE_KEY=${v.serviceKey}`,
    `MCP_CLIENT_NAME=${v.clientName || "claude"}`,
    `NARUHODO_PREVIEW_BEFORE_SAVE=true`,
  ]);
  writeEnv("web/.env.local", [
    `NEXT_PUBLIC_SUPABASE_URL=${url}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${v.anonKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${v.serviceKey}`,
    ...(v.groqKey ? [`GROQ_API_KEY=${v.groqKey}`] : []),
  ]);
  const envLines = [
    `# npm run db:migrate 用。アプリ実行時には使わない`,
    `DATABASE_URL=${v.dbUrl}`,
  ];
  if (v.dbPassword) envLines.push(`DATABASE_PASSWORD=${v.dbPassword}`);
  writeEnv(".env", envLines);

  console.log("\n次のステップ:");
  console.log("  1) npm run db:migrate   # スキーマを適用");
  console.log("  2) npm run dev:web      # http://localhost:3000（または Vercel にデプロイ）");
  console.log("  3) /login でアカウント作成（ユーザーが 0 人のときだけ表示）");
  console.log("  4) npm run build → /setup ページで MCP 登録コマンドを取得");
  console.log("  詳細は docs/setup.md\n");
}

main().catch((e) => {
  console.error(e);
  exit(1);
});
