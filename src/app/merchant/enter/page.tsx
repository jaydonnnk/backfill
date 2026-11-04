"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { enterWithToken } from "../actions";
import Link from "next/link";

// The secret link is /merchant/enter#<token>. The fragment never reaches the server, a log or a
// Referer header; this page sends it once to set the cookie, then clears it from the address bar.
export default function Enter() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    enterWithToken(token)
      .then((ok) => (ok ? router.replace("/merchant") : setFailed(true)))
      .catch(() => setFailed(true));
  }, [router]);

  return (
    <main className="workspace-page">
      <h1 className="text-2xl font-semibold tracking-tight">Backfill for merchants</h1>
      <p role="status" className="text-[var(--muted)]">
        {failed ? "That link isn't valid." : "Opening your merchant page…"}
      </p>
      {failed && <Link className="button" href="/merchant">Back to merchant access</Link>}
    </main>
  );
}
