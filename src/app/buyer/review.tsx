'use client';
import { useRef, useState } from 'react';
import type { Intent } from '@/lib/buyer/models';
import type { Session } from '@/lib/buyer/service';

type Offer = { merchantName: string; summary: string; offer: { ruleId: string } };
const empty: Intent = { partySize: null, visitDate: null, earliest: null, latest: null, budgetPerCoverCents: null, currency: null, requirements: [] };
const button = 'rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-[var(--accent-ink)] disabled:opacity-50';
const field = 'block w-full rounded-md border border-[var(--border)] p-2 bg-transparent';
const notices: Record<string, string> = {
  ok: 'Saved.', model_failed: 'The model is unavailable or its output could not be validated. Nothing was submitted. Correct the request or review constraints manually.',
  revision_changed: 'This request changed. Reload the saved state before continuing.', busy: 'The saved model attempt is still pending. Check saved state; do not start another attempt.',
  approval_required: 'Approve these exact terms first.', approval_mismatch: 'The exact terms do not match. Review them again.', stale_terms: 'The offer changed or its deadline passed. Review constraints and request a fresh decision.',
  review_required: 'Save complete reviewed constraints first.', daily_cap: 'The daily session limit was reached.', attempt_cap: 'This session reached its model-attempt limit.',
  expired: 'This request expired. Start a new request.', unauthorized: 'The buyer credential is missing, invalid or revoked.', unavailable: 'The server is unavailable. Check saved state before any further action.',
};
export function BuyerReview() {
  const [token, setToken] = useState('');
  const [request, setRequest] = useState('');
  const [s, setSession] = useState<Session | null>(null);
  const [constraints, setConstraints] = useState<Intent>(empty);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [ruleId, setRule] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [expired, setExpired] = useState(false);
  const generation = useRef(0);
  const [id, setId] = useState<string | null>(null);
  async function act(action: Record<string, unknown>) {
    const current = ++generation.current;
    setBusy(true);
    try {
      const response = await fetch('/api/buyer', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id, revision: s?.revision, ...action }) });
      const result: { status: string; session: Session | null } = await response.json();
      if (current !== generation.current) return;
      setNotice(notices[result.status] ?? result.status.replaceAll('_', ' '));
      if (result.session) { setExpired(Date.parse(result.session.expiresAt) <= Date.now()); setSession(result.session); setRequest(result.session.request); setConstraints(result.session.constraints ?? result.session.proposal ?? empty); setDirty(false); }
    } catch { if (current === generation.current) setNotice('The response was interrupted. Check saved state before continuing. Your saved approval or submission may have completed.'); }
    finally { setBusy(false); }
  }
  async function loadOffers() {
    setBusy(true);
    try {
      const r = await fetch('/api/buyer', { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      if (r.ok && Array.isArray(data.offers)) { setOffers(data.offers); setRule(data.offers[0]?.offer.ruleId ?? ''); }
      else setNotice('Could not load offers. Check your buyer credential.');
    } catch { setNotice('The offer feed is unavailable. No commitment was submitted.'); }
    finally { setBusy(false); }
  }
  function change(patch: Partial<Intent>) { generation.current++; setConstraints({ ...constraints, ...patch }); setDirty(true); }
  const requestDirty = s !== null && s.request !== request;
  const disabled = busy || dirty || requestDirty;
  const terminal = expired || s?.phase === 'submitted' || s?.phase === 'discarded';
  return <main className="mx-auto max-w-3xl p-5 space-y-6">
    <a href="/demo">Backfill / Kopi</a>
    <h1 className="text-3xl">Review your buyer request</h1>
    <p>Hosted Glimmer through NVIDIA proposes constraints. Your request is sent to the hosted provider. Spark Open recommends a decision. You separately approve exact terms and submit. Checkout is simulated.</p>
    <label className="block">Buyer credential<input className={field} type="password" autoComplete="off" value={token} onChange={e => { generation.current++; setToken(e.target.value); setSession(null); setId(null); setRequest(''); setConstraints(empty); setExpired(false); setDirty(false); setOffers([]); setRule(''); setNotice(''); }} /></label>
    <p className="text-sm">Credential stays in this page&apos;s memory. Agent actions do not establish real-person consent.</p>
    <label className="block">Your request<textarea aria-label="Your request" className={field} maxLength={300} value={request} disabled={terminal} onChange={e => { generation.current++; setRequest(e.target.value); }} /></label>
    <div className="flex flex-wrap gap-2">
      {!s && <button className={button} disabled={busy || !token || !request.trim()} onClick={() => { const nextId = id ?? crypto.randomUUID(); setId(nextId); void act({ id: nextId, action: 'start', request, revision: undefined }); }}>Save request</button>}
      {s && !terminal && <>
        <button className={button} disabled={busy || !requestDirty} onClick={() => act({ action: 'edit', request })}>Save corrected request</button>
        <button className={button} disabled={disabled || s.phase !== 'draft'} onClick={() => act({ action: 'parse' })}>Ask hosted Glimmer</button>
        <button className={button} disabled={busy} onClick={() => act({ action: 'discard' })}>Discard request</button>
      </>}
      {id && <button className={button} disabled={busy} onClick={() => act({ action: 'get', revision: undefined })}>Check saved state</button>}
    </div>
    <p role="status">{notice}</p>
    {s && <>
      <p className="text-sm break-words">Request {s.id}, revision {s.revision}. Reference clock {s.referenceClock}, interpreted in Singapore time. {s.phase === 'clarification' ? 'Clarification required. Complete unknown fields below.' : `State: ${s.phase}.`}</p>
      <p className="text-sm">Glimmer: {s.parseReceipt ? `${s.parseReceipt.source} via ${s.parseReceipt.route}, ${s.parseReceipt.servedModel ?? s.parseReceipt.model}` : 'No model output saved.'}</p>
      <fieldset disabled={busy || terminal} className="grid gap-4 sm:grid-cols-2"><legend>Correct and review proposed constraints</legend>
        <label>Party size<input className={field} type="number" min="1" max="100" value={constraints.partySize ?? ''} onChange={e => change({ partySize: e.target.value ? Number(e.target.value) : null })} /></label>
        <label>Singapore visit date<input className={field} type="date" value={constraints.visitDate ?? ''} onChange={e => change({ visitDate: e.target.value || null })} /></label>
        <label>Earliest arrival<input className={field} type="time" value={constraints.earliest ?? ''} onChange={e => change({ earliest: e.target.value || null })} /></label>
        <label>Latest departure<input className={field} type="time" value={constraints.latest ?? ''} onChange={e => change({ latest: e.target.value || null })} /></label>
        <label>Maximum per cover, in cents<input className={field} type="number" min="0" value={constraints.budgetPerCoverCents ?? ''} onChange={e => change({ budgetPerCoverCents: e.target.value ? Number(e.target.value) : null })} /></label>
        <label>Budget currency<select aria-label="Budget currency" className={field} value={constraints.currency ?? ''} onChange={e => change({ currency: e.target.value === 'SGD' ? 'SGD' : null })}><option value="">Unknown, clarify</option><option value="SGD">SGD</option></select></label>
        <label className="sm:col-span-2">Explicit requirements, one per line<textarea className={field} value={constraints.requirements.join('\n')} onChange={e => change({ requirements: e.target.value.split('\n').filter(Boolean) })} /></label>
      </fieldset>
      <button className={button} disabled={busy || requestDirty || terminal} onClick={() => act({ action: 'review', constraints })}>Save reviewed constraints</button>
      <p>Saving corrections clears the previous decision and approval. Unknown currency, timing, party size or budget requires clarification.</p>
      <button className={button} disabled={busy || !token} onClick={loadOffers}>Load public offers</button>
      <label className="block">Offer<select aria-label="Offer" disabled={busy} className={field} value={ruleId} onChange={e => setRule(e.target.value)}><option value="">Choose an offer</option>{offers.map(o => <option key={o.offer.ruleId} value={o.offer.ruleId}>{o.merchantName}: {o.summary}</option>)}</select></label>
      <button className={button} disabled={disabled || !ruleId || s.phase !== 'reviewed'} onClick={() => act({ action: 'decide', ruleId })}>Ask Spark Open for a decision</button>
      {s.decision && <section className="space-y-3"><h2 className="text-xl">Decision for this party</h2><p>{s.decision.covers} covers. {s.decision.reason}</p><p>{s.decisionReceipt?.source} via {s.decisionReceipt?.route}. Model {s.decisionReceipt?.servedModel ?? s.decisionReceipt?.model}. Actual invoiced cost unknown.</p>
        {s.terms && <p className="break-words">{s.terms.covers} covers on {s.terms.visitDate}, S${(s.terms.pricePerCoverCents / 100).toFixed(2)} each, total S${(s.terms.totalCents / 100).toFixed(2)}. Offer version {s.terms.termsVersion}. {s.offer?.ok && s.offer.terms.summary}</p>}
        {s.terms && s.decision.covers > 0 && <><button className={button} disabled={disabled || terminal || !!s.approval} onClick={() => act({ action: 'approve', terms: s.terms })}>Approve these exact terms</button> <button className={button} disabled={disabled || terminal || !s.approval} onClick={() => act({ action: 'submit' })}>Submit approved commitment</button></>}
        <p>{s.approval ? `Separate approval saved as ${s.approval.source}.` : 'No approval saved.'}</p>
      </section>}
      {s.result?.ok && <p className="break-words">Stored commitment {s.result.commitment.commitmentId}: {s.result.commitment.status}. Pending commitments fill only if the pool qualifies at settlement. <a href="/demo">View pooled outcome</a></p>}
      {terminal && <button className={button} disabled={busy} onClick={() => { generation.current++; setExpired(false); setSession(null); setId(null); setRequest(''); setConstraints(empty); setDirty(false); }}>Start a new request</button>}
    </>}
  </main>;
}
