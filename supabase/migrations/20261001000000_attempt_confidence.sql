-- 解答時の自信度。まぐれ正解を復習間隔の計算で区別するために使う（#50）。
--   sure   = 自信あり
--   unsure = あやふや（正解でも連続正解に数えず、早めに再出題する）
--   NULL   = この列を追加する前の履歴。「自信あり」として扱う
-- 正答率（tag_stats）は従来どおり is_correct だけで計算する。

alter table quiz_attempts
  add column confidence text check (confidence in ('sure', 'unsure'));

comment on column quiz_attempts.confidence is
  '解答時の自信度 sure / unsure。NULL は列追加前の履歴（sure 扱い）';
