import Link from 'next/link';

type Lane = { input: string; model: string; proposes: string; check: string; decides: string };
const bands: { name: string; status: string; lanes: Lane[] }[] = [
  { name: 'Café', status: 'live in the product', lanes: [
    { input: 'Menu photo', model: 'Muse Spark', proposes: 'Reads the prices', check: 'Cover must sum printed prices', decides: 'Owner sets terms' },
    { input: 'Buyer agent haggles', model: 'Muse Spark', proposes: 'Drafts a counter-offer', check: 'Never below the private floor', decides: 'Buyer accepts exact terms' },
    { input: 'Slot sells out', model: 'Muse Wonder', proposes: 'Plans revised terms', check: 'No deeper discount or lower minimum', decides: 'Owner approves' },
    { input: 'Owner voice note', model: 'Voice Transcribe', proposes: 'Writes the transcript', check: 'Changes stay in range', decides: 'Owner approves exact change' },
  ] },
  { name: 'Buyer', status: 'live in the buyer sandbox', lanes: [
    { input: 'Buyer request', model: 'Muse Glimmer', proposes: 'Parses it through NVIDIA', check: 'Unknowns stop for clarification', decides: 'Buyer reviews' },
    { input: 'Reviewed request', model: 'Muse Spark Open', proposes: 'Recommends through Vercel AI Gateway', check: 'Offer and deadline rechecked', decides: 'Buyer approves, then submits' },
  ] },
  { name: 'Creative', status: 'enabled for merchants with daily caps; one hosted test on a synthetic image', lanes: [
    { input: 'Dish photo', model: 'SAM 3.1', proposes: 'Segments the dish', check: 'Real photo stays unchanged', decides: 'Owner approves cutout' },
    { input: 'Approved cutout', model: 'Muse Image', proposes: 'Generates a background', check: 'Offer text set by code', decides: 'Owner approves asset' },
  ] },
];

const results = [
  { label: 'Focal seats filled', spark: 6, fixed: 12, max: 12 },
  { label: 'Worlds with a fill, of 12', spark: 3, fixed: 6, max: 12 },
  { label: 'Whole-pool seats', spark: 32, fixed: 48, max: 48 },
];

export default function Evals() {
  return <main className="page eval-board">
    <header className="eval-hero">
      <h1>Spark reads the menu. Code holds the line.</h1>
      <p>AI proposes. Code checks. A person decides. Checkout is simulated.</p>
    </header>

    <section aria-labelledby="line-title">
      <h2 id="line-title" className="eval-title">Eight jobs, seven Meta models, one line</h2>
      <div className="line-grid">
        <p className="line-cols" aria-hidden="true"><span>Goes in</span><span>AI proposes</span><span className="line-col">Code checks</span><span>A person decides</span></p>
        {bands.map(band => <div className="line-band" key={band.name}>
          <h3>{band.name} <span>{band.status}</span></h3>
          <ul>
            {band.lanes.map(lane => <li key={lane.input}>
              <span className="lane-input" data-col="Goes in">{lane.input}</span>
              <span className="lane-model"><strong>{lane.model}</strong>{lane.proposes}</span>
              <span className="lane-check" data-col="Code checks">{lane.check}</span>
              <span className="lane-human" data-col="A person decides">{lane.decides}</span>
            </li>)}
          </ul>
        </div>)}
      </div>
    </section>

    <section className="eval-result" aria-labelledby="result-title">
      <div>
        <h2 id="result-title" className="eval-title">We tested Spark against a simple rule. The guardrails stay.</h2>
        <p>We ran Spark against a fixed policy in a frozen offline test. The fixed rule filled more seats: 12 focal seats to Spark&apos;s 6, and 48 whole-pool seats to 32.</p>
        <p>That backs the design. No model sets the final terms. Prices, capacity, scope and exact terms are checked in code, and models do the work rules can&apos;t: reading menus, transcribing voice notes and drafting offers.</p>
      </div>
    </section>

    <details className="demo-details eval-more"><summary>See the comparison</summary><div className="demo-detail-content">
      <p>Spark filled 6 focal seats in 3 of 12 worlds. The fixed policy filled 12 in 6 of 12. This run did not show AI superiority.</p>
      <figure className="result-chart">
        <figcaption className="result-legend"><span><i className="swatch spark-mark" />Spark</span><span><i className="swatch fixed-mark" />Fixed policy</span></figcaption>
        {results.map(row => <div className="result-row" key={row.label}>
          <p>{row.label}</p>
          <div title={`Spark ${row.spark}`}><span className="bar spark-mark" style={{ width: `calc((100% - 40px) * ${row.spark / row.max})` }} /><b>{row.spark}</b></div>
          <div title={`Fixed policy ${row.fixed}`}><span className="bar fixed-mark" style={{ width: `calc((100% - 40px) * ${row.fixed / row.max})` }} /><b>{row.fixed}</b></div>
        </div>)}
      </figure>
    </div></details>

    <details className="demo-details eval-more"><summary>What the numbers leave out</summary><div className="demo-detail-content">
      <p>Visitors can try Glimmer and Spark Open with a synthetic sandbox merchant. Agent actions do not establish real-person consent.</p>
      <p>The stored scene replays historical buyer decisions. Menu, negotiation and planning attempts recorded in llm_calls have token, cost and latency metadata. Voice, media and sandbox model calls use separate evidence and are excluded from those totals.</p>
    </div></details>

    <div className="actions"><Link className="button primary" href="/buyer">Try it as a buyer</Link><Link className="button" href="/demo">Recorded demo</Link><Link className="button" href="/system">System diagnostics</Link></div>
  </main>;
}
