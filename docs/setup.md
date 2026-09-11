# セットアップ手順（セルフホスト）

Naruhodo+ は各自が自分の Supabase・自分の Vercel・自分の PC で動かす「セルフホスト型」です。
対象: ターミナルとアカウント作成に抵抗のない初級エンジニア。所要 20〜30 分。

構成:

| 部品 | どこで動く | 必須か |
| --- | --- | --- |
| Supabase（DB + 認証） | クラウド（無料枠） | 必須 |
| Web アプリ（`web/`） | Vercel（無料枠）or ローカル | 必須 |
| MCP サーバー（`mcp-server/`） | 自分の PC | 「メモして」等を使うなら必須 |

---

## 0. 用意するもの

- Node.js 20 以上（`node -v` で確認）
- Git
- GitHub アカウント（Vercel 連携用）
- 「メモして」まで使うなら: Claude Code / Claude Desktop / Codex CLI のいずれか

---

## 1. Supabase プロジェクトを作る

1. <https://supabase.com> でサインアップ → **New project**（リージョンは Tokyo 推奨）
2. **Connect**（画面上部）または **Settings → API / Database** から次の 4 つを控える:

   | 値 | 場所 |
   | --- | --- |
   | API URL（`https://xxxx.supabase.co`） | Settings → API |
   | Publishable key（`sb_publishable_…`） | Settings → API |
   | Secret key（`sb_secret_…`） | Settings → API |
   | DB 接続文字列（**Session pooler** の URI・`…pooler.supabase.com:5432`） | Connect → Session pooler |

   > Direct 接続は IPv6 専用のことがあり繋がらない場合があります。Session pooler を使ってください。
   > 接続文字列の `[YOUR-PASSWORD]` は、プロジェクト作成時の DB パスワード（忘れたら Settings → Database で再設定）。

---

## 2. コードを取得

```bash
git clone https://github.com/tetsurounagao/Naruhodo_Plus.git
cd Naruhodo_Plus
npm install
```

---

## 3. 環境変数を作る

```bash
npm run setup
```

対話で 1. の値を貼ると、`mcp-server/.env.local` / `web/.env.local` / `.env` が生成されます
（既存ファイルは上書きしません。作り直すなら `npm run setup -- --force`）。
Groq API キーは任意（用語調べ機能。後からでも可）。

> **ブラウザで設定したい場合**: `npm run dev:web` で起動して <http://localhost:3000/connect> を開くと、
> 値を貼って接続テスト → `.env` 生成／書き出しができます（CLI の代わり）。
> Vercel にデプロイする場合も、`/connect` の「接続テスト」で値の正しさを確認してから
> Environment Variables に貼ると確実です。

---

## 4. データベースのスキーマを適用

```bash
npm run db:migrate
```

`supabase/migrations/*.sql` が順に流れます。何度実行しても安全です。

---

## 5. Web アプリ

### A. Vercel にデプロイ（推奨）

README の «Deploy with Vercel» ボタンから:

1. GitHub にフォーク → Vercel プロジェクト作成
2. **Root Directory** が `web` になっていることを確認
3. 環境変数に `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
   `SUPABASE_SERVICE_ROLE_KEY`（＋任意で `GROQ_API_KEY`）を `web/.env.local` と同じ値で登録
4. Deploy → `https://<project>.vercel.app` が発行される
5. Supabase → **Authentication → URL Configuration → Site URL** にその URL を設定

### B. ローカルで動かす

```bash
npm run dev:web    # http://localhost:3000
```

---

## 6. 最初のユーザーを作る

デプロイ済み URL（または `http://localhost:3000`）を開くと `/login` にリダイレクトされます。
**ユーザーがまだ 0 人なら「アカウント作成」フォームが出る**ので、メールとパスワード（8 文字以上）で作成。
2 人目以降は Supabase ダッシュボードの Authentication → Add user で追加します。

---

## 7. MCP サーバーを登録（「メモして」を使う場合）

```bash
npm run build            # mcp-server と web をビルド
```

ログイン後、Web の **セットアップ**ページ（`/setup`）に、リポジトリの絶対パスを入れると
`claude mcp add …` コマンドや Codex の `config.toml` スニペットが生成されます。コピーして:

- **Claude Code**: そのコマンドをターミナルで実行 → 新しいセッションで `/mcp` が緑
- **Codex CLI**: `~/.codex/config.toml` にスニペットを貼る
- **Claude Desktop**: `claude_desktop_config.json` の `mcpServers` に同等の設定を追加

環境変数は `mcp-server/.env.local` から自動で読まれます（起動時の cwd に依存しません）。

---

## 8.（任意）用語の即時解説を有効化

解説文の分からない語をその場で調べたい場合:

1. <https://console.groq.com> で API キーを発行（クレカ不要）
2. `web/.env.local`（と Vercel の環境変数）に `GROQ_API_KEY=gsk_...` を追加
3. `npm run db:migrate`（`term_lookups` テーブルが追加される）
4. Web を再デプロイ / 再起動

未設定ならこの機能は表示されないだけで、他に影響はありません。

---

## 9. バックアップ（無料枠を使う場合は必須級）

Supabase の無料枠は自動バックアップがありません。手元でデータを退避しておきます。

```bash
npm run db:backup            # backups/naruhodo-<日時>.json に全テーブルの行を書き出し
npm run db:backup -- --keep 30   # backups/ を新しい方から 30 個だけ残す
```

- `backups/` は `.gitignore` 済み（学びの内容やメモが入るため、コミット・共有しない）。
- スキーマは `supabase/migrations` が正なので、バックアップは**行データのみ**。
- **週 1 回**を目安に。`cron` や `launchd` で `npm run db:backup -- --keep 30` を回すと楽です。

### 復元

```bash
npm run db:restore -- backups/naruhodo-20260101-120000.json        # ドライラン（何もしない）
npm run db:restore -- backups/naruhodo-20260101-120000.json --yes  # 実行
```

⚠️ `--yes` を付けると対象テーブルの**既存行をすべて削除**してから書き戻します（全体は 1 トランザクション。失敗時は元に戻る）。
先に `npm run db:migrate` でスキーマを最新にしてから実行してください。

---

## 10. 確認

Web の `/setup` ページを開き、チェックがすべて ✓ になっていれば完了です
（Groq は任意なので設定しなければ `–` のままで問題ありません）。

---

## トラブルシューティング

| 症状 | 対処 |
| --- | --- |
| `db:migrate` が `ENOTFOUND` / `ETIMEDOUT` | 接続文字列を **Session pooler**（`pooler.supabase.com:5432`）に。Direct は IPv6 専用のことがある |
| `db:migrate` が `tenant or user not found` | project-ref かユーザー名の誤り。**Connect → Session pooler** の URI をコピーし直す（ユーザー名は `postgres.<project-ref>`、`<project-ref>` は API URL のサブドメイン） |
| `db:migrate` が「既存スキーマを検出…baseline」 | 正常。既に適用済みの DB を認識しただけ |
| `db:restore` が FK エラー | バックアップとスキーマの世代がズレている可能性。`npm run db:migrate` 後に再実行 |
| Web が `Cannot find module './vendor-chunks/...'` | 依存追加後のキャッシュ。`rm -rf web/.next && npm run dev:web` |
| `/mcp` に naruhodo-plus が出ない | `npm run build` 済みか / 登録後に新セッションを開いたか確認。`claude mcp list` |
| ログインしても弾かれる | Supabase の Site URL 設定、`web/.env.local` の 3 値、`/setup` のチェックを確認 |
