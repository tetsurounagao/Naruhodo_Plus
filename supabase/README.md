# Supabase / DB マイグレーション

`migrations/` に連番の SQL を置く。`YYYYMMDDHHMMSS_名前.sql` 形式（Supabase CLI の規約）。

## 適用方法（どちらか一方）

### A. Supabase SQL Editor に貼る（CLI 不要・手軽）

1. Supabase ダッシュボード → SQL Editor
2. `migrations/` の未適用ファイルを古い順に開き、内容を貼って実行
3. 手動運用なので、どこまで適用したかは自分で管理する

### B. Supabase CLI（推奨・履歴管理される）

```bash
# 初回のみ: プロジェクトとリンク（<project-ref> は API URL のサブドメイン）
supabase link --project-ref <project-ref>

# 未適用のマイグレーションをリモートDBへ反映
supabase db push
```

ローカルで Postgres を立てて試す場合:

```bash
supabase start     # ローカル Supabase 一式を起動
supabase db reset  # migrations/ を最初から流し直す
```

## 方針メモ

- 単一ユーザー・完全個人完結のため、テーブルに `user_id` は持たない。
- **全テーブルで RLS を有効化し、ポリシーは作らない（= 全拒否）**。
  Publishable key（anon）経由の PostgREST アクセスを塞ぐのが目的。
  `service_role`（Secret key）は RLS を常に貫通するので、MCP サーバーと
  Next.js API ルートからの読み書きには影響しない。
- 集計ビューは `security_invoker = on` で作成する（所有者権限での RLS 素通りを防ぐ）。
- タグ一致判定・機密情報チェックは DB ではなくアプリ側の差し替え可能な関数で行う
  （将来ローカル AI 版へ切り替えられるようにするため）。

## 現在のスキーマ

| オブジェクト | 種別 | 役割 |
| --- | --- | --- |
| `knowledge_items` | table | 学び本体（question, answer, context, source） |
| `tags` | table | タグのマスタ（name は正規化済み・unique） |
| `knowledge_item_tags` | table | 学び × タグ（多対多） |
| `quizzes` | table | クイズ本体（choices jsonb, correct_answer は選択肢 id, star, note, last_answered_at） |
| `quiz_tags` | table | クイズ × タグ（多対多） |
| `quiz_attempts` | table | 解答履歴（user_answer, is_correct） |
| `quiz_links` | table | クイズの参考 URL（title は非同期取得, title_status: pending/ok/failed） |
| `knowledge_items_unquizzed` | view | クイズ未生成の学び一覧 |
| `tag_stats` | view | タグ別の解答回数・正答数・正答率（閾値適用はアプリ側） |
