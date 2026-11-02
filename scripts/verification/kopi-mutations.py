"""Run focused Kopi mutations, restoring source bytes even when a check fails."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
source = root / 'src/components/kopi-events.ts'
original = source.read_bytes()
command = ['npm', 'run', 'test:unit', '--', 'tests/unit/kopi-events.test.ts']
mutations = [
    ('queued state invalidation', 'scope(before) !== scope(scene)', 'false'),
    ('initial buyers remembered', 'new Set(scene?.buyers.map(b => `${scene.id}:buyer:${b.agentId}:${b.committedAt}`))', 'new Set<string>()'),
    ('initial minimum remembered', 'if (scene?.pooled.unlocked)', 'if (false)'),
    ('initial clearing remembered', "if (scene?.phase === 'cleared')", 'if (false)'),
    ('initial sellout remembered', 'if (scene?.pooled.soldOut)', 'if (false)'),
    ('pool identity', 'before.id !== scene.id', 'false'),
    ('new pool baseline', 'for (const id of initialKopiObservation(snapshot, feed).seen) seen.add(id);', ''),
    ('current feed live', "const eligible = feed === 'live' &&", 'const eligible ='),
    ('previous feed live', "previous.feed === 'live' &&", ''),
    ('current replay', '!replay &&', ''),
    ('previous replay', '!previous.replay &&', ''),
    ('recorded provenance', "scene.plan?.provenance !== 'recorded_replay'", 'true'),
    ('event deduplication', '&& !seen.has(event.id)', ''),
    ('no future events', 'age >= 0 &&', ''),
    ('fresh events', 'age <= 15_000', 'true'),
    ('minimum is pending', "&& scene.phase === 'open'", ''),
    ('clearing is a transition', "before.phase === 'open' &&", ''),
    ('pool reconciliation', 'pool?.reconciled', 'pool'),
    ('ledger reconciliation', '&& snapshot.ledger?.reconciled', ''),
    ('clearing freshness', '&& fresh(clearing.at)', ''),
    ('clearing unlocked', '&& scene.pooled.unlocked) {', ') {'),
    ('sellout fact', 'if (scene.pooled.soldOut)', 'if (true)'),
    ('new plan only', '!before.plan &&', ''),
    ('plan freshness', '&& fresh(planEvent.at)', ''),
    ('queue limit', '.slice(0, 3)', ''),
    ('queue advance', 'return queue.slice(1)', 'return queue'),
    ('queue cancellation', "case 'clear': return []", "case 'clear': return queue"),
]

report_name = 'kopi-mutations.json'
if '--position' in sys.argv:
    source = root / 'src/components/kopi-position.ts'
    original = source.read_bytes()
    command[-1] = 'tests/unit/kopi-position.test.ts'
    report_name = 'kopi-position-mutations.json'
    mutations = [
        ('viewport too narrow', 'right < 8 || ', ''),
        ('viewport too short', ' || bottom < 8', ''),
        ('left clamp', 'Math.max(8, Math.min(right, preferred.x))', 'Math.min(right, preferred.x)'),
        ('right clamp', 'Math.min(right, preferred.x)', 'preferred.x'),
        ('top clamp', 'Math.max(8, Math.min(bottom, preferred.y))', 'Math.min(bottom, preferred.y)'),
        ('bottom clamp', 'Math.min(bottom, preferred.y)', 'preferred.y'),
        ('control right edge', 'p.x < c.x + c.width && ', ''),
        ('control left edge', 'p.x + size.width > c.x && ', ''),
        ('control bottom edge', 'p.y < c.y + c.height && ', ''),
        ('control top edge', ' && p.y + size.height > c.y', ''),
    ]

if '--merchant' in sys.argv:
    source = root / 'src/components/merchant-kopi.ts'
    original = source.read_bytes()
    command[-1] = 'tests/unit/merchant-kopi.test.ts'
    report_name = 'merchant-kopi-mutations.json'
    mutations = [
        ('unpublished draft', 'draft.ruleId === null && ', ''),
        ('usable menu', " && draft.verdict === 'ok'", ''),
        ('offers step', 'offerCount > 0', 'false'),
        ('draft identity', 'd.id === publishedDraftId && ', ''),
        ('published record required', ' && d.ruleId !== null', ''),
        ('publication cue', 'if (published)', 'if (false)'),
        ('latest plan', 'plans.at(-1)', 'plans.at(0)'),
        ('plan application', ' && !plan.applied', ''),
        ('plan verdict', "plan.verdict === 'ok'", 'false'),
    ]

def run():
    return subprocess.run(command, cwd=root, capture_output=True, text=True)

assert run().returncode == 0, 'Baseline must pass before mutations'
results = []
try:
    for name, old, new in mutations:
        assert subprocess.check_output(['git', 'branch', '--show-current'], cwd=root, text=True).strip() == 'backfill/slice-9.5-pet-dashboard'
        text = original.decode()
        assert text.count(old) == 1, f'Ambiguous mutation: {name}'
        source.write_text(text.replace(old, new))
        result = run()
        killed = result.returncode != 0 and 'AssertionError' in result.stdout + result.stderr
        results.append({'mutation': name, 'killed_by_assertion': killed})
        print(f'{name}: {"killed" if killed else "SURVIVED or non-assertion failure"}', flush=True)
        source.write_bytes(original)
finally:
    source.write_bytes(original)
assert source.read_bytes() == original, 'Source restoration failed'
rerun = run()
report = {'source_sha256': hashlib.sha256(original).hexdigest(), 'restored_byte_identical': True, 'rerun_passed': rerun.returncode == 0, 'results': results}
(root / 'docs/plans/backfill/evidence/s95' / report_name).write_text(json.dumps(report, indent=2) + '\n')
assert rerun.returncode == 0, 'Restored tests failed'
assert all(r['killed_by_assertion'] for r in results), 'Some mutations survived or failed for the wrong reason'
