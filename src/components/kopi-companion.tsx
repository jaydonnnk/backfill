"use client";

import { Suspense, createContext, useContext, useEffect, useId, useReducer, useState, useSyncExternalStore, type Dispatch, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Kopi } from './kopi';
import { updateKopiMessages, type KopiCue, type KopiPageCue, type KopiMessageUpdate } from './kopi-state';

import { useKopiDrag } from './kopi-drag';
import { queueKopi, type KopiEvent, type KopiQueueAction } from './kopi-events';

const MotionContext = createContext<Dispatch<KopiQueueAction> | null>(null);
export function useKopiMotion() { return useContext(MotionContext); }

const CueContext = createContext<Dispatch<KopiMessageUpdate> | null>(null);

export function KopiMessage({ pose, text }: KopiCue) {
  const id = useId();
  const report = useContext(CueContext);
  const path = usePathname();
  useEffect(() => {
    report?.({ id, cue: { path, pose, text } });
    return () => report?.({ id, cue: null });
  }, [report, id, path, pose, text]);
  return null;
}

function guidance(path: string): string {
  if (path === '/demo') return 'Let’s look at the stored scene together.';
  if (path === '/evals') return 'Why Muse Spark runs our counters.';
  if (path === '/system') return 'Diagnostics live here. Model calls can cost money.';
  if (path.includes('/drafts/')) return 'Check the menu, then choose your terms.';
  if (path.startsWith('/merchant')) return 'Your menu. Your terms. I’ll come along.';
  return 'I’m Kopi. Let’s fill the quiet hours.';
}

const preferenceListeners = new Set<() => void>();
let sessionHidden = true;
function readHidden(): boolean {
  try { return localStorage.getItem('backfill-kopi-hidden') !== 'false'; } catch { return sessionHidden; }
}
function subscribeHidden(listener: () => void) {
  preferenceListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => { preferenceListeners.delete(listener); window.removeEventListener('storage', listener); };
}
const serverHidden = () => null;

function Companion({ cue, queue }: { cue: KopiPageCue | undefined; queue: KopiEvent[] }) {
  const query = useSearchParams();
  const motion = useKopiMotion();
  const active = queue[0];
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => motion?.({ kind: 'next' }), 1800);
    return () => clearTimeout(timer);
  }, [active, motion]);
  const path = usePathname();
  const hidden = useSyncExternalStore(subscribeHidden, readHidden, serverHidden);
  const [heroVisible, setHeroVisible] = useState(path === '/');
  useEffect(() => {
    const hero = document.getElementById('kopi-hero');
    if (!hero) return;
    const observer = new IntersectionObserver(([entry]) => setHeroVisible(entry?.isIntersecting ?? false), { threshold: 0.15 });
    observer.observe(hero);
    return () => observer.disconnect();
  }, [path]);
  function toggle() {
    sessionHidden = !hidden;
    try { localStorage.setItem('backfill-kopi-hidden', String(!hidden)); } catch {}
    preferenceListeners.forEach(listener => listener());
  }
  const visible = query.get('kopi') !== 'off' && hidden !== null && !(path === '/' && heroVisible);
  const { ref: companionRef, handle: dragHandle } = useKopiDrag(visible);
  if (!visible) return null;
  const current = active ?? (cue?.path === path ? cue : { pose: 'idle', text: guidance(path) });
  return <aside ref={companionRef} className={`kopi-companion kopi-${current.pose} ${hidden ? 'kopi-hidden' : ''}`} aria-label="Kopi guide" data-motion={active?.motion}>
    {hidden ? <button className="kopi-show" onClick={toggle}>Show Kopi</button> : <>
      <div className="kopi-bubble"><span className="kopi-name">Kopi</span><p role="status" aria-live="polite">{current.text}</p><button onClick={toggle} aria-label="Hide Kopi">×</button></div>
      <button type="button" className="kopi-drag" aria-label="Move Kopi. Drag or use arrow keys." {...dragHandle}><Kopi key={active?.id} motion={active?.motion} /></button>
    </>}
  </aside>;
}

function KopiRouteProvider({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [queue, animate] = useReducer(queueKopi, []);
  const [messages, report] = useReducer(updateKopiMessages, new Map<string, KopiPageCue>());
  const cue = [...messages.values()].reverse().find(message => message.path === path);
  return <MotionContext value={animate}><CueContext value={report}>{children}<Suspense fallback={null}><Companion cue={cue} queue={queue} /></Suspense></CueContext></MotionContext>;
}

export function KopiProvider({ children }: { children: ReactNode }) {
  const path = usePathname();
  return <KopiRouteProvider key={path}>{children}</KopiRouteProvider>;
}
