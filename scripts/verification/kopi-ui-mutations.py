"""Prove UI guards against isolated production builds; never mutate the checkout."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import time
import urllib.request

root = Path(__file__).resolve().parents[2]
preview = Path('/tmp/backfill-s95-mutations')
assert subprocess.check_output(['git', 'branch', '--show-current'], cwd=root, text=True).strip() == 'backfill/slice-9.5-pet-dashboard'
preview.mkdir(exist_ok=True)
for name in subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], cwd=root, text=True).splitlines():
    p = Path(name)
    if p.parts[:4] == ('docs', 'plans', 'backfill', 'evidence') or (p.name.startswith('.env') and p.name != '.env.example') or not (root/p).is_file():
        continue
    target = preview/p
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root/p, target)
if not (preview/'node_modules').exists():
    (preview/'node_modules').symlink_to(root/'node_modules', target_is_directory=True)
config = Path('/tmp/backfill-s95-preview/.env.local').read_text()
assert 'DATABASE_URL=postgres://postgres@127.0.0.1:' in config
assert 'META_BASE_URL=https://model.invalid' in config
(preview/'.env.local').write_text(config.replace('http://127.0.0.1:3195', 'http://127.0.0.1:3197'))
(preview/'.env.local').chmod(0o600)
env = {k: os.environ[k] for k in ['PATH', 'HOME']}
env['NEXT_TELEMETRY_DISABLED'] = '1'
cases = [
 ('animation restarts', 'src/components/kopi-companion.tsx', 'key={active?.id} ', '', 'consecutive nods'),
 ('navigation resets queue', 'src/components/kopi-companion.tsx', 'key={path}', '', 'invalidates on navigation'),
 ('query flag', 'src/components/kopi-companion.tsx', "query.get('kopi') !== 'off'", 'true', 'query flag hides'),
 ('queue follows scene', 'src/app/demo/live-board.tsx', 'animate?.(result.queueAction)', "animate?.({ kind: 'enqueue', events: result.events })", 'invalidates on pool'),
 ('stale cancels queue', 'src/app/demo/live-board.tsx', "if (state !== 'live')", 'if (false)', 'invalidates on stale'),
 ('malformed cancels queue', 'src/app/demo/live-board.tsx', 'feed: "stale" }; animate?.({ kind: "clear" });', 'feed: "stale" };', 'invalidates on malformed'),
 ('replay cancels queue', 'src/app/demo/live-board.tsx', "replaying.current = true;\n    animate?.({ kind: 'clear' });", 'replaying.current = true;', 'motion=no-preference'),
 ('queue progresses', 'src/components/kopi-companion.tsx', "() => motion?.({ kind: 'next' })", '() => {}', 'consecutive nods'),
]
originals = {name: (preview/name).read_bytes() for _, name, _, _, _ in cases}
results = []

def check(pattern):
    build = subprocess.run(['node_modules/.bin/next', 'build', '--webpack'], cwd=preview, env=env, capture_output=True, text=True)
    assert build.returncode == 0, 'Isolated mutation build failed; not a valid kill'
    server = subprocess.Popen(['node_modules/.bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3197'], cwd=preview, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen('http://127.0.0.1:3197/demo?kopi=off', timeout=1).close()
                break
            except OSError:
                assert server.poll() is None, 'Isolated server exited'
                time.sleep(.1)
        test_env = dict(env, S95_MUTATION='1')
        return subprocess.run(['node_modules/.bin/playwright', 'test', '--config', 'config/playwright.config.ts', '--grep', pattern], cwd=root, env=test_env, capture_output=True, text=True)
    finally:
        server.terminate()
        server.wait(timeout=15)

try:
    baseline = check('consecutive nods|invalidates|query flag hides|motion=no-preference')
    assert baseline.returncode == 0, 'UI baseline failed'
    for label, name, old, new, pattern in cases:
        assert subprocess.check_output(['git', 'branch', '--show-current'], cwd=root, text=True).strip() == 'backfill/slice-9.5-pet-dashboard'
        original = originals[name]
        assert original.decode().count(old) == 1, f'Ambiguous UI mutation: {label}'
        (preview/name).write_text(original.decode().replace(old, new))
        test = check(pattern)
        killed = test.returncode != 0 and 'expect(' in test.stdout
        results.append({'guard': label, 'killed_by_browser_assertion': killed})
        print(f'{label}: {"killed" if killed else "NOT PROVEN"}', flush=True)
        (preview/name).write_bytes(original)
finally:
    for name, original in originals.items():
        (preview/name).write_bytes(original)
restored = all((preview/name).read_bytes() == original and (root/name).read_bytes() == original for name, original in originals.items())
rerun = check('consecutive nods|invalidates|query flag hides|motion=no-preference')
report = {'files': {name: hashlib.sha256(data).hexdigest() for name, data in originals.items()}, 'checkout_and_preview_byte_identical': restored, 'restored_rerun_passed': rerun.returncode == 0, 'results': results}
(root/'docs/plans/backfill/evidence/s95/ui-mutations.json').write_text(json.dumps(report, indent=2)+'\n')
assert restored and rerun.returncode == 0 and all(r['killed_by_browser_assertion'] for r in results), 'UI mutation proof incomplete'
