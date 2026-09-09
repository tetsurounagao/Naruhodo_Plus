import "server-only";

/**
 * 参考 URL の外部ページから <title>（無ければ og:title）を取得する。
 * ベストエフォート。失敗・タイムアウト・非 HTML は null。
 * 社内・ローカル宛（SSRF 回避）は最初に弾く。
 */

const BLOCKED_HOST =
  /^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0$|::1$|\[::1\]$|.+\.(internal|intra|local|corp|lan)$)/i;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export async function fetchPageTitle(rawUrl: string): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (BLOCKED_HOST.test(u.hostname)) return null;

  try {
    const res = await fetch(u, {
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; NaruhodoPlus/0.1; +link-title-fetch)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").toLowerCase().includes("html")) {
      return null;
    }
    const buf = await res.arrayBuffer();
    const html = new TextDecoder("utf-8").decode(buf.slice(0, 200_000));

    const og = html.match(
      /<meta[^>]+(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["']/i,
    )?.[1];
    const raw = og ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    if (!raw) return null;

    const title = decodeEntities(raw.replace(/\s+/g, " ").trim()).slice(0, 300);
    return title || null;
  } catch {
    return null;
  }
}
