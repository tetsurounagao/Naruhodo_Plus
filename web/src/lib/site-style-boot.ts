/**
 * スタイル切り替え（#91）の保存キーと、描画前に <head> で走らせる小さなスクリプト。
 * layout.tsx（サーバー側）からも読むので、"use client" の site-style.ts とは分けている。
 */
export const STYLE_KEY = "naruhodo:style";

/** React が動く前に保存済みのスタイルを <html data-style> に反映し、ちらつきを防ぐ（素の JS の文字列）。 */
export const STYLE_BOOT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(STYLE_KEY)})==="ps1")document.documentElement.dataset.style="ps1"}catch(e){}`;
