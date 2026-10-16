"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost } from "../../lib/client";
import { feedback, useSoundOn } from "../../lib/feedback";
import { POINTS_PER_LEVEL, TREE_MAX_LEVEL, type TreeInfo } from "../../lib/tree";
import { Joystick } from "./Joystick";
import type { TempleScene } from "./scene";

/**
 * 神殿（#93）。/play で貯めたポイントを中央の木に捧げて育てる。
 * 3D の描画は scene.ts（three.js）。このページでだけ読み込む。
 */
export default function TemplePage() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<TempleScene | null>(null);
  const [tree, setTree] = useState<TreeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [near, setNear] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed3d, setFailed3d] = useState(false);
  const sound = useSoundOn();

  // 3D シーン
  useEffect(() => {
    let disposed = false;
    import("./scene")
      .then(({ TempleScene }) => {
        if (disposed || !host.current) return;
        scene.current = new TempleScene(host.current, { onNear: setNear });
      })
      .catch((e: Error) => {
        console.error("[temple] 3D を表示できません:", e);
        setFailed3d(true);
      });
    return () => {
      disposed = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    apiGet<TreeInfo>("/api/tree")
      .then(setTree)
      .catch((e: Error) => setError(e.message));
  }, []);

  // 木の大きさを今のレベルに（シーンの準備が後になることがあるので、両方そろうまで待つ）
  useEffect(() => {
    if (!tree) return;
    const id = window.setInterval(() => {
      if (scene.current) {
        scene.current.setLevel(tree.level, false);
        window.clearInterval(id);
      }
    }, 50);
    return () => window.clearInterval(id);
    // 初回の表示だけ。捧げたときは offer() で育てる
  }, [tree === null]);

  useEffect(() => {
    scene.current?.setPaused(open);
  }, [open]);

  // 木から離れたら捧げる画面を閉じる
  useEffect(() => {
    if (!near) setOpen(false);
  }, [near]);

  // Enter で捧げる画面を開く / Esc で閉じる
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === "Enter" && near && !open && tree && tree.offerable > 0) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [near, open, tree]);

  const offer = useCallback(
    async (amount: number) => {
      if (!tree || busy) return;
      setBusy(true);
      setError(null);
      try {
        const next = await apiPost<TreeInfo>("/api/tree/offer", { amount });
        setOpen(false);
        // 所持ポイントはすぐ減らし、木のレベルは光が吸い込まれてから上げる
        setTree({ ...next, level: tree.level });
        feedback("correct", sound);
        // アバターから白い光の粒が出て木に吸い込まれる → 吸い込み終わったら、木が白く光って次の大きさへ
        await (scene.current?.playOffering(amount) ?? Promise.resolve());
        setTree(next);
        if (next.level > tree.level) {
          scene.current?.setLevel(next.level, true);
          feedback("combo", sound, 10);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [tree, busy, sound],
  );

  const onStick = useCallback((x: number, y: number) => scene.current?.setStick(x, y), []);

  return (
    <div className="temple">
      <div ref={host} className="temple-view" />
      {failed3d && <p className="temple-fallback">この端末では 3D を表示できませんでした。</p>}

      <div className="temple-hud">
        <div className="tp-win temple-status">
          <div className="temple-status-row">
            <span className="tp-label">所持</span>
            <span className="tp-num">{tree ? tree.balance.toLocaleString() : "…"}</span>
            <span className="tp-unit">pt</span>
          </div>
          <div className="temple-status-row">
            <span className="tp-label">木</span>
            <span className="tp-num">Lv {tree ? tree.level : "…"}</span>
            {tree?.maxed && <span className="tp-max">MAX</span>}
          </div>
          {tree && (
            <div className="temple-exp" title={tree.maxed ? "最大レベル" : `次のレベルまで ${tree.toNext} pt`}>
              <div className="temple-exp-bar" aria-hidden="true">
                <span style={{ width: `${(tree.intoLevel / POINTS_PER_LEVEL) * 100}%` }} />
              </div>
              <span className="temple-exp-text">
                {tree.maxed ? `Lv${TREE_MAX_LEVEL} 到達` : `次の Lv まで ${tree.toNext} pt`}
              </span>
            </div>
          )}
        </div>
        <Link href="/" className="tp-btn temple-back">
          もどる
        </Link>
      </div>

      <p className="temple-hint">
        <span className="temple-hint-pc">WASD / 矢印キーで移動</span>
        <span className="temple-hint-touch">右下のスティックで移動</span>
      </p>

      {error && (
        <p className="tp-win temple-error" role="alert">
          {error}
        </p>
      )}

      {near && !open && tree && (
        <div className="temple-action">
          {tree.offerable > 0 ? (
            <button type="button" className="tp-btn tp-gold" onClick={() => setOpen(true)}>
              ポイントを捧げる <span className="tp-key">Enter</span>
            </button>
          ) : (
            <p className="tp-win temple-note">
              {tree.maxed ? "木は最大まで育ちました" : "捧げるポイントがありません。/play で貯めましょう"}
            </p>
          )}
        </div>
      )}

      {open && tree && (
        <OfferPanel tree={tree} busy={busy} onOffer={(a) => void offer(a)} onClose={() => setOpen(false)} />
      )}

      <Joystick onMove={onStick} />
    </div>
  );
}

function OfferPanel({
  tree,
  busy,
  onOffer,
  onClose,
}: {
  tree: TreeInfo;
  busy: boolean;
  onOffer: (amount: number) => void;
  onClose: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);

  const options: { label: string; amount: number }[] = [];
  const add = (label: string, amount: number) => {
    if (amount > 0 && amount <= tree.offerable && !options.some((o) => o.amount === amount))
      options.push({ label, amount });
  };
  add("100 pt", 100);
  add("500 pt", 500);
  add("1,000 pt", 1000);
  if (!tree.maxed) add(`次のレベルまで（${tree.toNext.toLocaleString()} pt）`, tree.toNext);
  add(`全部（${tree.offerable.toLocaleString()} pt）`, tree.offerable);

  return (
    <div className="temple-panel-wrap">
      <section className="tp-win temple-panel" role="dialog" aria-modal="true" aria-labelledby="offer-title">
        <h2 id="offer-title" className="temple-panel-title">
          ▼ ポイントを捧げる
        </h2>
        <p className="temple-panel-desc">
          所持 {tree.balance.toLocaleString()} pt ／ {POINTS_PER_LEVEL} pt で木が 1 レベル育ちます
        </p>
        <ul className="temple-options">
          {options.map((o, i) => (
            <li key={o.amount}>
              <button
                ref={i === 0 ? first : undefined}
                type="button"
                className="temple-option"
                disabled={busy}
                onClick={() => onOffer(o.amount)}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="tp-btn temple-cancel" onClick={onClose}>
          やめる <span className="tp-key">Esc</span>
        </button>
      </section>
    </div>
  );
}
