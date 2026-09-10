#!/usr/bin/env node
/**
 * db:backup が作った JSON を DB に書き戻す。
 *
 * ⚠️ 破壊的操作: 対象テーブルの既存行をすべて削除してから投入する。
 *    既定はドライラン（何もしない）。実行するには --yes を付ける。
 *    全体を 1 トランザクションで行うので、途中で失敗すれば元に戻る。
 *
 * 使い方:
 *   npm run db:restore -- backups/naruhodo-20260101-120000.json          # ドライラン
 *   npm run db:restore -- backups/naruhodo-20260101-120000.json --yes    # 実行
 *
 * スキーマ自体は復元しない（supabase/migrations + npm run db:migrate が正）。
 * 先に db:migrate でスキーマを最新にしてから使うこと。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { exit, argv } from "node:process";
import pg from "pg";
import { repoRoot, resolveDbConfig, authHint } from "./lib/db-config.mjs";
import { DATA_TABLES, LEDGER_TABLE, BACKUP_FORMAT } from "./lib/schema.mjs";

function parseArgs(args) {
  const out = { file: null, yes: false };
  for (const a of args) {
    if (a === "--yes") out.yes = true;
    else if (!a.startsWith("--") && !out.file) out.file = a;
  }
  return out;
}

async function main() {
  const opts = parseArgs(argv.slice(2));
  if (!opts.file) {
    console.error("使い方: npm run db:restore -- <backup.json> [--yes]");
    exit(1);
  }

  const path = resolve(repoRoot, opts.file);
  const payload = JSON.parse(readFileSync(path, "utf8"));
  if (payload.format !== BACKUP_FORMAT) {
    throw new Error(
      `バックアップ形式が違います（format=${payload.format ?? "不明"}）。db:backup で作ったファイルを指定してください。`,
    );
  }

  const { config, usedPasswordOverride } = resolveDbConfig();
  console.log(
    `接続先: ${config.user}@${config.host}:${config.port}/${config.database}` +
      (usedPasswordOverride ? "  (パスワードは DATABASE_PASSWORD を使用)" : ""),
  );
  console.log(`バックアップ: ${path}`);
  console.log(`  作成日時: ${payload.created_at}  取得元: ${payload.source}`);

  const client = new pg.Client(config);
  await client.connect();

  try {
    // スキーマ台帳のズレを確認（警告のみ）
    const ledger = await client.query(
      `select name from public.${LEDGER_TABLE} order by name`,
    );
    const dbMig = ledger.rows.map((r) => r.name);
    const fileMig = payload.migrations ?? [];
    if (JSON.stringify(dbMig) !== JSON.stringify([...fileMig].sort())) {
      console.log("\n⚠️  マイグレーション状態がバックアップと一致しません:");
      console.log(`   DB   : ${dbMig.join(", ") || "(なし)"}`);
      console.log(`   ファイル: ${fileMig.join(", ") || "(なし)"}`);
      console.log("   先に npm run db:migrate で揃えることを推奨します。");
    }

    // 投入対象（親→子）と件数
    const present = DATA_TABLES.filter((t) => Array.isArray(payload.tables?.[t]));
    console.log("\n投入対象:");
    for (const t of present) {
      console.log(`  - ${t}: ${payload.tables[t].length} 行`);
    }

    if (!opts.yes) {
      console.log(
        "\n[ドライラン] --yes を付けると、上記テーブルの既存行を削除して投入します。",
      );
      return;
    }

    console.log("\n=== 復元を実行します（既存行は削除されます）===");
    await client.query("begin");
    try {
      // 子→親の順で削除
      for (const t of [...present].reverse()) {
        await client.query(`delete from public.${t}`);
      }
      // 親→子の順で投入
      for (const t of present) {
        const rows = payload.tables[t];
        if (rows.length === 0) continue;

        const typeRes = await client.query(
          `select column_name, data_type
             from information_schema.columns
            where table_schema = 'public' and table_name = $1`,
          [t],
        );
        const jsonCols = new Set(
          typeRes.rows
            .filter((r) => r.data_type === "json" || r.data_type === "jsonb")
            .map((r) => r.column_name),
        );

        const cols = Object.keys(rows[0]);
        const colList = cols.map((c) => `"${c}"`).join(", ");
        const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
        const sql = `insert into public.${t} (${colList}) values (${ph})`;

        for (const row of rows) {
          const vals = cols.map((c) => {
            const v = row[c];
            if (v !== null && jsonCols.has(c) && typeof v === "object") {
              return JSON.stringify(v);
            }
            return v;
          });
          await client.query(sql, vals);
        }
        console.log(`  - ${t}: ${rows.length} 行 投入`);
      }
      await client.query("commit");
      console.log("\n復元が完了しました。");
    } catch (e) {
      await client.query("rollback");
      console.error("\n復元に失敗したためロールバックしました。");
      throw e;
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("\n復元失敗:", e.message);
  const hint = authHint(e.message);
  if (hint) console.error(hint);
  exit(1);
});
