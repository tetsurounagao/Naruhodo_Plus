"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { countByLocalDate, currentStreak, localDateKey } from "../../lib/streak";
import { DAILY_GOAL, onAnswered } from "../../lib/daily-goal";

const LINKS: [string, string][] = [
  ["/", "ホーム"],
  ["/quizzes", "クイズ"],
  ["/review", "復習"],
  ["/knowledge", "学び"],
  ["/tags", "タグ"],
  ["/search", "検索"],
  ["/setup", "セットアップ"],
];

/** 連続学習日数と今日解いた数。ページを移るたびに取り直し、解答時はその場で +1 する。 */
function useTodayStatus(enabled: boolean, pathname: string) {
  const [status, setStatus] = useState<{ streak: number; today: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    // ヘッダーは全ページに出るので、失敗しても画面遷移（401 → /login）はさせない
    fetch("/api/activity?kind=answers&days=400", { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { timestamps: string[] } | null) => {
        if (!d) return;
        const counts = countByLocalDate(d.timestamps);
        setStatus({
          streak: currentStreak(new Set(Object.keys(counts))),
          today: counts[localDateKey(new Date())] ?? 0,
        });
      })
      .catch(() => {});
  }, [enabled, pathname]);

  useEffect(
    () =>
      onAnswered(() =>
        setStatus((s) =>
          s ? { streak: s.today === 0 ? s.streak + 1 : s.streak, today: s.today + 1 } : s,
        ),
      ),
    [],
  );

  return status;
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const hidden = pathname === "/login" || pathname === "/connect";
  const status = useTodayStatus(!hidden, pathname);

  if (hidden) return null;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const done = Math.min(status?.today ?? 0, DAILY_GOAL);

  return (
    <header className="site">
      <Link href="/" className="site-logo">
        <span className="site-logo-mark">N+</span>
        Naruhodo+
      </Link>
      <nav>
        {LINKS.map(([href, label]) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined}>
              {label}
            </Link>
          );
        })}
      </nav>
      {status && (
        <div className="site-status">
          <span className={status.streak > 0 ? "site-streak" : "site-streak off"}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.4 2.2-4.3.2 1.8 1.1 2.8 2.3 3.1C11 9 10.6 6 12 3z"
                fill={status.streak > 0 ? "var(--flame)" : "none"}
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            {status.streak}日連続
          </span>
          <span className="site-today" title={`1 日の目標 ${DAILY_GOAL} 問`}>
            <span className="site-today-label">今日</span>
            <span className="site-today-bar" aria-hidden="true">
              <span style={{ width: `${(done / DAILY_GOAL) * 100}%` }} />
            </span>
            {status.today}/{DAILY_GOAL}
          </span>
        </div>
      )}
      <button className="site-logout" onClick={logout}>
        ログアウト
      </button>
    </header>
  );
}
