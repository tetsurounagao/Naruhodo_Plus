/**
 * バックアップ対象テーブルと依存順。
 * ビュー（tag_stats / knowledge_items_unquizzed）は含めない（実体データではないため）。
 * _naruhodo_migrations はスキーマ台帳なのでバックアップには含めるが、復元では書き換えない。
 */

/** 親→子の順（この順で INSERT すれば FK 違反にならない）。 */
export const DATA_TABLES = [
  "knowledge_items",
  "tags",
  "quizzes",
  "knowledge_item_tags",
  "quiz_tags",
  "quiz_attempts",
  "quiz_links",
  "term_lookups",
];

/** 台帳。バックアップには入れるが復元対象外（スキーマは db:migrate が管理）。 */
export const LEDGER_TABLE = "_naruhodo_migrations";

/** バックアップファイルのフォーマット識別子。 */
export const BACKUP_FORMAT = "naruhodo-backup";
export const BACKUP_VERSION = 1;
