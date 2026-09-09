# @naruhodo-plus/web

Naruhodo+ の Web アプリ（Next.js App Router / TypeScript）。
クイズの復習・進捗確認・未出題の学びからのクイズ生成依頼を担当する。

## アーキテクチャ

- **ブラウザは Supabase に直接接続しない。** すべて Next.js の API ルート（`src/app/api/**`）経由。
- ブラウザが持つのは API ルートが発行する httpOnly セッション Cookie のみ。Supabase の鍵は渡らない。
- API ルートの流れ: リクエスト受信 → `requireUser()` でセッション検証 → `getSupabaseAdmin()`（service role）で DB 読み書き → JSON 返却。
- 全テーブル RLS 全拒否のため、DB アクセスは service role キーでのみ可能。
- 正誤判定はサーバー側（`POST /api/attempts`）で行い、解答前の GET では `correct_answer` / `explanation` を返さない。

## セットアップ

```bash
# リポジトリルートで
npm install
cp web/.env.example web/.env.local   # 値は Supabase の Settings → API から
```

| 変数 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key（ログイン処理・セッション検証） |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key（API ルート内の DB アクセス。ブラウザに渡さない） |
| `NARUHODO_WEAK_TAG_MIN_ATTEMPTS` | 要復習判定の最小解答回数（既定 3） |
| `NARUHODO_WEAK_TAG_MAX_ACCURACY` | 要復習判定の正答率上限（既定 0.6） |

事前に `supabase/migrations/` のスキーマ適用が必要。

## ログインユーザーの作成

サインアップ画面は用意していない（個人ツールのため）。Supabase ダッシュボードの
**Authentication → Users → Add user** でメールアドレスとパスワードを登録する
（"Auto Confirm User" を有効にする）。

## 起動

```bash
npm run dev:web        # ルートから（http://localhost:3000）
npm run dev            # web ディレクトリから
npm run build && npm start
```

## 画面

| パス | 内容 |
| --- | --- |
| `/login` | ログイン |
| `/` | ホーム。未解答クイズ数・未クイズ化の学び数・要復習タグ・全タグ正答率 |
| `/quizzes` | クイズ一覧と解答。未解答のみ表示の切り替えあり |
| `/knowledge` | 未出題の学び一覧。「クイズ化を依頼」でプロンプトをクリップボードにコピー |

## API ルート

| メソッド・パス | 内容 |
| --- | --- |
| `POST /api/auth/login` | メール＋パスワードでログイン。セッション Cookie を発行 |
| `POST /api/auth/logout` | ログアウト |
| `GET /api/auth/user` | 現在のユーザー |
| `GET /api/quizzes?tag=&unanswered=1&limit=` | クイズ一覧（`correct_answer` は含めない） |
| `GET /api/quizzes/[id]` | 解答用の単一クイズ（同上） |
| `POST /api/attempts` | `{quiz_id, user_answer}` を採点し履歴に記録。結果と正解・解説を返す |
| `GET /api/knowledge?unquizzed=1` | 未クイズ化の学び一覧 |
| `GET /api/tag-stats` | タグ別の正答率と要復習フラグ |

`/api/auth/*` 以外の API ルートは未ログインだと 401。保護ページは `/login` にリダイレクト（`src/middleware.ts`）。
