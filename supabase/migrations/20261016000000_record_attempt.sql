-- #97 解答の記録を 1 往復にまとめる。
-- 採点 → quiz_attempts に記録 → quizzes.last_answered_at 更新 → 獲得ポイントの記録 を 1 回の呼び出しで行う。
-- p_id は呼び出し側（ブラウザ）で作った解答 id。同じ id で再送されたら何もしない（二重記録しない）。
-- ポイントの上限（不正解 0 / あやふや p_unsure_max / 自信あり p_max_points）は lib/tree.ts の値を渡す。
create or replace function record_attempt(
  p_id uuid,
  p_quiz_id uuid,
  p_user_answer text,
  p_confidence text,
  p_points integer,
  p_max_points integer,
  p_unsure_max integer
)
returns jsonb
language plpgsql
as $$
declare
  q record;
  v_correct boolean;
  v_cap integer;
begin
  select correct_answer, explanation, choices, source_knowledge_id into q
    from quizzes where id = p_quiz_id;
  if not found then
    raise exception 'quiz not found';
  end if;
  if not exists (select 1 from jsonb_array_elements(q.choices) c where c->>'id' = p_user_answer) then
    raise exception 'invalid user_answer';
  end if;
  if p_confidence is null or p_confidence not in ('sure', 'unsure') then
    raise exception 'invalid confidence';
  end if;

  v_correct := p_user_answer = q.correct_answer;
  v_cap := case when not v_correct then 0 when p_confidence = 'unsure' then p_unsure_max else p_max_points end;
  if p_points is null or p_points < 0 or p_points > v_cap then
    raise exception 'points exceed cap %', v_cap;
  end if;

  insert into quiz_attempts (id, quiz_id, user_answer, is_correct, confidence)
    values (p_id, p_quiz_id, p_user_answer, v_correct, p_confidence)
    on conflict (id) do nothing;
  -- 初めて記録したときだけ（再送では何もしない）
  if found then
    update quizzes set last_answered_at = now() where id = p_quiz_id;
    if p_points > 0 then
      insert into point_earnings (attempt_id, points) values (p_id, p_points)
        on conflict (attempt_id) do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'attempt_id', p_id,
    'is_correct', v_correct,
    'correct_answer', q.correct_answer,
    'explanation', q.explanation,
    'choices', q.choices,
    'source_knowledge', (
      select jsonb_build_object('question', k.question, 'answer', k.answer, 'context', k.context)
        from knowledge_items k where k.id = q.source_knowledge_id
    )
  );
end;
$$;

-- service role（API ルート）からだけ呼ぶ
revoke execute on function record_attempt(uuid, uuid, text, text, integer, integer, integer) from public, anon, authenticated;

notify pgrst, 'reload schema';
