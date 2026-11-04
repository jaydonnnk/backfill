import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';

const preload = new URL('./proof-s7-loopback.mjs', import.meta.url).pathname;
test('S7 refuses fetch, HTTP, TLS and raw sockets before external transport', () => {
  for (const attempt of [
    "await fetch('https://model.invalid/v1')",
    "(await import('node:http')).get('http://model.invalid/v1')",
    "(await import('node:tls')).connect({host:'model.invalid',port:443})",
    "(await import('node:net')).connect({host:'203.0.113.1',port:443})",
  ]) {
    const child = spawnSync(process.execPath, ['--import', preload, '--input-type=module', '-e', attempt], {
      env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(child.status, 1);
    assert.match(child.stderr, /s7_external_transport_blocked/);
  }
});
test('S7 retains actual loopback HTTP traffic', async () => {
  const server = createServer((_request, response) => response.end('local-only'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert(address && typeof address !== 'string');
    const child = await import('node:child_process').then(({ spawn }) => spawn(process.execPath,
      ['--import', preload, '--input-type=module', '-e', `console.log(await (await fetch('http://127.0.0.1:${address.port}')).text())`],
      { env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] }));
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    const [exit] = await import('node:events').then(({ once }) => once(child, 'exit'));
    assert.equal(exit, 0);
    assert.equal(output.trim(), 'local-only');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
