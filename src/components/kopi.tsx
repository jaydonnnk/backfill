import { useId } from "react";

export function Kopi({ className = "", label, motion }: { className?: string; label?: string; motion?: "nod" | "unlock" | "sold-out" | "shield" | "plan" }) {
  const id = useId();
  const scan = `${id}-scan`, dense = `${id}-dense`;
  return <svg viewBox="75 50 470 530" className={`kopi-art ${className}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
<defs>
<pattern id={scan} width="6" height="7" patternUnits="userSpaceOnUse"><path d="M0 1H6" stroke="currentColor" strokeWidth="2"/></pattern>
<pattern id={dense} width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 0H5" stroke="currentColor" strokeWidth="3"/></pattern>
</defs><g>
<g className="ground" fill={`url(#${scan})`} opacity=".25"><ellipse cx="300" cy="542" rx="182" ry="22"/></g>
<g className="steam" fill="none" stroke="var(--accent)" strokeWidth="8"><path d="M235 178v-24h-13v-25h17v-26"/></g><g className="steam s2" fill="none" stroke="currentColor" strokeWidth="7"><path d="M292 156v-22h16v-25h-13V85"/><path d="M352 176v-25h16v-25"/></g>
<g className="cup-body">
<path d="M238 454v45l-22 19v14h66v-24l-7-13v-38M331 457v41l-8 17v17h70v-14l-24-21v-43" fill="currentColor"/>
<path d="M421 249h45l27 28v69l-30 31h-47v-31h35l13-15v-42l-12-12h-31z" fill={`url(#${dense})`} stroke="currentColor" strokeWidth="4"/>
<path d="M151 235h278l-18 193-26 35-49 17h-94l-48-18-26-35z" fill="var(--background)" stroke="currentColor" strokeWidth="5"/>
<path d="M151 235h278l-18 193-26 35-49 17h-94l-48-18-26-35z" fill={`url(#${scan})`} opacity=".75"/>
<path d="M178 256h45l-1 150 17 40 26 28-25-5-43-21-22-43z" fill="var(--background)" opacity=".8"/>
<path d="M384 260h39l-18 166-27 32-31 12 22-43z" fill={`url(#${dense})`}/>
<ellipse cx="290" cy="234" rx="140" ry="39" fill="var(--background)" stroke="currentColor" strokeWidth="5"/>
<ellipse cx="290" cy="239" rx="119" ry="24" fill="currentColor"/>
<path d="M196 238h47m13 0h108m-135 8h74m10 0h56" stroke="var(--background)" strokeWidth="3" opacity=".6"/>
<path d="M211 292h161v110H211z" fill="var(--background)" opacity=".94"/>
<g className="eyes" fill="currentColor"><path d="M229 311h22v35h-22zM326 311h22v35h-22z"/><path d="M231 313h7v8h-7M328 313h7v8h-7" fill="var(--background)"/></g>
<path d="M266 352v12h12v8h23v-8h12v-12" fill="none" stroke="currentColor" strokeWidth="7"/>
<path d="M213 350h17v8h-17M347 350h17v8h-17" fill="var(--accent)" opacity=".6"/>
<path d="M178 353l-36 25-17-9-12 10 24 25 45-24" fill="var(--background)" stroke="currentColor" strokeWidth="8"/>
<g className="hand"><path d="M414 363l37-31 2-33 16-8 8 13-2 39-49 44" fill="var(--background)" stroke="currentColor" strokeWidth="8"/><path d="M455 299v-20h12v16m8 10 12-13" fill="none" stroke="currentColor" strokeWidth="7"/></g>
<path d="M251 414h79v28h-79z" fill="var(--accent)"/><text x="290" y="434" textAnchor="middle" fill="white" fontFamily="var(--font-display), monospace" fontSize="18">KOPI</text>
{motion === 'shield' && <g className="kopi-prop"><path d="M115 340h90v70l-45 35-45-35z" fill="var(--panel)" stroke="var(--bad)" strokeWidth="8"/><path d="m140 387 15 15 28-35" fill="none" stroke="var(--bad)" strokeWidth="8"/></g>}
{motion === 'sold-out' && <g className="kopi-prop"><path d="M155 415h275v65H155z" fill="var(--panel)" stroke="currentColor" strokeWidth="5"/><text x="292" y="455" textAnchor="middle" fontSize="27" fill="currentColor" fontFamily="var(--font-display), monospace">SOLD OUT</text></g>}
{motion === 'plan' && <g className="kopi-prop" fill="none" stroke="var(--accent)" strokeWidth="8"><path d="M215 305h50v47h-50zM312 305h50v47h-50zM265 325h47"/></g>}
</g></g>
</svg>;
}

export function KopiMark() {
  return <svg viewBox="0 0 32 32" className="kopi-mark" aria-hidden="true"><path fill="var(--accent)" d="M3 8h20v16H3zM23 10h6v11h-6zM7 25h14v3H7zM7 2h3v4H7zM16 0h3v5h-3z"/><path fill="var(--background)" d="M7 13h3v4H7zM16 13h3v4h-3zM11 20h5v2h-5zM23 13h3v5h-3z"/></svg>;
}
