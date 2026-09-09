import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import dotenv from "dotenv";

// mcp-server/.env.local を読み込む（既に設定済みの環境変数は上書きしない）。
// MCP クライアントから env を渡された場合はそちらが優先される。
const here = dirname(fileURLToPath(import.meta.url));
const envLocal = resolve(here, "..", ".env.local");
if (existsSync(envLocal)) {
  dotenv.config({ path: envLocal });
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `環境変数 ${name} が未設定です。mcp-server/.env.local を確認してください（雛形: .env.example）`,
    );
  }
  return value.trim();
}

export interface Config {
  /** Supabase の API URL（例: https://xxxx.supabase.co） */
  supabaseUrl: string;
  /** Supabase の Secret key（service role）。RLS を貫通する */
  supabaseServiceRoleKey: string;
  /** このサーバーを呼び出している AI 名。created_by に記録する */
  clientName: string;
  /** true のとき add_knowledge を下書き→確定の 2 段階にする */
  previewBeforeSave: boolean;
}

export function loadConfig(): Config {
  return {
    supabaseUrl: required("SUPABASE_URL").replace(/\/+$/, ""),
    supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    clientName: (process.env.MCP_CLIENT_NAME ?? "unknown").trim() || "unknown",
    previewBeforeSave:
      (process.env.NARUHODO_PREVIEW_BEFORE_SAVE ?? "true").trim().toLowerCase() !==
      "false",
  };
}
