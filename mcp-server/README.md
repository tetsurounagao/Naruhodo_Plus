# @naruhodo-plus/mcp-server

Naruhodo+ の MCP サーバー。stdio 接続で AI エージェント（Claude / Codex 等）からの呼び出しを受け、
Supabase に対して学びの登録・抽出、クイズの保存、タグ集計を行う。

生成 AI ロジックは持たず CRUD に徹する。**振る舞いのルール（いつ保存するか・機密情報の抽象化・
タグの使い回し）は各ツールの `description` に集約**している（`src/tools/*.ts`）。エージェント個別の
指示ファイルには重複して書かない。

## セットアップ

```bash
# リポジトリルートで
npm install

# 環境変数
cp mcp-server/.env.example mcp-server/.env.local
#  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY を Supabase の Settings → API から埋める
```

事前に `supabase/migrations/` のスキーマを適用しておくこと（`supabase/README.md` 参照）。

## 起動

```bash
# 開発（ソース変更で自動再起動）
npm run dev:mcp          # ルートから
npm run dev              # mcp-server ディレクトリから

# ビルドして起動
npm run build && npm start   # mcp-server ディレクトリから
```

stdout は MCP 通信専用。ログは stderr に出る。

## MCP クライアントへの登録

ビルド済みの `dist/index.js` を stdio サーバーとして登録する。環境変数はクライアント側の設定でも
渡せるが、未指定なら `mcp-server/.env.local` が読まれる。

### Claude Code

```bash
claude mcp add naruhodo-plus -- node /ABSOLUTE/PATH/naruhodo-plus/mcp-server/dist/index.js
```

### Codex CLI（`~/.codex/config.toml`）

```toml
[mcp_servers.naruhodo-plus]
command = "node"
args = ["/ABSOLUTE/PATH/naruhodo-plus/mcp-server/dist/index.js"]
```

### 汎用（JSON 形式のクライアント）

```json
{
  "mcpServers": {
    "naruhodo-plus": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/naruhodo-plus/mcp-server/dist/index.js"]
    }
  }
}
```

## ツール一覧

| ツール | 役割 |
| --- | --- |
| `add_knowledge` | 学びを保存。機密情報を正規表現でチェックし、該当時は保存を止める。プレビューON時は下書きと `draft_token` を返す |
| `confirm_knowledge` | `add_knowledge` が返した `draft_token` を確定して実保存 |
| `list_knowledge` | 学びを条件抽出（タグ / 未クイズ化のみ / 件数）。クイズ生成の元データ取得用 |
| `save_quiz` | 生成した選択式クイズを保存。`correct_answer` と `choices` の id 整合をチェック。`created_by` は自動記録 |
| `get_tag_stats` | タグ別の解答回数・正答率を返す（任意）。集計は DB の SQL のみ |

## 環境変数

| 変数 | 既定 | 説明 |
| --- | --- | --- |
| `SUPABASE_URL` | （必須） | Supabase の API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | （必須） | Secret key。RLS を貫通する |
| `MCP_CLIENT_NAME` | `unknown` | 呼び出し元 AI 名。`quizzes.created_by` に記録 |
| `NARUHODO_PREVIEW_BEFORE_SAVE` | `true` | `false` で `add_knowledge` を即保存（2 段階をスキップ） |
| `NARUHODO_SENSITIVE_DOMAINS` | （空） | 追加でブロックしたい社内ドメインをカンマ区切りで |
| `NARUHODO_WEAK_TAG_MIN_ATTEMPTS` | `3` | 要復習判定の最小解答回数 |
| `NARUHODO_WEAK_TAG_MAX_ACCURACY` | `0.6` | 要復習判定の正答率上限 |

## 差し替え可能ユニット（将来のローカル AI 拡張用）

- `src/lib/normalize-tags.ts` — タグの機械的正規化。将来「埋め込みで意味的グルーピングする版」に差し替え可能
- `src/lib/sensitive.ts` — 正規表現による機密情報チェック。将来「ローカル AI による二次チェック版」に差し替え可能

呼び出し側はこの 2 モジュールの公開関数だけを使う。
