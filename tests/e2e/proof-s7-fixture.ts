import { test as base, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

export const test = base.extend<{ isolation: void }>({
  isolation: [async ({ context, page }, use, testInfo) => {
    const external: string[] = [], errors: string[] = [];
    const httpErrors: { path: string; status: number }[] = [];
    page.on('response', response => {
      if (response.status() >= 400) httpErrors.push({ path: new URL(response.url()).pathname, status: response.status() });
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return route.continue();
      external.push(url.origin);
      return route.abort('blockedbyclient');
    });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    if (httpErrors.length) await testInfo.attach('http-errors', { body: JSON.stringify(httpErrors, null, 2), contentType: 'application/json' });
    const evidence = process.env.S5_EVIDENCE_DIR;
    if (evidence) await writeFile(`${evidence}/http-${createHash('sha256').update(testInfo.title).digest('hex').slice(0, 12)}.json`, JSON.stringify({ test: testInfo.title, httpErrors, external, pageErrors: errors }, null, 2) + '\n');
    expect(external, 'Browser attempted external transport').toEqual([]);
    expect(errors, 'Uncaught browser errors').toEqual([]);
  }, { auto: true }],
});
