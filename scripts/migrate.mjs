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
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { exit } from "node:process";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = resolve(root, "supabase/migrations");

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = resolve(root, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

async function main() {
  const url = loadDatabaseUrl();
  if (!url) {
    console.error(
      "DATABASE_URL が見つかりません。npm run setup を実行するか .env に設定してください。",
    );
    exit(1);
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    console.log("マイグレーションファイルがありません。");
    return;
  }

  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
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
  exit(1);
});
