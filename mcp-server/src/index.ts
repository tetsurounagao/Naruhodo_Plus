/**
 * Naruhodo+ MCP サーバー（エントリポイント）
 *
 * stdio 接続で AIエージェント（Claude / Codex 等）からの呼び出しを受け、
 * 知識の登録・一覧取得・クイズ保存などを行う。
 *
 * 現状は雛形のみ。ツール定義・DB アクセス・機密情報チェックは未実装。
 * 実装予定のツール: add_knowledge, list_knowledge, save_quiz, get_tag_stats
 */

async function main(): Promise<void> {
  // TODO: MCP サーバーの初期化と stdio トランスポートへの接続
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
