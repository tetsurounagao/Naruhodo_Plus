"use client";

import { useEffect, useState } from "react";
import { STYLE_KEY } from "./site-style-boot";

/**
 * 画面のスタイル（見た目）の切り替え（#91）。いつもの / 初代プレステ風。
 * 個人の表示設定なのでブラウザに保存する。読めない環境では「いつもの」。
 * 反映は <html data-style="…"> の付け外しだけで、CSS 側（styles/ps1.css）が見た目を変える。
 * 読み込み直後のちらつきを防ぐため、layout.tsx の <head> でも同じキーを読んで先に反映している。
 */
export type SiteStyle = "classic" | "ps1";

export const SITE_STYLES: { id: SiteStyle; label: string }[] = [
  { id: "classic", label: "いつもの" },
  { id: "ps1", label: "プレステ" },
];

const EVENT = "naruhodo:style-change";

function read(): SiteStyle {
  try {
    return window.localStorage.getItem(STYLE_KEY) === "ps1" ? "ps1" : "classic";
  } catch {
    return "classic";
  }
}

function apply(style: SiteStyle): void {
  if (style === "classic") delete document.documentElement.dataset.style;
  else document.documentElement.dataset.style = style;
}

export function setSiteStyle(style: SiteStyle): void {
  try {
    window.localStorage.setItem(STYLE_KEY, style);
  } catch {
    // 保存できなくても今の画面では反映させる
  }
  apply(style);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: style }));
}

export function useSiteStyle(): SiteStyle {
  const [style, setStyle] = useState<SiteStyle>("classic");
  useEffect(() => {
    setStyle(read());
    const onChange = (e: Event) => setStyle((e as CustomEvent<SiteStyle>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return style;
}
