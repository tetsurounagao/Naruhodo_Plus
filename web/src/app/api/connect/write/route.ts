import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { handle, ok, fail } from "../../../../lib/http";
import {
  buildEnvFiles,
  canWriteEnvFiles,
  isAllowedApiHost,
  normalizeApiUrl,
  type WizardInput,
} from "../../../../lib/connect-config";

export const runtime = "nodejs";

/**
 * ローカル実行時のみ: 生成した .env 群をリポジトリに書き出す。
 * Vercel など書き込み不可・本番環境では 403。
 * 既存ファイルは上書きしない（force=true のときだけ上書き）。
 */
export const POST = handle(async (req) => {
  if (!canWriteEnvFiles()) {
    return fail(
      403,
      "この環境では書き出せません（Vercel では Environment Variables に貼り付けてください）。",
    );
  }

  const body = (await req.json().catch(() => null)) as
    | (Partial<WizardInput> & { force?: boolean })
    | null;
  if (!body) return fail(400, "JSON ボディが必要です");

  const apiUrl = normalizeApiUrl(String(body.apiUrl ?? ""));
  if (!isAllowedApiHost(apiUrl)) return fail(400, "API URL が不正です");
  if (!body.anonKey || !body.serviceKey || !body.dbUrl) {
    return fail(400, "anon / service / DB 接続文字列は必須です");
  }

  const v: WizardInput = {
    apiUrl,
    anonKey: String(body.anonKey).trim(),
    serviceKey: String(body.serviceKey).trim(),
    dbUrl: String(body.dbUrl).trim(),
    dbPassword: body.dbPassword ? String(body.dbPassword).trim() : undefined,
    groqKey: body.groqKey ? String(body.groqKey).trim() : undefined,
    clientName: body.clientName ? String(body.clientName).trim() : undefined,
  };

  // dev サーバーの cwd はリポジトリ直下（package.json の dev:web が web ワークスペースを呼ぶ）。
  const root = process.cwd().replace(/\/web\/?$/, "");
  const files = buildEnvFiles(v);
  const written: string[] = [];
  const skipped: string[] = [];

  for (const [rel, content] of Object.entries(files)) {
    const abs = resolve(root, rel);
    if (existsSync(abs) && !body.force) {
      skipped.push(rel);
      continue;
    }
    writeFileSync(abs, content, "utf8");
    written.push(rel);
  }

  return ok({
    written,
    skipped,
    root,
    hint:
      written.length > 0
        ? "書き出しました。dev サーバーを再起動すると反映されます（NEXT_PUBLIC_ 変数は再起動必須）。"
        : "すべて既存のためスキップしました。上書きするには force を指定してください。",
  });
});
