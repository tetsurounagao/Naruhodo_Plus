#!/usr/bin/env node
/**
 * DB の全データを 1 つの JSON ファイルに書き出す論理バックアップ。
 *
 * - pg_dump に依存しない（クライアント/サーバのバージョン不整合を避けるため）
 * - スキーマ定義はバックアップしない（supabase/migrations が正）。行データのみ。
 * - 出力: backups/naruhodo-<YYYYMMDD-HHMMSS>.json（.gitignore 済み）
 *
 * 使い方:
 *   npm run db:backup                 # backups/ に日時つきで出力
 *   npm run db:backup -- --out foo.json
 *   npm run db:backup -- --keep 30    # backups/ の JSON を新しい方から 30 個だけ残す
 */
import { mkdirSync, writeFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { exit, argv } from "node:process";
import pg from "pg";
import { repoRoot, resolveDbConfig, authHint } from "./lib/db-config.mjs";
import {
  DATA_TABLES,
  LEDGER_TABLE,
  BACKUP_FORMAT,
  BACKUP_VERSION,
} from "./lib/schema.mjs";

function parseArgs(args) {
  const out = { out: null, keep: 0 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out") out.out = args[++i];
    else if (args[i] === "--keep") out.keep = Math.max(0, Number(args[++i]) || 0);
  }
  return out;
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

async function main() {
  const opts = parseArgs(argv.slice(2));
  const { config, usedPasswordOverride } = resolveDbConfig();
  console.log(
    `接続先: ${config.user}@${config.host}:${config.port}/${config.database}` +
      (usedPasswordOverride ? "  (パスワードは DATABASE_PASSWORD を使用)" : ""),
  );

  const client = new pg.Client(config);
  await client.connect();

  const tables = {};
  let total = 0;
  try {
    for (const t of [...DATA_TABLES, LEDGER_TABLE]) {
      const reg = await client.query("select to_regclass($1) as t", [
        `public.${t}`,
      ]);
      if (!reg.rows[0].t) {
        console.log(`  - ${t}: (テーブルなし・スキップ)`);
        continue;
      }
      const { rows } = await client.query(`select * from public.${t}`);
      tables[t] = rows;
      total += rows.length;
      console.log(`  - ${t}: ${rows.length} 行`);
    }
  } finally {
    await client.end();
  }

  const payload = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
    source: `${config.host}/${config.database}`,
    migrations: (tables[LEDGER_TABLE] ?? []).map((r) => r.name).sort(),
    tables,
  };

  const outPath = opts.out
    ? resolve(repoRoot, opts.out)
    : resolve(repoRoot, "backups", `naruhodo-${stamp()}.json`);
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

  const kb = (statSync(outPath).size / 1024).toFixed(1);
  console.log(`\n書き出しました: ${outPath}  (${total} 行 / ${kb} KB)`);

  if (opts.keep > 0 && !opts.out) {
    const dir = resolve(repoRoot, "backups");
    const files = readdirSync(dir)
      .filter((f) => /^naruhodo-.*\.json$/.test(f))
      .map((f) => ({ f, m: statSync(resolve(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    const stale = files.slice(opts.keep);
    for (const { f } of stale) rmSync(resolve(dir, f));
    if (stale.length) console.log(`古いバックアップ ${stale.length} 件を削除しました（--keep ${opts.keep}）。`);
  }
}

main().catch((e) => {
  console.error("\nバックアップ失敗:", e.message);
  const hint = authHint(e.message);
  if (hint) console.error(hint);
  exit(1);
});
