import type { SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "./config.js";

/** 各ツールハンドラに渡す共有コンテキスト */
export interface ToolContext {
  supabase: SupabaseClient;
  config: Config;
}
