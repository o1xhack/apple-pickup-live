import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {INDEXNOW_KEY, indexNowKeyFilename, locationForHtml, renderRobotsTxt, renderSitemap, writeSeoFiles, SITE_ORIGIN} from '../scripts/seo-files.mjs';

test('robots.txt allows crawlers and points at the sitemap', () => {
  const robots = renderRobotsTxt();
  assert.match(robots, /User-agent: \*\nAllow: \/\n/);
  assert.match(robots, new RegExp(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`));
  assert.doesNotMatch(robots, /Disallow: \/$/);
});

test('sitemap locations skip the 404 page and drop .html', () => {
  assert.equal(locationForHtml('index.html'), `${SITE_ORIGIN}/`);
  assert.equal(locationForHtml('404.html'), null);
  assert.equal(locationForHtml('store/404.html'), null);
  assert.equal(locationForHtml('iphone-duo.html'), `${SITE_ORIGIN}/iphone-duo`);
  assert.equal(locationForHtml('store/thesummit.html'), `${SITE_ORIGIN}/store/thesummit`);
});

test('sitemap xml escapes locations and stays deterministic', () => {
  const xml = renderSitemap([`${SITE_ORIGIN}/stores`, `${SITE_ORIGIN}/`, `${SITE_ORIGIN}/stores`]);
  assert.match(xml, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.ok(xml.indexOf(`${SITE_ORIGIN}/</loc>`) < xml.indexOf(`${SITE_ORIGIN}/stores</loc>`));
  assert.equal(xml.match(/<loc>/g).length, 2);
});

test('writeSeoFiles indexes html pages and omits noindex 404s', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'seo-files-'));
  try {
    await writeFile(join(dir, 'index.html'), '<html><head><title>Home</title></head><body>Home</body></html>');
    await writeFile(join(dir, '404.html'), '<html><head><meta name="robots" content="noindex"></head><body>Missing</body></html>');
    await mkdir(join(dir, 'store'));
    await writeFile(join(dir, 'iphone-duo.html'), '<html><head><title>Duo</title></head><body>Guide</body></html>');
    await writeFile(join(dir, 'store', 'thesummit.html'), '<html><head><title>Store</title></head><body>Store</body></html>');
    const locations = await writeSeoFiles(dir);
    assert.deepEqual(locations, [`${SITE_ORIGIN}/`, `${SITE_ORIGIN}/iphone-duo`, `${SITE_ORIGIN}/store/thesummit`]);
    assert.match(await readFile(join(dir, 'robots.txt'), 'utf8'), /Allow: \//);
    assert.match(await readFile(join(dir, 'sitemap.xml'), 'utf8'), /iphone-duo/);
    assert.doesNotMatch(await readFile(join(dir, 'sitemap.xml'), 'utf8'), /404/);
    assert.equal(indexNowKeyFilename(), `${INDEXNOW_KEY}.txt`);
    assert.equal(INDEXNOW_KEY, '286d51f27fb2687514afa4fc89fbe80a');
    assert.match(INDEXNOW_KEY, /^[a-f0-9]{8,128}$/);
    const keyBytes = await readFile(join(dir, indexNowKeyFilename()));
    assert.deepEqual(keyBytes, Buffer.from(INDEXNOW_KEY));
    assert.doesNotMatch(await readFile(join(dir, 'sitemap.xml'), 'utf8'), new RegExp(INDEXNOW_KEY));
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
