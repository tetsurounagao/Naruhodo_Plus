-- ポイントを貯めて神殿の木に捧げる（#93）。
--   point_earnings: /play で解答 1 件ごとに得たポイント（解答と 1 対 1。取り下げたら行を消す）
--   tree_offerings: 木に捧げた記録
--   残高 = 獲得の合計 − 捧げた合計 / 木の経験値 = 捧げた合計（1000 pt で 1 レベル、Lv99 まで）
-- 集計と「捧げる」の検証は関数で行う（PostgREST では合計を取りにくく、残高の確認と記録を原子的にしたいため）。

create table point_earnings (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null unique references quiz_attempts(id) on delete cascade,
  points      integer not null check (points between 0 and 120),
  created_at  timestamptz not null default now()
);

create table tree_offerings (
  id          uuid primary key default gen_random_uuid(),
  amount      integer not null check (amount > 0),
  created_at  timestamptz not null default now()
);

alter table point_earnings enable row level security;
alter table tree_offerings enable row level security;

comment on table point_earnings is '/play の解答 1 件ごとの獲得ポイント（コンボ・大当たり込み）。取り下げたら削除';
comment on table tree_offerings is '神殿の木に捧げたポイントの記録';

-- 今の残高と木の経験値
create or replace function tree_state()
returns table (balance bigint, exp bigint)
language sql
stable
as $$
  select
    coalesce((select sum(points) from point_earnings), 0)
      - coalesce((select sum(amount) from tree_offerings), 0) as balance,
    coalesce((select sum(amount) from tree_offerings), 0) as exp;
$$;

-- 捧げる。残高を超える量・Lv99 の上限（98000）を超える量は受け付けない。捧げた後の状態を返す
create or replace function offer_to_tree(p_amount integer, p_max_exp integer)
returns table (balance bigint, exp bigint)
language plpgsql
as $$
declare
  cur_balance bigint;
  cur_exp bigint;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid amount';
  end if;
  -- 同時に捧げても残高を割り込まないよう、捧げる処理を 1 本ずつにする
  lock table tree_offerings in share row exclusive mode;
  select s.balance, s.exp into cur_balance, cur_exp from tree_state() s;
  if p_amount > cur_balance then
    raise exception 'insufficient points';
  end if;
  if cur_exp + p_amount > p_max_exp then
    raise exception 'exceeds max level';
  end if;
  insert into tree_offerings (amount) values (p_amount);
  return query select s.balance, s.exp from tree_state() s;
end;
$$;

notify pgrst, 'reload schema';
