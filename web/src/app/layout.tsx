import type { ReactNode } from "react";
import { BIZ_UDGothic, DotGothic16, JetBrains_Mono, M_PLUS_Rounded_1c } from "next/font/google";
import "./globals.css";
import "./styles/home.css";
import "./styles/play.css";
import "./styles/code.css";
import "./styles/ps1.css";
import { SiteHeader } from "./_components/SiteHeader";
import { STYLE_BOOT_SCRIPT } from "../lib/site-style-boot";

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
// 初代プレステ風スタイル（#91）用。選んだときだけ CSS から使われる
const dot = DotGothic16({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-dot",
});
const ud = BIZ_UDGothic({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-ud",
});

export const metadata = {
  title: "Naruhodo+",
  description: "学習蓄積・クイズ生成アプリ",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-style は描画前のスクリプトが付けるので、サーバーの HTML と食い違っても警告しない
    <html
      lang="ja"
      className={`${rounded.variable} ${mono.variable} ${dot.variable} ${ud.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: STYLE_BOOT_SCRIPT }} />
      </head>
      <body>
        <SiteHeader />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
