import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hourRange, prerender, storeLabel} from '../scripts/prerender.mjs';
import {writeSeoFiles, SITE_ORIGIN} from '../scripts/seo-files.mjs';
import {pacificHour, summarizeEvents} from '../scripts/restock-summary.mjs';
import stores from '../data/us-stores.json' with {type: 'json'};

function visible(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

test('Pacific hours and candidate restocks ignore other events', () => {
  const midnight = Date.parse('2026-10-25T07:00:00.000Z');
  assert.equal(pacificHour(midnight), 0);
  const morning = Date.parse('2026-10-27T13:30:00.000Z');
  const summary = summarizeEvents([
    {id: 'a', ts: morning, store: 'R001', part: 'MK1E4LL/A', state: '1', kind: 'candidate_restock', source: 'national'},
    {id: 'b', ts: morning, store: 'R001', part: 'MK1E4LL/A', state: '1', kind: 'first_or_recovered', source: 'national'},
    {id: 'c', ts: morning - 10 * 86400000, store: 'R001', part: 'MK1E4LL/A', state: '1', kind: 'candidate_restock', source: 'legacy_ca'},
    {id: 'd', ts: morning, store: 'R001', part: 'MK1E4LL/A', state: '0', kind: 'candidate_restock', source: 'national'}
  ], {statisticsStartedAt: Date.parse('2026-10-24T07:00:00.000Z'), publishedAt: morning});
  assert.equal(summary.candidateRestocks, 1);
  assert.equal(summary.firstOrRecovered, 1);
  assert.equal(summary.hours[pacificHour(morning)], 1);
  assert.equal(summary.byStore.R001, 1);
});

test('prerendered pages contain HTML text, schema, and sitemap URLs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'seo-pages-'));
  try {
    const files = await prerender(dir);
    assert.equal(files.length, stores.length + 3);
    const guide = await readFile(join(dir, 'iphone-duo.html'), 'utf8');
    const restock = await readFile(join(dir, 'restock-times.html'), 'utf8');
    const index = await readFile(join(dir, 'stores.html'), 'utf8');
    const store = await readFile(join(dir, 'store', 'thesummit.html'), 'utf8');
    const guideText = visible(guide);
    assert.match(guide, /"@type":"FAQPage"/);
    assert.match(guideText, /How do I find iPhone Duo in stock near me/);
    assert.match(guideText, /does not send a request to Apple/);
    assert.match(guide, /rel="canonical" href="https:\/\/pickup\.o1xhack\.com\/iphone-duo"/);
    assert.match(guide, /name="twitter:card" content="summary_large_image"/);
    assert.match(restock, /"@type":"Dataset"/);
    assert.match(restock, /"@type":"BreadcrumbList"/);
    assert.match(visible(restock), /not an Apple restock schedule and not a count of phones/);
    assert.match(visible(restock), new RegExp(hourRange(6)));
    assert.match(index, /href="\/store\/thesummit"/);
    const english = html => html.slice(0, html.indexOf('<template id="page-zh"'));
    const chinese = html => html.slice(html.indexOf('<template id="page-zh"'));
    assert.equal(english(index).match(/href="\/store\//g).length, stores.length);
    assert.equal(chinese(index).match(/href="\/store\//g).length, stores.length);
    for (const html of [guide, restock, index, store]) {
      assert.match(english(html), /data-language-toggle[^>]*>中文</);
      assert.match(chinese(html), /data-language-toggle[^>]*>English</);
      assert.match(html, /<script src="\/page-language\.js"><\/script>/);
    }
    assert.match(chinese(guide), /data-title="iPhone Duo 取货库存/);
    assert.match(chinese(guide), /怎么查附近哪家有 iPhone Duo 现货/);
    assert.match(chinese(restock), /不是 Apple 的补货计划/);
    assert.match(chinese(restock), new RegExp(hourRange(6, 'zh')));
    assert.match(chinese(store), /星白色/);
    assert.equal(english(guide).includes('怎么查'), false);
    assert.equal((store.match(/store-status\.js/g) || []).length, 1, 'the store script loads once, outside the template');
    assert.match(visible(store), /211 Summit Boulevard/);
    assert.match(visible(store), /Birmingham/);
    assert.match(store, /"@type":"BreadcrumbList"/);
    assert.match(store, /name="twitter:card" content="summary_large_image"/);
    assert.match(store, /src="\/store-status\.js"/);
    assert.match(storeLabel(stores[0]), /Apple /);
    const locations = await writeSeoFiles(dir);
    assert.equal(locations.length, stores.length + 3);
    assert.ok(locations.includes(`${SITE_ORIGIN}/iphone-duo`));
    assert.ok(locations.includes(`${SITE_ORIGIN}/restock-times`));
    assert.ok(locations.includes(`${SITE_ORIGIN}/stores`));
    assert.ok(locations.includes(`${SITE_ORIGIN}/store/thesummit`));
    assert.equal(locations.some(location => location.includes('404')), false);
    const redirects = await readFile(join(dir, '_redirects'), 'utf8');
    assert.match(redirects, /\/iphone-duo\/ \/iphone-duo 301/);
    assert.match(redirects, /\/store\/:slug\/ \/store\/:slug 301/);
    assert.doesNotMatch(redirects, /index\.html 200/);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
