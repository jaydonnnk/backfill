"use client";

import { KopiMessage } from "@/components/kopi-companion";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

// A submit button for a server-action form: while the action runs it disables itself (so a slow
// Muse call cannot be submitted twice), shows a spinner and swaps the label for `pendingLabel`.
export function SubmitButton({ children, pendingLabel, className }: { children: ReactNode; pendingLabel: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <>
    {pending && <KopiMessage pose="watching" text={pendingLabel} />}
    <button type="submit" disabled={pending} aria-busy={pending} className={`${className} inline-flex items-center justify-center gap-2 disabled:cursor-progress disabled:opacity-70`}>
      {pending && <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />}
      <span>{pending ? pendingLabel : children}</span>
    </button>
    </>
  );
}
