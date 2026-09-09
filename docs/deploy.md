# デプロイ手順（Vercel）

`web/` を Vercel にデプロイする。MCP サーバーはローカル PC で動かすものなのでデプロイ対象外。

## 前提

- GitHub にリポジトリが push 済み（`tetsurounagao/Naruhodo_Plus`）
- Supabase プロジェクトが作成済み・マイグレーション適用済み
- Vercel アカウント（GitHub 連携）

## 1. プロジェクトを作成

1. Vercel ダッシュボード → **Add New… → Project**
2. `tetsurounagao/Naruhodo_Plus` を **Import**
3. 設定:
   - **Root Directory**: `web` を選択（重要。モノレポなので）
   - **Framework Preset**: Next.js（自動検出される）
   - Build/Output/Install コマンドは既定のまま（触らない）

## 2. 環境変数を登録

**Deploy を押す前に** Environment Variables に以下を追加（Production / Preview / Development すべてに付ける）:

| Key | Value | 備考 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase の API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` | Publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` | Secret key。`NEXT_PUBLIC_` を付けない＝サーバー限定 |

任意（既定値で問題なければ不要）:

| Key | 既定 |
| --- | --- |
| `NARUHODO_WEAK_TAG_MIN_ATTEMPTS` | `3` |
| `NARUHODO_WEAK_TAG_MAX_ACCURACY` | `0.6` |

値はローカルの `web/.env.local` と同じ。

## 3. デプロイ

**Deploy** を押す。数分でビルド完了。`https://<project>.vercel.app` が発行される。

## 4. Supabase 側の設定

Supabase ダッシュボード → **Authentication → URL Configuration**:

- **Site URL**: `https://<project>.vercel.app`
- **Redirect URLs**: 上と同じ URL を追加

（メール確認リンク等を使うときに必要。今は手動でユーザー作成しているので必須ではないが、入れておく）

## 5. 動作確認

1. `https://<project>.vercel.app` を開く → `/login` にリダイレクトされる
2. Supabase で作成済みのユーザーでログイン
3. `/quizzes` `/knowledge` `/` が表示される（データが無ければ空表示）
4. スマホのブラウザでも同じ URL でログインできることを確認

## 更新

`main` に push すると Vercel が自動で再デプロイする。環境変数を変えたときは Vercel 側で再デプロイが必要。

## 注意

- ブラウザは Supabase に直接接続しない設計。`SUPABASE_SERVICE_ROLE_KEY` は API ルート（Node ランタイム）内でのみ使われ、クライアントバンドルには含まれない。
- 全テーブル RLS 全拒否なので、Publishable key が露出しても DB は読めない。
