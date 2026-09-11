#!/usr/bin/env node
/**
 * 既存クイズの choices 配列の並び順を一括で是正する、一回限りの修正スクリプト（#29）。
 *
 * 背景: mcp-server の save_quiz は #27 でシャッフルを追加するまで、呼び出し元 AI から
 * 渡された順序をそのまま保存していた。生成 AI が「正解を先に作り、残りを後から足す」
 * 書き方をするため、既存データは正解がほぼ常に choices[0] に偏っている
 * （2026-09-11 時点の調査: 43 問中 38 問）。
 *
 * choices の id は変更しない（並び順だけ変える）ので correct_answer の参照は影響を受けない。
 *
 * 既定はドライラン（現在の偏り具合を表示するだけ）。実行するには --yes を付ける。
 * 実行前に `npm run db:backup` でバックアップを取ることを推奨。
 *
 * 使い方:
 *   npm run fix:quiz-choice-order            # ドライラン
 *   npm run fix:quiz-choice-order -- --yes   # 実行
 */
import { randomInt } from "node:crypto";
import { exit, argv } from "node:process";
import pg from "pg";
import { resolveDbConfig, authHint } from "./lib/db-config.mjs";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function positionDistribution(rows) {
  const dist = {};
  for (const r of rows) {
    const idx = r.choices.findIndex((c) => c.id === r.correct_answer);
    dist[idx] = (dist[idx] ?? 0) + 1;
  }
  return dist;
}

async function main() {
  const yes = argv.includes("--yes");
  const { config, usedPasswordOverride } = resolveDbConfig();
  console.log(
    `接続先: ${config.user}@${config.host}:${config.port}/${config.database}` +
      (usedPasswordOverride ? "  (パスワードは DATABASE_PASSWORD を使用)" : ""),
  );

  const client = new pg.Client(config);
  await client.connect();

  try {
    const { rows } = await client.query(
      "select id, choices, correct_answer from public.quizzes order by created_at asc",
    );
    console.log(`対象: ${rows.length} 問`);
    console.log("現在の正解位置の分布（0-indexed）:", positionDistribution(rows));

    if (!yes) {
      console.log(
        "\n[ドライラン] --yes を付けると全問の choices をシャッフルして更新します（1トランザクション）。",
      );
      return;
    }

    console.log("\n=== 更新を実行します ===");
    await client.query("begin");
    try {
      for (const r of rows) {
        const next = shuffle(r.choices);
        await client.query("update public.quizzes set choices = $1 where id = $2", [
          JSON.stringify(next),
          r.id,
        ]);
      }
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      console.error("失敗したためロールバックしました。");
      throw e;
    }

    const after = await client.query(
      "select choices, correct_answer from public.quizzes",
    );
    console.log(`\n${rows.length} 問を更新しました。`);
    console.log("更新後の正解位置の分布（0-indexed）:", positionDistribution(after.rows));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("\n失敗:", e.message);
  const hint = authHint(e.message);
  if (hint) console.error(hint);
  exit(1);
});
