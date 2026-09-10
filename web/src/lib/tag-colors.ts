"use client";

import { useSyncExternalStore } from "react";
import { apiGet } from "./client";

/** name -> #RRGGBB | null。セッション内で 1 回 /api/tags を取ってキャッシュ。 */
type ColorMap = Record<string, string | null>;

let cache: ColorMap | null = null;
let loading = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function load() {
  if (loading) return;
  loading = true;
  try {
    const r = await apiGet<{ tags: { name: string; color: string | null }[] }>(
      "/api/tags",
    );
    cache = Object.fromEntries(r.tags.map((t) => [t.name, t.color]));
    emit();
  } catch {
    /* 用語色は無くても動く */
  } finally {
    loading = false;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (cache === null) load();
  return () => listeners.delete(cb);
}

export function useTagColors(): { colorOf: (name: string) => string | null } {
  useSyncExternalStore(
    subscribe,
    () => cache,
    () => cache,
  );
  return { colorOf: (name) => cache?.[name] ?? null };
}

/** /tags ページでの編集を即時反映する。 */
export function updateTagColorLocal(name: string, color: string | null) {
  cache = { ...(cache ?? {}), [name]: color };
  emit();
}
