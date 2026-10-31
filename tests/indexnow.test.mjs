import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {INDEXNOW_KEY, SITE_ORIGIN, renderSitemap} from '../scripts/seo-files.mjs';
import {
  INDEXNOW_BATCH_LIMIT,
  INDEXNOW_ENDPOINT,
  chunkList,
  indexNowRequestBody,
  keyFileMatches,
  locationsForHost,
  notifyIndexNow,
  parseSitemapLocations,
  runCli,
} from '../scripts/indexnow.mjs';

const KEY_URL = `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`;

function httpResponse(status, body) {
  return {status, text: async () => body};
}

function scriptedFetch(steps) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({url, init});
    const step = steps.shift();
    if (!step) throw new Error(`unexpected fetch ${url}`);
    if (typeof step === 'function') return step(url, init);
    return step;
  };
  return {fetchImpl, calls};
}

test('the IndexNow batch limit and endpoint stay on the public protocol', () => {
  assert.equal(INDEXNOW_BATCH_LIMIT, 10000);
  assert.equal(INDEXNOW_ENDPOINT, 'https://api.indexnow.org/indexnow');
  assert.equal(chunkList(['a', 'b', 'c'], 2).map(chunk => chunk.length).join(','), '2,1');
  const many = Array.from({length: 10001}, (_, index) => `${SITE_ORIGIN}/p/${index}`);
  const chunks = chunkList(many);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, 10000);
  assert.equal(chunks[1].length, 1);
  assert.throws(() => chunkList(['a'], 0), /batch size/);
});

test('sitemap locations round-trip and stay on this host', () => {
  const xml = renderSitemap([
    `${SITE_ORIGIN}/stores`,
    `${SITE_ORIGIN}/`,
    `${SITE_ORIGIN}/a?b=1&c=2`,
    `${SITE_ORIGIN}/stores`,
  ]);
  const locations = parseSitemapLocations(xml);
  assert.deepEqual(locations, [`${SITE_ORIGIN}/`, `${SITE_ORIGIN}/a?b=1&c=2`, `${SITE_ORIGIN}/stores`]);
  const kept = locationsForHost([
    ...locations,
    'https://example.com/pickup.o1xhack.com/',
    'https://pickup.o1xhack.com.evil.example/',
    'http://pickup.o1xhack.com/plain',
    'not a url',
    `${SITE_ORIGIN}/`,
  ]);
  assert.deepEqual(kept, [`${SITE_ORIGIN}/`, `${SITE_ORIGIN}/a?b=1&c=2`, `${SITE_ORIGIN}/stores`]);
});

test('the live key check accepts the key and a single trailing newline', () => {
  assert.equal(keyFileMatches(INDEXNOW_KEY), true);
  assert.equal(keyFileMatches(`${INDEXNOW_KEY}\n`), true);
  assert.equal(keyFileMatches(`${INDEXNOW_KEY}\r\n`), true);
  assert.equal(keyFileMatches(` ${INDEXNOW_KEY}`), false);
  assert.equal(keyFileMatches(`<html>${INDEXNOW_KEY}</html>`), false);
  const body = indexNowRequestBody([`${SITE_ORIGIN}/`]);
  assert.deepEqual(body, {
    host: 'pickup.o1xhack.com',
    key: INDEXNOW_KEY,
    keyLocation: KEY_URL,
    urlList: [`${SITE_ORIGIN}/`],
  });
});

