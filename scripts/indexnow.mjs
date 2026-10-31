import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {INDEXNOW_KEY, SITE_ORIGIN} from './seo-files.mjs';

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
// https://www.indexnow.org/documentation — at most 10,000 URLs per POST.
export const INDEXNOW_BATCH_LIMIT = 10000;
const SUCCESS_STATUS = new Set([200, 202]);
const RETRYABLE_STATUS = new Set([403, 429, 500, 502, 503, 504]);

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function keyFileMatches(body, key = INDEXNOW_KEY) {
  return body === key || body === `${key}\n` || body === `${key}\r\n`;
}

export function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parseSitemapLocations(xml) {
  const locations = [];
  for (const match of String(xml).matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) locations.push(decodeXml(match[1].trim()));
  return locations;
}

export function locationsForHost(locations, origin = SITE_ORIGIN) {
  const expected = new URL(origin).host;
  const seen = new Set();
  const kept = [];
  for (const location of locations) {
    let url;
    try {
      url = new URL(location);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.host !== expected) continue;
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    kept.push(url.href);
  }
  return kept;
}

export function chunkList(items, size = INDEXNOW_BATCH_LIMIT) {
  if (!Number.isInteger(size) || size < 1) throw new Error('IndexNow batch size must be a positive integer');
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export function indexNowRequestBody(urlList, origin = SITE_ORIGIN) {
  const root = origin.replace(/\/$/, '');
  return {
    host: new URL(origin).host,
    key: INDEXNOW_KEY,
    keyLocation: `${root}/${INDEXNOW_KEY}.txt`,
    urlList,
  };
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {...init, signal: controller.signal});
    // Headers can arrive while the body is still coming. Keep the abort armed
    // until text() finishes, or a stall is no longer bounded by timeoutMs.
    const body = await response.text();
    return {status: response.status, body};
  } finally {
    clearTimeout(timer);
  }
}

export async function waitForExactBody(url, expected, {
  fetchImpl,
  attempts = 20,
  delayMs = 3000,
  timeoutMs = 15000,
  sleep = delay,
} = {}) {
  let error = 'no attempt';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchWithTimeout(fetchImpl, url, {redirect: 'manual', cache: 'no-store'}, timeoutMs);
      if (response.status === 200 && keyFileMatches(response.body, expected)) return {ok: true, attempts: attempt};
      error = `HTTP ${response.status}`;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  return {ok: false, attempts, error};
}

export async function postIndexNowBatch(urlList, {
  fetchImpl,
  origin = SITE_ORIGIN,
  endpoint = INDEXNOW_ENDPOINT,
  attempts = 3,
  delayMs = 5000,
  timeoutMs = 15000,
  sleep = delay,
} = {}) {
  if (!urlList.length) return {ok: false, attempts: 0, error: 'empty url list'};
  const payload = JSON.stringify(indexNowRequestBody(urlList, origin));
  let error = 'no attempt';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchWithTimeout(fetchImpl, endpoint, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'user-agent': 'apple-pickup-live/indexnow',
        },
        body: payload,
      }, timeoutMs);
      const detail = response.body.trim().replace(/\s+/g, ' ').slice(0, 200);
      if (SUCCESS_STATUS.has(response.status)) return {ok: true, status: response.status, attempts: attempt};
      error = detail ? `HTTP ${response.status} ${detail}` : `HTTP ${response.status}`;
      if (!RETRYABLE_STATUS.has(response.status)) return {ok: false, status: response.status, attempts: attempt, error};
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  return {ok: false, attempts, error};
}

export async function notifyIndexNow({
  origin = SITE_ORIGIN,
  fetchImpl = globalThis.fetch,
  sleep = delay,
  keyAttempts = 20,
  keyDelayMs = 3000,
  timeoutMs = 15000,
  batchLimit = INDEXNOW_BATCH_LIMIT,
  submitAttempts = 3,
  submitDelayMs = 5000,
  endpoint = INDEXNOW_ENDPOINT,
  log = () => {},
} = {}) {
  const root = origin.replace(/\/$/, '');
  const keyUrl = `${root}/${INDEXNOW_KEY}.txt`;
  const sitemapUrl = `${root}/sitemap.xml`;
  log(`IndexNow: waiting for ${keyUrl}`);
  const key = await waitForExactBody(keyUrl, INDEXNOW_KEY, {fetchImpl, attempts: keyAttempts, delayMs: keyDelayMs, timeoutMs, sleep});
  if (!key.ok) {
    return {ok: false, submitted: 0, total: 0, batches: 0, statuses: [], reason: `key file not reachable at ${keyUrl}: ${key.error}`};
  }
  log(`IndexNow: key file is live after ${key.attempts} attempt(s)`);
  let xml;
  try {
    const response = await fetchWithTimeout(fetchImpl, sitemapUrl, {redirect: 'manual', cache: 'no-store'}, timeoutMs);
    if (response.status !== 200) {
      return {ok: false, submitted: 0, total: 0, batches: 0, statuses: [], reason: `sitemap ${sitemapUrl} returned HTTP ${response.status}`};
    }
    xml = response.body;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return {ok: false, submitted: 0, total: 0, batches: 0, statuses: [], reason: `sitemap fetch failed: ${message}`};
  }
  const urls = locationsForHost(parseSitemapLocations(xml), origin);
  if (!urls.length) {
    return {ok: false, submitted: 0, total: 0, batches: 0, statuses: [], reason: 'live sitemap contained no URLs for this host'};
  }
  const chunks = chunkList(urls, batchLimit);
  log(`IndexNow: submitting ${urls.length} URLs to ${endpoint} in ${chunks.length} ${chunks.length === 1 ? 'request' : 'requests'}`);
  let submitted = 0;
  const statuses = [];
  const failures = [];
  for (let index = 0; index < chunks.length; index++) {
    const result = await postIndexNowBatch(chunks[index], {fetchImpl, origin, endpoint, attempts: submitAttempts, delayMs: submitDelayMs, timeoutMs, sleep});
    if (result.ok) {
      submitted += chunks[index].length;
      statuses.push(result.status);
    } else {
      failures.push(`batch ${index + 1}/${chunks.length}: ${result.error}`);
    }
  }
  if (failures.length) {
    return {
      ok: false,
      submitted,
      total: urls.length,
      batches: chunks.length,
      statuses,
      reason: `submitted ${submitted} of ${urls.length} URLs; ${failures.join('; ')}`,
    };
  }
  return {ok: true, submitted, total: urls.length, batches: chunks.length, statuses};
}

export async function runCli(options = {}) {
  const log = options.log ?? (line => console.log(line));
  const warn = options.warn ?? (line => console.warn(line));
  try {
    const result = await notifyIndexNow({...options, log});
    if (result.ok) {
      const requests = `${result.batches} ${result.batches === 1 ? 'request' : 'requests'}`;
      const statuses = result.statuses.length ? ` (HTTP ${result.statuses.join(', ')})` : '';
      log(`IndexNow: submitted ${result.submitted} of ${result.total} sitemap URLs in ${requests}${statuses}.`);
    } else {
      warn(`IndexNow: ${result.reason}. The Pages deploy is still live.`);
    }
    return result;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    warn(`IndexNow: ${message}. The Pages deploy is still live.`);
    return {ok: false, submitted: 0, total: 0, batches: 0, statuses: [], reason: message};
  }
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) await runCli();
