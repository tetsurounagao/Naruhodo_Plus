# Naruhodo+

業務やチュートリアル中に生じた疑問・学びを「なるほど」で終わらせずに蓄積し、そこから選択式の復習クイズを自動生成して知識の定着を図る個人用ツール。

複数のAIエージェント（Claude、Codex 等）から同じ MCP サーバー・DB にアクセスできることを必須要件とする。詳細は [docs/requirements.md](docs/requirements.md) を参照。

## 構成

npm workspaces によるモノレポ。

| ディレクトリ | 役割 | 技術スタック |
| --- | --- | --- |
| `mcp-server/` | AIエージェントからの知識登録・クイズ保存を受ける MCP サーバー | TypeScript / Node.js（stdio 接続） |
| `web/` | 蓄積した知識の閲覧とクイズ復習を行う Web アプリ | TypeScript / Next.js（Vercel デプロイ） |
| `supabase/` | DB マイグレーション SQL と適用手順 | Supabase（PostgreSQL） |
| `docs/` | 要件定義書などのドキュメント | — |

DB は Supabase（PostgreSQL）、認証は Supabase Auth を利用する。ブラウザは Supabase に直接接続せず、必ず Next.js の API ルートを経由する。スキーマの適用方法は [supabase/README.md](supabase/README.md) を参照。

## セットアップ

```bash
npm install
```

ルートで一度実行すれば、各 workspace の依存関係がまとめて解決される。

## mcp-server の起動

```bash
npm run dev:mcp
```

stdio で待ち受ける MCP サーバーが起動する。ビルドして使う場合は `mcp-server/` で `npm run build && npm start`。

AI エージェントへの登録方法（`claude mcp add` / Codex の `config.toml` 等）、ツール一覧、環境変数は [mcp-server/README.md](mcp-server/README.md) を参照。

実装済みツール: `add_knowledge` / `confirm_knowledge` / `list_knowledge` / `save_quiz` / `get_tag_stats`。

## web の起動

```bash
npm run dev:web
```

開発サーバーが `http://localhost:3000` で起動する。

※ 実装は未着手。現状は雛形のみ。

## 環境変数

各ディレクトリの `.env.example` をコピーして `.env.local` を作り、実際の値を入れる。`.env.local` はコミットしない。

```bash
cp mcp-server/.env.example mcp-server/.env.local
cp web/.env.example web/.env.local
```

必要な値（Supabase の API URL / Publishable key / Secret key）は Supabase ダッシュボードの Settings → API から取得する。