test('notifyIndexNow posts live sitemap URLs after the key file is reachable', async () => {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_ORIGIN}/stores</loc></url>
  <url><loc>${SITE_ORIGIN}/</loc></url>
  <url><loc>https://example.com/elsewhere</loc></url>
  <url><loc>${SITE_ORIGIN}/iphone-duo</loc></url>
</urlset>
`;
  const {fetchImpl, calls} = scriptedFetch([
    () => httpResponse(404, 'missing'),
    () => httpResponse(200, `${INDEXNOW_KEY}\n`),
    () => httpResponse(200, sitemap),
    () => httpResponse(202, 'accepted'),
  ]);
  const slept = [];
  const logs = [];
  const result = await notifyIndexNow({
    fetchImpl,
    sleep: async ms => slept.push(ms),
    keyAttempts: 3,
    keyDelayMs: 25,
    submitAttempts: 1,
    log: line => logs.push(line),
  });
  assert.equal(result.ok, true);
  assert.equal(result.submitted, 3);
  assert.equal(result.total, 3);
  assert.equal(result.batches, 1);
  assert.deepEqual(result.statuses, [202]);
  assert.deepEqual(slept, [25]);
  assert.match(logs[0], new RegExp(KEY_URL));
  const post = calls.find(call => call.init?.method === 'POST');
  assert.equal(post.url, INDEXNOW_ENDPOINT);
  assert.equal(post.init.redirect, 'manual');
  assert.equal(post.init.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(calls.filter(call => call.init?.method === 'POST').length, 1);
  assert.equal(calls[0].url, KEY_URL);
  assert.equal(calls[2].url, `${SITE_ORIGIN}/sitemap.xml`);
  const payload = JSON.parse(post.init.body);
  assert.deepEqual(payload.urlList, [`${SITE_ORIGIN}/stores`, `${SITE_ORIGIN}/`, `${SITE_ORIGIN}/iphone-duo`]);
  assert.equal(payload.host, 'pickup.o1xhack.com');
  assert.equal(payload.key, INDEXNOW_KEY);
  assert.equal(payload.keyLocation, KEY_URL);
});

test('notifyIndexNow splits submissions on the batch limit', async () => {
  const urls = [1, 2, 3, 4, 5].map(index => `${SITE_ORIGIN}/p/${index}`);
  const {fetchImpl, calls} = scriptedFetch([
    () => httpResponse(200, INDEXNOW_KEY),
    () => httpResponse(200, renderSitemap(urls)),
    () => httpResponse(200, ''),
    () => httpResponse(200, ''),
    () => httpResponse(200, ''),
  ]);
  const result = await notifyIndexNow({
    fetchImpl,
    sleep: async () => {},
    keyAttempts: 1,
    batchLimit: 2,
    submitAttempts: 1,
  });
  const posts = calls.filter(call => call.init?.method === 'POST');
  assert.equal(result.ok, true);
  assert.equal(result.submitted, 5);
  assert.equal(result.batches, 3);
  assert.deepEqual(posts.map(call => JSON.parse(call.init.body).urlList.length), [2, 2, 1]);
});

test('a missing key file or a down IndexNow endpoint does not throw', async () => {
  const missing = await notifyIndexNow({
    fetchImpl: async () => httpResponse(503, 'down'),
    sleep: async () => {},
    keyAttempts: 2,
    keyDelayMs: 5,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.submitted, 0);
  assert.match(missing.reason, /key file not reachable/);
  assert.match(missing.reason, /HTTP 503/);

  let posts = 0;
  const refused = await notifyIndexNow({
    fetchImpl: async (url, init) => {
      if (init?.method === 'POST') {
        posts += 1;
        throw new Error('connect ECONNREFUSED');
      }
      if (String(url).endsWith('.txt')) return httpResponse(200, INDEXNOW_KEY);
      return httpResponse(200, renderSitemap([`${SITE_ORIGIN}/`]));
    },
    sleep: async () => {},
    keyAttempts: 1,
    submitAttempts: 2,
    submitDelayMs: 7,
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.submitted, 0);
  assert.equal(posts, 2);
  assert.match(refused.reason, /ECONNREFUSED/);

  const rejected = await notifyIndexNow({
    fetchImpl: async (url, init) => {
      if (init?.method === 'POST') return httpResponse(400, 'bad request');
      if (String(url).endsWith('.txt')) return httpResponse(200, INDEXNOW_KEY);
      return httpResponse(200, renderSitemap([`${SITE_ORIGIN}/stores`]));
    },
    sleep: async () => {},
    keyAttempts: 1,
    submitAttempts: 3,
  });
  assert.equal(rejected.ok, false);
  assert.match(rejected.reason, /HTTP 400/);
  assert.match(rejected.reason, /bad request/);
});

test('retryable IndexNow responses are tried again and client errors are not', async () => {
  let posts = 0;
  const recovered = await notifyIndexNow({
    fetchImpl: async (url, init) => {
      if (init?.method !== 'POST') {
        if (String(url).endsWith('.txt')) return httpResponse(200, INDEXNOW_KEY);
        return httpResponse(200, renderSitemap([`${SITE_ORIGIN}/`, `${SITE_ORIGIN}/stores`]));
      }
      posts += 1;
      if (posts === 1) return httpResponse(403, 'key not valid');
      return httpResponse(200, '');
    },
    sleep: async () => {},
    keyAttempts: 1,
    batchLimit: 2,
    submitAttempts: 2,
  });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.submitted, 2);
  assert.equal(posts, 2);

  let badPosts = 0;
  const fatal = await notifyIndexNow({
    fetchImpl: async (url, init) => {
      if (init?.method === 'POST') {
        badPosts += 1;
        return httpResponse(422, 'invalid');
      }
      if (String(url).endsWith('.txt')) return httpResponse(200, INDEXNOW_KEY);
      return httpResponse(200, renderSitemap([`${SITE_ORIGIN}/`]));
    },
    sleep: async () => {},
    keyAttempts: 1,
    submitAttempts: 4,
  });
  assert.equal(fatal.ok, false);
  assert.equal(badPosts, 1);
  assert.match(fatal.reason, /HTTP 422/);
});

test('a sitemap failure skips the IndexNow POST', async () => {
  const calls = [];
  const result = await notifyIndexNow({
    fetchImpl: async url => {
      calls.push(String(url));
      if (String(url).endsWith('.txt')) return httpResponse(200, INDEXNOW_KEY);
      return httpResponse(404, 'missing sitemap');
    },
    sleep: async () => {},
    keyAttempts: 1,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /sitemap/);
  assert.match(result.reason, /HTTP 404/);
  assert.equal(calls.some(url => url === INDEXNOW_ENDPOINT), false);
});

test('runCli keeps a successful deploy when IndexNow cannot be reached', async () => {
  const warnings = [];
  const broken = await runCli({
    fetchImpl: async () => httpResponse(404, 'no'),
    sleep: async () => {
      throw new Error('clock broke');
    },
    keyAttempts: 2,
    log: () => {},
    warn: line => warnings.push(line),
  });
  assert.equal(broken.ok, false);
  assert.match(broken.reason, /clock broke/);
  assert.match(warnings[0], /clock broke/);
  assert.match(warnings[0], /The Pages deploy is still live/);

  const logs = [];
  const warned = [];
  const {fetchImpl} = scriptedFetch([
    () => httpResponse(200, INDEXNOW_KEY),
    () => httpResponse(200, renderSitemap([`${SITE_ORIGIN}/iphone-duo`])),
    () => httpResponse(200, ''),
  ]);
  const ok = await runCli({
    fetchImpl,
    sleep: async () => {},
    keyAttempts: 1,
    submitAttempts: 1,
    log: line => logs.push(line),
    warn: line => warned.push(line),
  });
  assert.equal(ok.ok, true);
  assert.equal(warned.length, 0);
  assert.match(logs.at(-1), /submitted 1 of 1 sitemap URLs in 1 request \(HTTP 200\)/);
});

test('deploy:pages submits IndexNow after the release shell is saved', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.scripts.indexnow, 'node scripts/indexnow.mjs');
  const deploy = pkg.scripts['deploy:pages'];
  const wrangler = deploy.indexOf('wrangler pages deploy');
  const capture = deploy.indexOf('node scripts/capture-site-shell.mjs');
  const ping = deploy.lastIndexOf('npm run indexnow');
  assert.ok(wrangler >= 0 && capture > wrangler && ping > capture);
  assert.equal(deploy.endsWith('npm run indexnow'), true);
});
