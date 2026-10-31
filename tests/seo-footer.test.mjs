import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {footerHtml, pageShell} from '../scripts/seo-layout.mjs';

test('new pages link to the hub and the author without changing the homepage footer', async () => {
  for (const html of [footerHtml(), pageShell({title: 'Guide', description: 'Guide page.', path: '/iphone-duo', body: '<p>Guide</p>'}), await readFile('public/404.html', 'utf8')]) {
    const footer = html.slice(html.lastIndexOf('<footer>'));
    assert.match(footer, /href="https:\/\/app\.o1xhack\.com\/"/);
    assert.match(footer, /href="https:\/\/x\.com\/o1xhack"/);
    assert.match(footer, /href="\/iphone-duo"/);
    assert.match(footer, /href="\/restock-times"/);
    assert.match(footer, /href="\/stores"/);
  }
  const home = await readFile('public/index.html', 'utf8');
  const body = home.slice(home.indexOf('<body>'));
  assert.doesNotMatch(body, /footer-links|restock-times|\/iphone-duo|x\.com\/o1xhack/);
  assert.match(body, /href="https:\/\/github\.com\/o1xhack\/apple-pickup-live"/);
});
