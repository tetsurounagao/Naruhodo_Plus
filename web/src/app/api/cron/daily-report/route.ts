import { timingSafeEqual } from "node:crypto";
import { HttpError } from "../../../../lib/auth";
import { env } from "../../../../lib/env";
import { handle, ok } from "../../../../lib/http";
import { formatReport } from "../../../../lib/daily-report";
import { collectDailyReport, postToSlack } from "../../../../lib/daily-report-server";

/**
 * 毎日の成果を Slack に送る（#95）。Vercel Cron が 22 時ごろ（JST）に呼ぶ（web/vercel.json）。
 * ログイン不要の代わりに `Authorization: Bearer <CRON_SECRET>` が必須。
 * ?dry=1 なら送らずに本文だけ返す（確認用）。1 問も解いていない日は送らない。
 */
export const dynamic = "force-dynamic";

function authorize(req: Request) {
  const secret = env.cronSecret;
  if (!secret) throw new HttpError(503, "CRON_SECRET が未設定です");
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(401, "unauthorized");
}

export const GET = handle(async (req) => {
  authorize(req);
  const url = new URL(req.url);
  const report = await collectDailyReport();
  const text = formatReport({ ...report, appUrl: url.origin });

  if (url.searchParams.get("dry") === "1") return ok({ sent: false, reason: "dry", text });
  if (report.answered === 0) return ok({ sent: false, reason: "no_activity" });
  const webhook = env.slackWebhookUrl;
  if (!webhook) throw new HttpError(503, "SLACK_WEBHOOK_URL が未設定です");
  await postToSlack(webhook, text);
  return ok({ sent: true });
});
