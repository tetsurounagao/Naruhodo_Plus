-- Naruhodo+ 初期スキーマ
--
-- 適用方法は supabase/README.md を参照。
-- Supabase SQL Editor に貼り付けても、Supabase CLI (supabase db push) でも適用できる。
--
-- 設計の出典: docs/requirements.md 「5. データベース設計」
-- 単一ユーザー・完全個人完結のため user_id 列は持たない。

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 学び本体
-- ---------------------------------------------------------------------------
create table knowledge_items (
  id          uuid primary key default gen_random_uuid(),
  question    text not null,
  answer      text not null,
  context     text,                         -- どのタスク・チュートリアル由来か
  source      text,                         -- 自分で調べた / AIに聞いた 等
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table knowledge_items is '業務・学習中に得た疑問と回答（学び本体）';

-- ---------------------------------------------------------------------------
-- タグのマスタ
-- ---------------------------------------------------------------------------
create table tags (
  id    uuid primary key default gen_random_uuid(),
  name  text not null unique                -- MCP サーバー側で正規化済み（小文字化・空白除去）
);

comment on column tags.name is '正規化済みのタグ名。一致判定はアプリ側の機械的正規化で行う';

-- ---------------------------------------------------------------------------
-- 学び × タグ（多対多）
-- ---------------------------------------------------------------------------
create table knowledge_item_tags (
  knowledge_item_id  uuid not null references knowledge_items(id) on delete cascade,
  tag_id             uuid not null references tags(id) on delete cascade,
  primary key (knowledge_item_id, tag_id)
);

create index knowledge_item_tags_tag_id_idx on knowledge_item_tags(tag_id);

-- ---------------------------------------------------------------------------
-- クイズ本体
-- ---------------------------------------------------------------------------
create table quizzes (
  id                   uuid primary key default gen_random_uuid(),
  question             text not null,
  choices              jsonb not null,       -- [{id, type:"text"|"image", content}] の配列
  correct_answer       text not null,        -- 正解の選択肢 id（例: "a"）
  explanation          text,
  source_knowledge_id  uuid references knowledge_items(id) on delete set null,
  created_by           text,                 -- 生成した AI 名（claude / codex 等）
  created_at           timestamptz not null default now(),

  -- choices は必ず JSON 配列であること（中身の検証はアプリ側で行う）
  constraint quizzes_choices_is_array check (jsonb_typeof(choices) = 'array')
);

comment on column quizzes.choices is
  '選択肢配列。各要素は {id, type:"text"|"image", content}。type 追加のみで画像問題に拡張できる設計';
comment on column quizzes.correct_answer is
  '正解の選択肢 id を格納する。正誤判定は常に id 比較のみで完結する';

create index quizzes_source_knowledge_id_idx on quizzes(source_knowledge_id);
create index quizzes_created_at_idx on quizzes(created_at desc);

-- ---------------------------------------------------------------------------
-- クイズ × タグ（多対多）
-- ---------------------------------------------------------------------------
create table quiz_tags (
  quiz_id  uuid not null references quizzes(id) on delete cascade,
  tag_id   uuid not null references tags(id) on delete cascade,
  primary key (quiz_id, tag_id)
);

create index quiz_tags_tag_id_idx on quiz_tags(tag_id);

-- ---------------------------------------------------------------------------
-- 解答履歴
-- ---------------------------------------------------------------------------
create table quiz_attempts (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null references quizzes(id) on delete cascade,
  user_answer  text not null,               -- 選択した選択肢 id
  is_correct   boolean not null,
  answered_at  timestamptz not null default now()
);

create index quiz_attempts_quiz_id_idx on quiz_attempts(quiz_id);
create index quiz_attempts_answered_at_idx on quiz_attempts(answered_at desc);

-- ---------------------------------------------------------------------------
-- updated_at 自動更新（knowledge_items）
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger knowledge_items_set_updated_at
  before update on knowledge_items
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 集計ビュー
-- ---------------------------------------------------------------------------

-- security_invoker: ビューを問い合わせたロールの権限・RLS で実行する。
-- これを付けないとビューは所有者(postgres)権限で動き、下記 RLS を素通りしてしまう。

-- 未出題（クイズが1件も紐づいていない）の学び一覧。クイズ生成フローの起点。
create view knowledge_items_unquizzed
  with (security_invoker = on) as
  select ki.*
  from knowledge_items ki
  where not exists (
    select 1 from quizzes q where q.source_knowledge_id = ki.id
  );

-- タグ別の解答集計。苦手タグ判定・get_tag_stats の土台。
-- 閾値（暫定: 3回以上 かつ 正答率60%未満）はアプリ側で適用する。ここでは素の数値のみ返す。
create view tag_stats
  with (security_invoker = on) as
  select
    t.id                                                    as tag_id,
    t.name                                                  as tag_name,
    count(qa.id)                                            as total_attempts,
    count(qa.id) filter (where qa.is_correct)               as correct_attempts,
    round(
      count(qa.id) filter (where qa.is_correct)::numeric
        / nullif(count(qa.id), 0),
      4
    )                                                       as accuracy
  from tags t
  left join quiz_tags qt     on qt.tag_id = t.id
  left join quiz_attempts qa on qa.quiz_id = qt.quiz_id
  group by t.id, t.name;

comment on view tag_stats is
  'タグ別の解答回数・正答数・正答率。要復習判定の閾値はアプリ側で適用する';

-- ---------------------------------------------------------------------------
-- RLS: 全テーブルで有効化し、ポリシーは作らない（= 全拒否）
--
-- 目的: Publishable key（anon）経由の PostgREST アクセスを完全に遮断する。
-- service_role（Secret key）は RLS を常に貫通するため、MCP サーバーと
-- Next.js API ルートからのアクセスには影響しない。
-- 将来ブラウザから直接読ませたくなった時に、必要なテーブルへ select ポリシーを
-- 個別追加する。
-- ---------------------------------------------------------------------------
alter table knowledge_items      enable row level security;
alter table tags                 enable row level security;
alter table knowledge_item_tags  enable row level security;
alter table quizzes              enable row level security;
alter table quiz_tags            enable row level security;
alter table quiz_attempts        enable row level security;

-- ビューからも公開ロールのアクセスを明示的に剥がす（security_invoker との二重防御）。
revoke all on knowledge_items_unquizzed from anon, authenticated;
revoke all on tag_stats             from anon, authenticated;
