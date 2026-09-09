# Naruhodo+

業務やチュートリアル中に生じた疑問・学びを「なるほど」で終わらせずに蓄積し、そこから選択式の復習クイズを自動生成して知識の定着を図る個人用ツール。

複数のAIエージェント（Claude、Codex 等）から同じ MCP サーバー・DB にアクセスできることを必須要件とする。詳細は [docs/requirements.md](docs/requirements.md) を参照。

## 構成

npm workspaces によるモノレポ。

| ディレクトリ | 役割 | 技術スタック |
| --- | --- | --- |
| `mcp-server/` | AIエージェントからの知識登録・クイズ保存を受ける MCP サーバー | TypeScript / Node.js（stdio 接続） |
| `web/` | 蓄積した知識の閲覧とクイズ復習を行う Web アプリ | TypeScript / Next.js（Vercel デプロイ） |
| `docs/` | 要件定義書などのドキュメント | — |

DB は Supabase（PostgreSQL）、認証は Supabase Auth を利用する。ブラウザは Supabase に直接接続せず、必ず Next.js の API ルートを経由する。

## セットアップ

```bash
npm install
```

ルートで一度実行すれば、各 workspace の依存関係がまとめて解決される。

## mcp-server の起動

```bash
npm run dev:mcp
```

stdio で待ち受ける MCP サーバーが起動する。AIエージェント側の MCP 設定から、このプロセスをコマンドとして登録して接続する。

※ 実装は未着手。現状は雛形のみ。

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
