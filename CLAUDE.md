# Naruhodo+ プロジェクトメモリ

詳細な経緯・設計理由は `docs/requirements.md` を参照。ここには実装時に必ず守るべきルールのみ記載する。

## プロジェクト概要

業務・学習中の疑問と回答を蓄積し、そこから選択式クイズを自動生成して復習する個人用ツール。複数のAIエージェント（Claude、Codex等）から同じMCPサーバー・DBにアクセスできることが必須要件。

## 技術スタック

- MCPサーバー: TypeScript / Node.js（stdio接続）
- Web画面: TypeScript / Next.js（Vercelにデプロイ）
- DB: Supabase（PostgreSQL、無料枠）
- 認証: Supabase Auth（メールアドレス＋パスワード）

## アーキテクチャの絶対ルール

- ブラウザはSupabaseに直接接続しない。**必ずNext.jsのAPIルートを経由する**
- Supabaseのservice role keyはサーバー側の環境変数にのみ置く。ブラウザに渡さない
- MCPサーバーはローカルPCで動く信頼された処理として扱い、service role keyを直接環境変数で保持してよい（RLS設定は不要）

## DBスキーマ（テーブル要約）

- `knowledge_items`（question, answer, context, source）
- `tags`（name。保存前に正規化: 小文字化・空白除去）
- `knowledge_item_tags` / `quiz_tags`：多対多の中間テーブル
- `quizzes`（question, choices jsonb, correct_answer, explanation, source_knowledge_id, created_by）
- `quiz_attempts`（quiz_id, user_answer, is_correct）

`choices`は`{id, type: "text"|"image", content}`の配列。`correct_answer`は選択肢の`id`を格納する（画像問題への拡張を見据えた設計、type追加のみで対応可能にする）。

## MCPツールのルール

- ツール一覧: `add_knowledge`, `list_knowledge`, `save_quiz`, `get_tag_stats`（任意）
- **振る舞いのルール（いつ保存するか、機密情報の扱い、タグの再利用方針）は、必ずMCPツールの説明文（このコード内）に書く。** エージェント個別の指示ファイルに重複して書かない
- スラッシュコマンド（MCPプロンプト機能）には依存しない。Codex CLIが未対応のため、自然文トリガー（「メモして」等）を主軸にする
- タグの一致判定はコード側の機械的な正規化処理で行う。AIに類似判定をさせない
- `created_by`（呼び出し元のAI名）は必ず記録する

## 機密情報対策（3段構え、省略しない）

1. `add_knowledge`実行時、AIが固有名詞・社内文脈を取り除いて概念だけを抽象化する（ツール説明文で指示）
2. 保存直前にサーバー側でAPIキー・社内ドメイン・メールアドレス等を正規表現でチェックし、該当時は保存を止める
3. 保存前プレビュー表示はユーザー設定でON/OFFできるようにする。実装は「下書きを返す呼び出し」と「確定呼び出し」の2段階にし、モデルの判断力に依存させない

## 苦手タグ判定

- 正答率ベース。1タグあたり3回以上解答済みかつ正答率60%未満で「要復習」とする（閾値は設定で変更可能にしておく）
- 計算はSQL集計のみで完結させる。AI呼び出しは発生させない

## 将来拡張（今は実装しない、設計だけ壊さない）

- タグの意味的重複検出・機密情報の二次チェックにローカルAI（Ollama等）を使う可能性がある
- タグ一致判定・機密情報チェックのロジックは、差し替え可能な独立した関数としてまとめておくこと
