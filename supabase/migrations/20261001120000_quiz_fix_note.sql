-- 「問題がおかしい」フラグ（#57）。
--   NULL   = 問題なし
--   文字列 = 要修正。中身はユーザーの指摘（理由）
-- 空文字・空白だけは許さない（アプリ側で「（理由の記入なし）」に正規化してから保存する）。
-- MCP の save_quiz に replaces_quiz_id が渡されると、元の問題は hidden=true / fix_note=NULL になる。

alter table quizzes add column fix_note text
  check (fix_note is null or length(btrim(fix_note)) > 0);

comment on column quizzes.fix_note is
  '要修正の指摘。NULL = 問題なし、文字列 = 要修正とその理由（空文字不可）';

create index quizzes_fix_note_idx on quizzes(id) where fix_note is not null;
