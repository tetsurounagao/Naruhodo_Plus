-- 用語の即時解説（Groq）のキャッシュ。
-- 同じ語・同じ文脈の 2 回目以降は API を呼ばずここから返す。
-- 中身は「学習の下書き」であり knowledge とは別物。

create table term_lookups (
  id           uuid primary key default gen_random_uuid(),
  term         text not null,
  -- 出てきた文などの文脈。無ければ空文字。実文ではなくハッシュを入れる想定
  context_key  text not null default '',
  answer       text not null,
  model        text,
  created_at   timestamptz not null default now(),
  unique (term, context_key)
);

comment on table term_lookups is 'Groq による用語解説のキャッシュ。term + context_key で一意';

-- 他テーブルと同じく RLS 有効化・ポリシーなし（service role のみ）
alter table term_lookups enable row level security;
