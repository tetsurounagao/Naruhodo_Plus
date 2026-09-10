#!/usr/bin/env node
/**
 * supabase/migrations/*.sql を順に適用する簡易マイグレーションランナー。
 *
 * - DATABASE_URL（.env か環境変数）で Postgres に直結
 * - 適用済みは public._naruhodo_migrations で管理（冪等）
 * - 既存 DB（quizzes テーブルが既にある）で初回実行したときは、
 *   バンドル済みの全 migration を「適用済み」として記録するだけ（baseline）。
 *   以降は差分だけ流れる。
 *
 * 使い方: npm run db:migrate
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { exit } from "node:process";
import pg from "pg";
import { repoRoot, resolveDbConfig, authHint } from "./lib/db-config.mjs";

const root = repoRoot;
const migrationsDir = resolve(root, "supabase/migrations");

async function main() {
  let config, usedPasswordOverride;
  try {
    ({ config, usedPasswordOverride } = resolveDbConfig());
  } catch (e) {
    console.error(e.message);
    exit(1);
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    console.log("マイグレーションファイルがありません。");
    return;
  }

  console.log(
    `接続先: ${config.user}@${config.host}:${config.port}/${config.database}` +
      (usedPasswordOverride ? "  (パスワードは DATABASE_PASSWORD を使用)" : ""),
  );

  const client = new pg.Client(config);
  await client.connect();

  try {
    await client.query(`
      create table if not exists public._naruhodo_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const applied = new Set(
      (await client.query("select name from public._naruhodo_migrations")).rows.map(
        (r) => r.name,
      ),
    );

    // baseline 判定: 記録が空で、かつ既に schema がある（quizzes が存在）なら全部を適用済み扱い
    if (applied.size === 0) {
      const has = await client.query("select to_regclass('public.quizzes') as t");
      if (has.rows[0].t) {
        for (const f of files) {
          await client.query(
            "insert into public._naruhodo_migrations(name) values($1) on conflict do nothing",
            [f],
          );
        }
        console.log(
          `既存スキーマを検出。${files.length} 件のマイグレーションを baseline として記録しました（適用はスキップ）。`,
        );
        return;
      }
    }

    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log("スキーマは最新です。");
      return;
    }

    for (const f of pending) {
      const sql = readFileSync(resolve(migrationsDir, f), "utf8");
      process.stdout.write(`applying ${f} ... `);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into public._naruhodo_migrations(name) values($1)",
          [f],
        );
        await client.query("commit");
        console.log("ok");
      } catch (e) {
        await client.query("rollback");
        console.log("failed");
        throw e;
      }
    }
    console.log(`\n${pending.length} 件を適用しました。`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("\nマイグレーション失敗:", e.message);
  const hint = authHint(e.message);
  if (hint) console.error(hint);
  exit(1);
});
