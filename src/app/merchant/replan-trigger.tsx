"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { replan } from "./actions";

// Shown when an occurrence has sold out with no plan yet: asks Muse Wonder to re-plan once, without
// holding up the page, then reloads the dashboard with the stored plan.
export function ReplanTrigger() {
  const router = useRouter();
  const started = useRef(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    replan()
      .then((result) => {
        setStatus(result);
        if (result === "planned") router.refresh();
      })
      .catch(() => setStatus("failed"));
  }, [router]);

  const text =
    status === null || status === "planned"
      ? "A slot sold out. Your Muse Wonder agent is planning the next terms…"
      : status === "busy"
        ? "Your agent is already planning. Reload in a moment."
        : status === "daily_cap"
          ? "Today's planning limit is reached. Plans resume tomorrow."
          : "Planning failed. Reload to try again.";
  return (
    <p role="status" className="rounded-md border border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
      {text}
    </p>
  );
}
