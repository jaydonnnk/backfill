"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { percent } from "@/domain/onboarding/replan";
import type { VoiceView } from "@/lib/owner-voice/service";
import { VoiceRecorder } from "./voice-recorder";
import { uploadOwnerVoice, reviewOwnerVoice, proposeOwnerVoice, approveOwnerVoice, discardOwnerVoice } from "./voice-actions";

const button = "button primary";
const secondary = "button";
const notices: Record<string, string> = {
  signed_out: "Your session ended. Open your merchant link again.",
  invalid_audio: "Choose a mono, 16-bit PCM WAV at 16 or 24 kHz, up to 60 seconds and 3 MB.",
  invalid_wav: "This file is not a supported WAV. Choose mono, 16-bit PCM at 16 or 24 kHz.",
  unsupported_wav: "Choose mono, 16-bit PCM WAV at 16 or 24 kHz. Other WAV encodings need conversion before upload.",
  too_long: "The WAV must be no longer than 60 seconds.",
  too_large: "The WAV must be no larger than 3 MB and no longer than 60 seconds.",
  invalid_request: "That request could not be used. Review the transcript and try again.",
  manual_route: "Window and private-floor edits need manual review. No part of this request will apply. Use Add an offer from your menu to review those terms, or contact Backfill to replace an existing offer safely.",
  clarification: "Please say exactly which supported term to change and its new value, then save the corrected transcript.",
  not_understood: "The instruction needs clarification. Correct the transcript with exact values and save it again.",
  no_proposal: "Wonder could not propose a change. Your offer is unchanged.",
  invalid_output: "The model output could not be validated. Your offer is unchanged.",
  failed: "The audio could not be transcribed. Your offer is unchanged. Discard it, record again or upload a new WAV.",
  transcription_failed: "The audio could not be transcribed. Your offer is unchanged. Discard it, record again or upload a new WAV.",
  transcribed: "Check the transcript below. Saving your review does not approve a rule change.",
  reviewed: "Transcript review saved. Ask Wonder for a proposed change.",
  proposed: "Review the exact change below. Your offer still uses its current terms.",
  stale: "The offer changed since this audio was uploaded. Upload a new instruction for the current terms.",
  expired: "This voice edit expired. Upload a new instruction.",
  superseded: "A newer voice edit replaced this one. Your offer is unchanged by this edit.",
  pending: "Buyers have pending commitments on this offer. No change was applied.",
  cancelled: "Discarded. Your offer is unchanged.",
  owner_discarded: "Discarded. Your offer is unchanged.",
  replaced_audio: "A newer audio upload replaced this edit.",
  applied: "Applied. Your offer now uses the approved terms.",
  already_applied: "This exact change was already applied. No duplicate change was made.",
  below_floor: "This proposal is below your private floor and cannot apply.",
  unchanged: "Those are already your terms. Nothing would change.",
  not_found: "This voice edit is unavailable for your account.",
  busy: "This request is still being processed. It has not changed your offer.",
  revision_changed: "The transcript review changed. Review the saved text before continuing.",
  daily_cap: "Today's voice-edit limit has been reached. Your offer is unchanged.",
  capacity_out_of_range: "Capacity must be between 1 and 10,000 covers. Correct the transcript and save it again.",
  min_pool_out_of_range: "The minimum pool must be at least 1 and no more than capacity.",
  cap_out_of_range: "The per-agent cap must be at least 1 and no more than capacity.",
  discount_out_of_range: "The proposed discount is outside the allowed range. Correct the transcript and save it again.",
};

