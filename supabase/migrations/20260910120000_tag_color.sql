-- タグに任意の色を持たせる（一元管理）。
-- hex 文字列（#RRGGBB）。未設定は NULL でアプリ側が既定色を使う。

alter table tags add column color text
  check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

comment on column tags.color is '表示色 #RRGGBB。NULL なら既定色';
