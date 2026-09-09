import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "./config.js";

/**
 * service role キーで接続する Supabase クライアント。
 * MCP サーバーはローカルの信頼された処理として扱うため RLS を貫通する。
 * セッションの永続化やトークン更新は不要なので無効化する。
 */
export function createSupabaseClient(config: Config): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
