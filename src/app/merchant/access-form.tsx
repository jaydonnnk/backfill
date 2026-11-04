"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { merchantTokenFromLink } from "@/domain/onboarding/access";
import { createWorkspace, enterWithToken, type CreateWorkspaceState } from "./actions";

const inputClass = "w-full min-w-0 border border-[var(--border)] bg-[var(--panel)] px-3 py-3 text-base";
const messages = { idle: "", invalid_name: "Enter a café name of up to 120 characters.", rate_limited: "Signups are busy. Try again later.", failed: "Couldn't create your workspace. Try again." };

export function MerchantAccessForm() {
  const router = useRouter();
  const [state, create, creating] = useActionState<CreateWorkspaceState, FormData>(createWorkspace, { status: "idle" });
  const [opening, startOpening] = useTransition();
  const [error, setError] = useState("");
  const busy = creating || opening;

  function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const field = event.currentTarget.elements.namedItem("accessLink");
    if (!(field instanceof HTMLInputElement)) return;
    const token = merchantTokenFromLink(field.value, window.location.origin);
    field.value = "";
    if (!token) { setError("That link isn't valid for this site."); return; }
    setError("");
    startOpening(async () => {
      try {
        if (await enterWithToken(token)) { router.replace("/merchant"); router.refresh(); }
        else setError("That link isn't valid.");
      } catch { setError("Couldn't open your workspace. Try again."); }
    });
  }

  return <div className="grid gap-10 md:grid-cols-2">
    <section className="min-w-0 border-t-2 border-[var(--foreground)] pt-5">
      <h2 className="mb-5 text-xl font-semibold">New to Backfill?</h2>
      <form action={create} className="flex flex-col items-start gap-4">
        <label className="flex w-full min-w-0 flex-col gap-2">Café or restaurant name<input className={inputClass} name="name" autoComplete="organization" placeholder="Your café name" maxLength={120} required disabled={busy} /></label>
        <button className="button primary" type="submit" disabled={busy} aria-busy={creating}>{creating ? "Creating…" : "Create my workspace"}</button>
        <p className="small" role="status">{messages[state.status]}</p>
      </form>
      <p className="small">Save your access link. Lost links can&apos;t be recovered.</p>
      <p className="small">You review every offer before publishing.</p>
    </section>
    <section className="min-w-0 border-t-2 border-[var(--foreground)] pt-5">
      <h2 className="mb-5 text-xl font-semibold">Already have a workspace?</h2>
      <form onSubmit={open} className="flex flex-col items-start gap-4">
        <label className="flex w-full min-w-0 flex-col gap-2">Your private access link<input className={inputClass} name="accessLink" type="password" autoComplete="off" placeholder="Paste your saved link" required disabled={busy} /></label>
        <button className="button" type="submit" disabled={busy} aria-busy={opening}>{opening ? "Opening…" : "Open my workspace"}</button>
        <p className="small" role="status">{error}</p>
      </form>
    </section>
  </div>;
}
