-- 問題の非表示（アーカイブ）。削除はしない。
-- 非表示のクイズはアプリ側で一覧・検索・復習・集計・カレンダーから除外する。

alter table quizzes add column hidden boolean not null default false;
create index quizzes_hidden_idx on quizzes(hidden) where hidden;

-- 集計ビューも非表示を除外する形に作り直す（列は不変なので replace 可）
create or replace view tag_stats
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
  left join quizzes q        on q.id = qt.quiz_id
  left join quiz_attempts qa on qa.quiz_id = qt.quiz_id
  where q.id is null or q.hidden is not true
  group by t.id, t.name;

create or replace view knowledge_items_unquizzed as
  select ki.*
  from knowledge_items ki
  where not exists (
    select 1 from quizzes q
    where q.source_knowledge_id = ki.id and q.hidden is not true
  );
