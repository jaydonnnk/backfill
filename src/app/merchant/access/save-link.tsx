"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

export function SaveAccessLink({ token }: { token: string }) {
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");
  const link = origin ? `${origin}/merchant/enter#${token}` : "";
  const [notice, setNotice] = useState("");

  async function copy() {
    try { await navigator.clipboard.writeText(link); setNotice("Link copied."); }
    catch { setNotice("Copy unavailable. Download your link instead."); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([link + "\n"], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "backfill-access.txt";
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Link downloaded.");
  }
  return <section className="min-w-0 border-y border-[var(--border)] py-6">
    <label className="flex flex-col gap-2">Your private access link<input className="w-full min-w-0 border border-[var(--border)] bg-[var(--panel)] p-3" value={link} type="password" readOnly autoComplete="off" onFocus={event => event.currentTarget.select()} /></label>
    <div className="actions mt-4"><button type="button" className="button" onClick={copy} disabled={!link}>Copy access link</button><button type="button" className="button" onClick={download} disabled={!link}>Download access link</button></div>
    <p className="small">Keep it private. Anyone with it can manage your workspace. Lost links can&apos;t be recovered.</p>
    <p className="small" role="status">{notice}</p>
    <Link className="button primary mt-4" href="/merchant">Continue to my workspace →</Link>
  </section>;
}
