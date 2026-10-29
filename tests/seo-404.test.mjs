import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mergeRedirects} from '../scripts/pages-redirects.mjs';

test('the root 404 page is a real not-found document', async () => {
  const html = await readFile('public/404.html', 'utf8');
  const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
  assert.match(html, /<title>Page not found — Apple Pickup Live<\/title>/);
  assert.match(html, /name="robots" content="noindex"/);
  assert.match(html, /href="\/styles.css"/);
  assert.match(html, /This address is not on Apple Pickup Live/);
  assert.doesNotMatch(html, /<script/);
  assert.equal(config.assets.not_found_handling, '404-page');
  assert.notEqual(config.assets.not_found_handling, 'single-page-application');
});

test('Pages redirects keep the API proxy and reject a homepage soft 404', () => {
  const redirects = mergeRedirects('/iphone-duo/ /iphone-duo 301\n');
  assert.match(redirects, /\/api\/latest https:\/\/apple-pickup-live\.o1xhack\.workers\.dev\/api\/latest 302/);
  assert.match(redirects, /\/iphone-duo\/ \/iphone-duo 301/);
  assert.throws(() => mergeRedirects('/* /index.html 200\n'), /real HTTP 404s/);
});
