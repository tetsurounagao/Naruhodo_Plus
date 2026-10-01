import type { ReactNode } from "react";
import { JetBrains_Mono, M_PLUS_Rounded_1c } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "./_components/SiteHeader";

// フォントはビルド時に取り込まれる（表示時に Google へ取りに行かない）。
// 日本語フォントは大きいので preload せず、使う文字の分だけ読み込ませる。
const rounded = M_PLUS_Rounded_1c({
  weight: ["500", "700", "800"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-rounded",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
});

export const metadata = {
  title: "Naruhodo+",
  description: "学習蓄積・クイズ生成アプリ",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className={`${rounded.variable} ${mono.variable}`}>
      <body>
        <SiteHeader />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
