"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

const LINKS: [string, string][] = [
  ["/", "ホーム"],
  ["/quizzes", "クイズ"],
  ["/search", "検索"],
  ["/review", "復習"],
  ["/tags", "タグ"],
  ["/knowledge", "未出題の学び"],
  ["/setup", "セットアップ"],
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login" || pathname === "/connect") return null;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="site">
      <nav>
        {LINKS.map(([href, label]) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <button onClick={logout}>ログアウト</button>
    </header>
  );
}
