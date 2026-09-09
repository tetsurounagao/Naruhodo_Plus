-- Naruhodo+ 追加スキーマ: クイズの注釈（star / メモ / 参考リンク）と復習支援
--
-- 適用方法は supabase/README.md を参照。SQL Editor に貼るか supabase db push。
-- 設計の出典: 会話での要件詰め（2026-09-09）。
--   - star: 0〜5 の任意評価（UI 上は「重要度」的な位置づけだが明言しない）
--   - note: 1 クイズにつき 1 つの自由記入メモ（回答後に表示・編集）
--   - quiz_links: 1 クイズに複数の参考 URL。タイトルは追加後に非同期取得する
--   - last_answered_at: 並べ替え・忘却曲線ベースの復習提案で使う

-- ---------------------------------------------------------------------------
-- quizzes への列追加
-- ---------------------------------------------------------------------------
alter table quizzes
  add column star smallint not null default 0 check (star between 0 and 5),
  add column note text,
  add column last_answered_at timestamptz;

comment on column quizzes.star is '0〜5 の任意評価。既定 0';
comment on column quizzes.note is '自由記入メモ（1 クイズ 1 つ）。回答後に編集する運用';
comment on column quizzes.last_answered_at is
  '最後に解答された日時。quiz_attempts への insert 時にアプリ側で更新する';

-- 既存の解答履歴から last_answered_at をバックフィル
update quizzes q
set last_answered_at = sub.max_at
from (
  select quiz_id, max(answered_at) as max_at
  from quiz_attempts
  group by quiz_id
) sub
where sub.quiz_id = q.id;

create index quizzes_star_idx on quizzes(star);
create index quizzes_last_answered_at_idx on quizzes(last_answered_at desc nulls last);

-- ---------------------------------------------------------------------------
-- 参考リンク（1 クイズに複数）
-- ---------------------------------------------------------------------------
create table quiz_links (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references quizzes(id) on delete cascade,
  url           text not null,
  title         text,                       -- 取得できた外部ページのタイトル
  title_status  text not null default 'pending'
                  check (title_status in ('pending', 'ok', 'failed')),
  created_at    timestamptz not null default now()
);

comment on table quiz_links is 'クイズに紐づく参考 URL。title は追加後に非同期取得する';
comment on column quiz_links.title_status is
  'pending=取得待ち / ok=取得成功 / failed=取得失敗。検索のタイトル対象は ok のみ';

create index quiz_links_quiz_id_idx on quiz_links(quiz_id);

-- ---------------------------------------------------------------------------
-- RLS: 他テーブルと同じく有効化しポリシーは作らない（= 全拒否）。
-- service_role（MCP サーバー / Next.js API ルート）は貫通する。
-- ---------------------------------------------------------------------------
alter table quiz_links enable row level security;
