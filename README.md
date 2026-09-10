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

セルフホスト型。各自が自分の Supabase・Vercel・PC で動かす。**手順の全体は [docs/setup.md](docs/setup.md)** を参照。

かいつまむと:

```bash
git clone https://github.com/tetsurounagao/Naruhodo_Plus.git
cd Naruhodo_Plus
npm install
npm run setup        # Supabase の値を対話で入力 → .env.local 群を生成
npm run db:migrate   # スキーマ適用
```

Web は Vercel にデプロイ（下のボタン）するか、`npm run dev:web` でローカル起動。
最初のユーザーは `/login` の「アカウント作成」フォームから作る（0 人のときだけ表示）。
ログイン後 `/setup` ページで接続状況の確認と MCP 登録コマンドの取得ができる。

### Vercel デプロイ

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftetsurounagao%2FNaruhodo_Plus&root-directory=web&project-name=naruhodo-plus&repository-name=naruhodo-plus&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY&envDescription=Supabase%20%E3%81%AE%E5%80%A4%EF%BC%88web%2F.env.local%20%E3%81%A8%E5%90%8C%E3%81%98%EF%BC%89)

Root Directory は `web`。デプロイ後、Supabase の Authentication → URL Configuration → Site URL に発行された URL を設定する。

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

開発サーバーが `http://localhost:3000` で起動する。ビルドして使う場合は `web/` で `npm run build && npm start`。

ログインは Supabase Auth（メール＋パスワード）。最初のユーザーは `/login` のアカウント作成フォーム、2 人目以降は Supabase ダッシュボードの Authentication → Add user。画面・API ルート一覧・アーキテクチャは [web/README.md](web/README.md) を参照。

実装済み画面: `/login` / `/`（ホーム）/ `/quizzes` / `/search` / `/review` / `/knowledge` / `/setup`。

## 環境変数

`npm run setup` が生成する。手で作る場合は各 `.env.example` をコピー:

```bash
cp .env.example .env                       # DATABASE_URL（db:migrate 用）
cp mcp-server/.env.example mcp-server/.env.local
cp web/.env.example web/.env.local
```

値は Supabase ダッシュボードの Settings → API / Connect から取得する。`.env` 系はコミットしない。