export function OwnerVoice({ ruleId, termsVersion }: { ruleId: string; termsVersion: number }) {
  const router = useRouter();
  const [edit, setEdit] = useState<VoiceView | null>(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const uploadAttempt = useRef<{ key: string; id: string } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const dirty = edit !== null && text !== edit.transcript;
  const terminal = edit !== null && ["applied", "cancelled", "superseded"].includes(edit.phase);

  async function perform(label: string, work: () => Promise<{ status: string; edit: VoiceView | null }>) {
    const current = ++generation.current;
    setPending(label); setNotice("");
    try {
      const result = await work();
      if (generation.current !== current) return;
      setEdit(result.edit);
      if (result.edit) { setText(result.edit.transcript ?? ""); setActiveId(result.edit.id); }
      const reason = result.edit?.reason ?? result.status;
      setNotice(notices[reason] ?? (result.status === "ok" ? "" : "Your offer is unchanged. Review this instruction before continuing."));
      if (result.edit?.phase === "applied") router.refresh();
    } catch {
      if (generation.current === current) setNotice("The request was interrupted. No approval was recorded by this screen. Check your current offer before trying again.");
    } finally {
      if (generation.current === current) setPending(null);
    }
  }

  async function upload(form: FormData) {
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0 || audio.size > 3 * 1024 * 1024) {
      setNotice(notices.invalid_audio ?? "Unsupported audio.");
      return;
    }
    setPending("Checking audio…");
    let key: string;
    try {
      const digest = await crypto.subtle.digest("SHA-256", await audio.arrayBuffer());
      key = `${ruleId}/${termsVersion}/${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
    } catch {
      setPending(null); setNotice("The WAV could not be read. Your offer is unchanged.");
      return;
    }
    // A lost response must retry the same reservation, not spend on another transcription.
    if (uploadAttempt.current?.key !== key) uploadAttempt.current = { key, id: crypto.randomUUID() };
    const id = uploadAttempt.current.id;
    setActiveId(id);
    form.set("id", id); form.set("ruleId", ruleId); form.set("termsVersion", String(termsVersion));
    setEdit(null); setText("");
    return perform("Transcribing…", () => uploadOwnerVoice(form));
  }

  async function discard() {
    const id = activeId;
    if (!id) return;
    await perform("Discarding…", async () => {
      const result = await discardOwnerVoice({ id });
      if (result.status === "cancelled") uploadAttempt.current = null;
      return result;
    });
  }

  return (
    <fieldset aria-label={`Voice edit for offer ${ruleId}`} className="tool-panel">
      <p>Say the new discount, capacity, minimum pool or per-agent cap. Nothing changes until you approve it.</p>
      <VoiceRecorder disabled={pending !== null} onNotice={setNotice} onRecorded={wav => { const form = new FormData(); form.set("audio", wav); void upload(form); }} />
      <form action={upload} className="tool-form tool-upload">
        <label>Or upload an owner instruction WAV
          <input name="audio" type="file" accept=".wav,audio/wav" required disabled={pending !== null} />
        </label>
        <p className="small">Mono PCM WAV, 16-bit, 16 or 24 kHz, up to 60 seconds and 3 MB.</p>
        <button type="submit" disabled={pending !== null} className={secondary}>Transcribe audio</button>
      </form>
      <p className="small">Audio is sent for transcription and then discarded; its hash and the private transcript are kept.</p>
      {pending && <p role="status" className="small">{pending}</p>}
      {notice && <p role="status" className="small">{notice}</p>}
      {edit && edit.rawTranscript !== null && (
        <>
          <p className="small">{edit.source === "fixture" ? "Fixture transcript. Authored text attached to a test WAV; this does not prove transcription." : "Voice transcript. Check every value before continuing."}</p>
          <label className="tool-label">Review transcript
            <textarea maxLength={500} rows={4} value={text} disabled={pending !== null || terminal} onChange={event => { setText(event.target.value); setNotice(""); }}  />
          </label>
          {dirty && <p className="small">The text changed. Save it to replace the previous review and invalidate its proposal.</p>}
          {!terminal && <div className="actions">
            <button type="button" className={secondary} disabled={pending !== null || !text.trim()} onClick={() => perform("Saving review…", () => reviewOwnerVoice({ id: edit.id, revision: edit.revision, text }))}>Save reviewed transcript</button>
            {edit.phase === "reviewed" && !dirty && <button type="button" className={button} disabled={pending !== null} onClick={() => perform("Asking Wonder…", () => proposeOwnerVoice({ id: edit.id, revision: edit.revision }))}>Ask Wonder for proposal</button>}
          </div>}
          {edit.phase === "proposed" && edit.proposal && !dirty && (
            <div className="tool-form">
              <p className="small">{edit.source === "fixture" ? "Fixture Wonder proposal" : "Wonder proposal"}. Offer v{edit.termsVersion}, reviewed transcript v{edit.revision}. Expires {new Date(edit.expiresAt).toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit" })} Singapore time.</p>
              <p className="small">{edit.proposal.reply}</p>
              <table>
                <caption>Exact change for this offer</caption>
                <thead><tr><th scope="col">Term</th><th scope="col">Current</th><th scope="col">Proposed</th></tr></thead>
                <tbody>
                  {[
                    ["Discount", percent(edit.before.discountBps), percent(edit.proposal.discountBps)],
                    ["Capacity", edit.before.capacityCovers, edit.proposal.capacityCovers],
                    ["Minimum pool", edit.before.minPoolCovers, edit.proposal.minPoolCovers],
                    ["Per-agent cap", edit.before.perAgentCapCovers, edit.proposal.perAgentCapCovers],
                  ].map(([term, before, after]) => <tr key={term}><th scope="row">{term}</th><td>{before}</td><td>{after}</td></tr>)}
                </tbody>
              </table>
              <p className="small">Review did not approve this change. The visit window and private floor stay the same. Buyer parties still approve their own commitments.</p>
              <button type="button" className={button} disabled={pending !== null} onClick={() => perform("Applying approved change…", () => approveOwnerVoice({ id: edit.id, revision: edit.revision, proposalId: edit.proposalId }))}>Approve this exact change</button>
            </div>
          )}
          {edit.approval && <p className="small">Separate owner action recorded for proposal {edit.approval.proposalId}. Terms v{edit.approval.version}.</p>}
        </>
      )}
      {activeId && !terminal && <button type="button" className={secondary} onClick={discard} disabled={pending === "Discarding…"}>Discard voice edit</button>}
    </fieldset>
  );
}
