-- 解答の自信度に easy（「簡単すぎた」）を足す（#85）。
--   easy = 自信ありで正解したあと「簡単すぎた」を押した解答。次の復習間隔を 2 段階先まで飛ばす（Anki の Easy）。
-- 既存の sure / unsure / NULL はそのまま。

alter table quiz_attempts drop constraint if exists quiz_attempts_confidence_check;
alter table quiz_attempts
  add constraint quiz_attempts_confidence_check check (confidence in ('sure', 'unsure', 'easy'));

comment on column quiz_attempts.confidence is
  '解答時の自信度 sure / unsure / easy（自信ありの正解に「簡単すぎた」）。NULL は列追加前の履歴（sure 扱い）';
