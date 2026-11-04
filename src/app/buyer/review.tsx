'use client';
import { useRef, useState } from 'react';
import type { Intent } from '@/lib/buyer/models';
import { SandboxConnect } from './sandbox-connect';
import type { Session } from '@/lib/buyer/service';
import { KopiMark } from '@/components/kopi';
import { KopiMessage } from '@/components/kopi-companion';
import type { KopiCue } from '@/components/kopi-state';

type Offer = { merchantName: string; summary: string; nextOccurrence: {visitDate:string}; offer: { ruleId: string } };
const empty: Intent = { partySize: null, visitDate: null, earliest: null, latest: null, budgetPerCoverCents: null, currency: null, requirements: [] };
type Step = 'ask' | 'check' | 'decide' | 'approve' | 'done';
const STEPS: { id: Step; label: string }[] = [{ id: 'ask', label: 'Ask' }, { id: 'check', label: 'Check' }, { id: 'decide', label: 'Decide' }, { id: 'approve', label: 'Approve' }];
const ORDER: Step[] = ['ask', 'check', 'decide', 'approve', 'done'];
const CUES: Record<Step, KopiCue> = {
  ask: { pose: 'idle', text: 'Tell me what you fancy.' },
  check: { pose: 'watching', text: 'Check what Glimmer understood.' },
  decide: { pose: 'watching', text: 'Pick an offer. Spark Open weighs it up.' },
  approve: { pose: 'watching', text: 'Nothing joins until you approve.' },
  done: { pose: 'happy', text: 'You are in the group.' },
};
function stepOf(s: Session | null): Step {
  if (!s) return 'ask';
  if (s.phase === 'submitted') return 'done';
  if (s.phase === 'decided') return 'approve';
  if (s.phase === 'reviewed' || s.phase === 'deciding') return 'decide';
  if (s.phase === 'parsed' || s.phase === 'clarification' || s.phase === 'failed') return 'check';
  return 'ask';
}
const money = (cents: number) => `S$${(cents / 100).toFixed(2)}`;
const notices: Record<string, string> = {
  incompatible_offer: 'This offer runs 14:00-17:00. Widen your time window or use the example.',
  ok: '', model_failed: 'The model is unavailable or its output could not be validated. Nothing was submitted. Correct the request or review constraints manually.',
  revision_changed: 'This request changed. Reload the saved state before continuing.', busy: 'The saved model attempt is still pending. Check saved state; do not start another attempt.',
  approval_required: 'Approve these exact terms first.', approval_mismatch: 'The exact terms do not match. Review them again.', stale_terms: 'The offer changed or its deadline passed. Review constraints and request a fresh decision.',
  review_required: 'Save complete reviewed constraints first.', daily_cap: 'The daily session limit was reached.', attempt_cap: 'This session reached its model-attempt limit.',
  expired: 'This request expired. Start a new request.', unauthorized: 'The buyer credential is missing, invalid or revoked.', unavailable: 'The server is unavailable. Check saved state before any further action.',
};
export function BuyerReview() {
  const [token, setToken] = useState('');
  const [sandboxToken, setSandboxToken] = useState('');
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
  const [peek, setPeek] = useState<Step | null>(null);
  async function act(action: Record<string, unknown>, credential = token) {
    const current = ++generation.current;
    setBusy(true);
    setPeek(null);
    try {
      const response = await fetch('/api/buyer', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credential}` }, body: JSON.stringify({ id, revision: s?.revision, ...action }) });
      const result: { status: string; session: Session | null } = await response.json();
      if (current !== generation.current) return;
      setNotice(notices[result.status] ?? result.status.replaceAll('_', ' '));
      if (result.session?.phase === 'reviewed' && offers.length === 0) void loadOffers();
      if (result.session) { setExpired(Date.parse(result.session.expiresAt) <= Date.now()); setSession(result.session); setRequest(result.session.request); setConstraints(result.session.constraints ?? result.session.proposal ?? empty); setDirty(false); }
    } catch { if (current === generation.current) setNotice('The response was interrupted. Check saved state before continuing. Your saved approval or submission may have completed.'); }
    finally { setBusy(false); }
  }
  async function loadOffers() {
    setBusy(true);
    try {
      const r = await fetch('/api/buyer', { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      if (r.ok && Array.isArray(data.offers)) { const ordered = [...data.offers].sort((a: Offer,b: Offer) => a.nextOccurrence.visitDate.localeCompare(b.nextOccurrence.visitDate)); setOffers(ordered); setRule(ordered[0]?.offer.ruleId ?? ''); }
      else setNotice('Could not load offers. Check your buyer credential.');
    } catch { setNotice('The offer feed is unavailable. No commitment was submitted.'); }
    finally { setBusy(false); }
  }
  // A visitor without a credential gets a sandbox one the first time they need it.
  async function openSandbox(): Promise<string | null> {
    if (token) return token;
    const response = await fetch('/api/buyer/sandbox', {method:'POST'});
    const result = await response.json();
    if (!response.ok || typeof result.token !== 'string') {setNotice('The sandbox is unavailable or its hourly limit was reached. Try again later.');return null;}
    setToken(result.token); setSandboxToken(result.token);
    return result.token;
  }
  async function saveRequest() {
    setBusy(true);
    let credential: string | null = null;
    try { credential = await openSandbox(); } catch { setNotice('The sandbox is unavailable. Try again later.'); }
    if (!credential) { setBusy(false); return; }
    const nextId = id ?? crypto.randomUUID();
    setId(nextId);
    await act({ id: nextId, action: 'start', request, revision: undefined }, credential);
  }
  async function example() {
    setBusy(true);
    try {
      const credential = await openSandbox();
      if (!credential) return;
      const response = await fetch('/api/buyer', {headers:{Authorization:`Bearer ${credential}`}});
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.offers) || !data.offers.length) {setNotice('The sandbox offer is unavailable.');return;}
      const ordered: Offer[] = [...data.offers].sort((a:Offer,b:Offer)=>a.nextOccurrence.visitDate.localeCompare(b.nextOccurrence.visitDate));
      generation.current++; setPeek(null);setSession(null);setId(null);setConstraints(empty);setExpired(false);setDirty(false);
      setOffers(ordered);setRule(ordered[0]!.offer.ruleId);
      setRequest(`Table for 2 on ${ordered[0]!.nextOccurrence.visitDate}, between 14:00 and 17:00, up to S$6 per person`);
    } catch {setNotice('The sandbox is unavailable. Try again later.');}
    finally {setBusy(false);}
  }
  function change(patch: Partial<Intent>) { generation.current++; setConstraints({ ...constraints, ...patch }); setDirty(true); }
  const requestDirty = s !== null && s.request !== request;
  const disabled = busy || dirty || requestDirty;
  const terminal = expired || s?.phase === 'submitted' || s?.phase === 'discarded';
  const reached = stepOf(s);
  const step = peek ?? reached;
  const pooled = s?.result?.ok ? s.result.commitment.pooledCovers ?? 0 : 0;
  const minimum = s?.result?.ok ? s.result.commitment.minPoolCovers ?? 4 : 4;
  const chosen = offers.find(o => o.offer.ruleId === (s?.terms?.ruleId || ruleId));
  const stamp = s === null ? 'Not started' : terminal && s.phase !== 'submitted' ? 'Closed' : s.phase === 'submitted' ? 'Joined' : s.approval ? 'Approved, not yet submitted' : 'Not booked';
  return <main className="page buyer-page">
    <KopiMessage {...CUES[reached]} />
    <header className="buyer-head">
      <div>
        <h1>Book a quiet-hour table</h1>
        <p>Say what you want. AI drafts it. Nothing joins until you approve.</p>
      </div>
      <div className="actions">
        <button className="button" disabled={busy} onClick={example}>Use example</button>
        {id && <button className="button" disabled={busy} onClick={() => act({ action: 'get', revision: undefined })}>Check saved state</button>}
      </div>
    </header>

    <ol className="buyer-steps" aria-label="Your progress">
      {STEPS.map((item, i) => {
        const open = ORDER.indexOf(item.id) <= ORDER.indexOf(reached);
        const finished = ORDER.indexOf(item.id) < ORDER.indexOf(reached);
        return <li key={item.id} className={`${finished ? 'finished' : ''} ${step === item.id ? 'current' : ''}`} aria-current={step === item.id ? 'step' : undefined}>
          <button type="button" disabled={!open || reached === 'done'} onClick={() => setPeek(item.id === reached ? null : item.id)}><span aria-hidden="true">{finished ? '✓' : i + 1}</span>{item.label}</button>
        </li>;
      })}
    </ol>

    <div className="buyer-flow">
      <div className="buyer-card">
        <p role="status" className={notice ? 'buyer-notice' : 'buyer-notice empty'}>{notice}</p>

        {step === 'ask' && <section className="buyer-step">
          <h2>What are you after?</h2>
          <label>Your request<textarea aria-label="Your request" rows={4} maxLength={300} placeholder="Kopi and kaya toast for two, Thursday after 2pm, up to S$6 each" value={request} disabled={terminal} onChange={e => { generation.current++; setRequest(e.target.value); }} /></label>
          <div className="actions">
            {!s && <button className="button primary" disabled={busy || !request.trim()} onClick={saveRequest}>Save request</button>}
            {s && !terminal && <>
              {s.phase === 'draft' && !requestDirty && <button className="button primary" disabled={disabled} onClick={() => act({ action: 'parse' })}>Ask hosted Glimmer</button>}
              {(requestDirty || s.phase !== 'draft') && <button className="button primary" disabled={busy || !requestDirty} onClick={() => act({ action: 'edit', request })}>Save corrected request</button>}
              <button className="button" disabled={busy} onClick={() => act({ action: 'discard' })}>Discard request</button>
            </>}
          </div>
          <p className="buyer-fine">Your request is sent to NVIDIA and Vercel AI Gateway. Keep it free of private details.</p>
        </section>}

        {step === 'check' && s && <section className="buyer-step">
          <h2>Did Glimmer get it right?</h2>
          <blockquote>{s.request}</blockquote>
          <fieldset disabled={busy || terminal} className="buyer-fields"><legend>Correct and review proposed constraints</legend>
            <label>Party size<input type="number" min="1" max="100" value={constraints.partySize ?? ''} onChange={e => change({ partySize: e.target.value ? Number(e.target.value) : null })} /></label>
            <label>Singapore visit date<input type="date" value={constraints.visitDate ?? ''} onChange={e => change({ visitDate: e.target.value || null })} /></label>
            <label>Earliest arrival<input type="time" value={constraints.earliest ?? ''} onChange={e => change({ earliest: e.target.value || null })} /></label>
            <label>Latest departure<input type="time" value={constraints.latest ?? ''} onChange={e => change({ latest: e.target.value || null })} /></label>
            <label>Most per person, in S$<input type="number" min="0" step="0.01" value={constraints.budgetPerCoverCents === null ? '' : constraints.budgetPerCoverCents / 100} onChange={e => change({ budgetPerCoverCents: e.target.value ? Math.round(Number(e.target.value) * 100) : null })} /></label>
            <label>Budget currency<select aria-label="Budget currency" value={constraints.currency ?? ''} onChange={e => change({ currency: e.target.value === 'SGD' ? 'SGD' : null })}><option value="">Unknown, clarify</option><option value="SGD">SGD</option></select></label>
            <label className="wide">Explicit requirements, one per line<textarea rows={2} value={constraints.requirements.join('\n')} onChange={e => change({ requirements: e.target.value.split('\n').filter(Boolean) })} /></label>
          </fieldset>
          <div className="actions"><button className="button primary" disabled={busy || requestDirty || terminal} onClick={() => act({ action: 'review', constraints })}>Save reviewed constraints</button></div>
          <p className="buyer-fine">Glimmer: {s.parseReceipt ? `${s.parseReceipt.source} via ${s.parseReceipt.route}, ${s.parseReceipt.servedModel ?? s.parseReceipt.model}` : 'No model output saved.'}</p>
          <p className="buyer-fine">{s.phase === 'clarification' ? 'Clarification required. Complete the empty fields.' : 'Saving corrections clears any earlier decision and approval.'}</p>
        </section>}

        {step === 'decide' && s && <section className="buyer-step">
          <h2>Pick an offer</h2>
          <label>Offer<select aria-label="Offer" disabled={busy} value={ruleId} onChange={e => setRule(e.target.value)}><option value="">Choose an offer</option>{offers.map(o => <option key={o.offer.ruleId} value={o.offer.ruleId}>{o.merchantName}: {o.summary}</option>)}</select></label>
          <div className="actions">
            <button className="button primary" disabled={disabled || !ruleId || s.phase !== 'reviewed'} onClick={() => act({ action: 'decide', ruleId })}>Ask Spark Open for a decision</button>
            <button className="button" disabled={busy || !token} onClick={loadOffers}>Load public offers</button>
          </div>
          <p className="buyer-fine">Spark Open recommends. It cannot book anything for you.</p>
        </section>}

        {step === 'approve' && s?.decision && <section className="buyer-step">
          <h2>Decision for this party</h2>
          <blockquote>{s.decision.covers} covers. {s.decision.reason}</blockquote>
          {s.terms && <p className="buyer-fine">Offer version {s.terms.termsVersion}. {s.offer?.ok && s.offer.terms.summary}</p>}
          {s.terms && s.decision.covers > 0 && <div className="actions">
            <button className={`button ${s.approval ? '' : 'primary'}`} disabled={disabled || terminal || !!s.approval} onClick={() => act({ action: 'approve', terms: s.terms })}>Approve these exact terms</button>
            <button className={`button ${s.approval ? 'primary' : ''}`} disabled={disabled || terminal || !s.approval} onClick={() => act({ action: 'submit' })}>Submit approved commitment</button>
          </div>}
          <p className="buyer-fine">{s.approval ? `Separate approval saved as ${s.approval.source}.` : 'No approval saved.'} Checkout is simulated.</p>
          <p className="buyer-fine">{s.decisionReceipt?.source} via {s.decisionReceipt?.route}. Model {s.decisionReceipt?.servedModel ?? s.decisionReceipt?.model}. Actual invoiced cost unknown.</p>
        </section>}

        {step === 'done' && s?.result?.ok && <section className="buyer-step">
          <h2>You joined the group</h2>
          <p className="buyer-result">Pooled covers: {pooled} / {minimum}</p>
          <p>You fill only if the group reaches its minimum at settlement.</p>
          <div className="actions"><a className="button primary" href="/demo">View pooled outcome</a></div>
          <p className="buyer-fine">Stored commitment {s.result.commitment.commitmentId}: {s.result.commitment.status}.</p>
        </section>}

        {terminal && <div className="actions"><button className="button" disabled={busy} onClick={() => { generation.current++; setPeek(null); setExpired(false); setSession(null); setId(null); setRequest(''); setConstraints(empty); setDirty(false); }}>Start a new request</button></div>}
      </div>

      <aside className="chit" aria-label="Your table so far">
        <p className="chit-title"><KopiMark /> Your table</p>
        <dl>
          <div><dt>Party</dt><dd>{constraints.partySize ?? '-'}</dd></div>
          <div><dt>Date</dt><dd>{constraints.visitDate ?? '-'}</dd></div>
          <div><dt>Time</dt><dd>{constraints.earliest && constraints.latest ? `${constraints.earliest} to ${constraints.latest}` : '-'}</dd></div>
          <div><dt>Budget each</dt><dd>{constraints.budgetPerCoverCents === null ? '-' : money(constraints.budgetPerCoverCents)}</dd></div>
          <div><dt>Café</dt><dd>{chosen?.merchantName ?? '-'}</dd></div>
          {s?.terms && <div><dt>{s.terms.covers} covers at</dt><dd>{money(s.terms.pricePerCoverCents)}</dd></div>}
          {s?.terms && <div className="chit-total"><dt>Total</dt><dd>{money(s.terms.totalCents)}</dd></div>}
        </dl>
        {s?.result?.ok && <div className="seat-row" role="img" aria-label={`${pooled} of ${minimum} seats joined`}>{Array.from({ length: Math.min(Math.max(minimum, pooled), 24) }, (_, i) => <span key={i} className={i < pooled ? 'on' : ''} />)}</div>}
        <p className="chit-stamp">{stamp}</p>
      </aside>
    </div>

    <footer className="buyer-dev">
      <details><summary>Use an existing buyer credential</summary><label>Buyer credential<input type="password" autoComplete="off" value={token} onChange={e => { generation.current++; setPeek(null); setToken(e.target.value); setSandboxToken(''); setSession(null); setId(null); setRequest(''); setConstraints(empty); setExpired(false); setDirty(false); setOffers([]); setRule(''); setNotice(''); }} /></label><p className="buyer-fine">Credential stays in this page&apos;s memory. Agent actions do not establish real-person consent.</p></details>
      <SandboxConnect token={sandboxToken} />
    </footer>
  </main>;
}
