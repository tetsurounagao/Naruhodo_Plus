/**
 * Naruhodo+ MCP サーバー（エントリポイント）
 *
 * stdio 接続で AIエージェント（Claude / Codex 等）からの呼び出しを受け、
 * 学びの登録・一覧取得・クイズ保存・タグ集計を行う。
 * 生成 AI ロジックは持たず、Supabase への CRUD に徹する。
 *
 * 振る舞いのルール（いつ保存するか・機密情報の抽象化・タグの使い回し）は
 * 各ツールの description に集約している（src/tools/*.ts）。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createSupabaseClient } from "./supabase.js";
import { registerAllTools } from "./tools/index.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const supabase = createSupabaseClient(config);

  const server = new McpServer({
    name: "naruhodo-plus",
    version: "0.1.0",
  });

  registerAllTools(server, { supabase, config });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdio サーバーなので stdout は MCP 通信専用。ログは stderr に出す。
  console.error(
    `[naruhodo-plus] MCP サーバー起動: client=${config.clientName} preview=${config.previewBeforeSave}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
