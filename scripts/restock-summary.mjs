import {gunzipSync} from 'node:zlib';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import siteInfo from '../data/site-info.json' with {type: 'json'};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function pacificHour(ts) {
  const part = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23'}).formatToParts(new Date(ts)).find(item => item.type === 'hour');
  const hour = Number(part?.value);
  if (!Number.isInteger(hour)) throw Error('Could not read a Pacific hour');
  return hour === 24 ? 0 : hour;
}

export function pacificWeekday(ts) {
  const name = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Los_Angeles', weekday: 'short'}).format(new Date(ts));
  const index = WEEKDAYS.indexOf(name);
  if (index < 0) throw Error('Could not read a Pacific weekday');
  return index;
}

export function eventsFromHistoryDocument(data) {
  if (Array.isArray(data?.currentDays)) return data.currentDays.flatMap(day => day.events || []);
  if (Array.isArray(data?.events)) return data.events;
  return [];
}

function sortObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

export function summarizeEvents(events, {statisticsStartedAt, publishedAt}) {
  const hours = Array(24).fill(0);
  const weekdays = Array(7).fill(0);
  const byPart = {};
  const byStore = {};
  let candidateRestocks = 0;
  let firstOrRecovered = 0;
  let nationalCandidates = 0;
  let legacyCandidates = 0;
  let earliest = null;
  let latest = null;
  for (const event of events) {
    const ts = event?.ts ?? event?.at;
    if (!Number.isSafeInteger(ts) || ts < statisticsStartedAt) continue;
    if (event.kind === 'first_or_recovered' && event.state === '1') firstOrRecovered++;
    if (event.kind !== 'candidate_restock' || event.state !== '1') continue;
    candidateRestocks++;
    if (event.source === 'legacy_ca') legacyCandidates++;
    else nationalCandidates++;
    hours[pacificHour(ts)]++;
    weekdays[pacificWeekday(ts)]++;
    if (event.part) byPart[event.part] = (byPart[event.part] || 0) + 1;
    if (event.store) byStore[event.store] = (byStore[event.store] || 0) + 1;
    earliest = earliest == null ? ts : Math.min(earliest, ts);
    latest = latest == null ? ts : Math.max(latest, ts);
  }
  return {publishedAt, statisticsStartedAt, timeZone: 'America/Los_Angeles', candidateRestocks, firstOrRecovered, nationalCandidates, legacyCandidates, earliest, latest, hours, weekdays, byPart: sortObject(byPart), byStore: sortObject(byStore)};
}

async function readJsonResponse(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error(`${url} returned ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const text = bytes.length > 2 && bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
  return JSON.parse(text);
}

export async function refreshRestockSummary({historyOrigin = 'https://apple-pickup-live.o1xhack.workers.dev', assetOrigin = 'https://pickup.o1xhack.com'} = {}) {
  const manifest = await readJsonResponse(`${historyOrigin}/api/public-history`);
  const collected = new Map();
  const add = events => {
    for (const event of events) if (event?.id && !collected.has(event.id)) collected.set(event.id, event);
  };
  add(eventsFromHistoryDocument(manifest));
  for (const path of Object.values(manifest.archives || {})) add(eventsFromHistoryDocument(await readJsonResponse(assetOrigin + path)));
  if (manifest.legacy?.path) add(eventsFromHistoryDocument(await readJsonResponse(assetOrigin + manifest.legacy.path)));
  return summarizeEvents([...collected.values()], {statisticsStartedAt: siteInfo.statisticsStartedAt, publishedAt: manifest.publishedAt});
}

async function main() {
  const summary = await refreshRestockSummary();
  await writeFile(new URL('../data/restock-summary.json', import.meta.url), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({candidateRestocks: summary.candidateRestocks, firstOrRecovered: summary.firstOrRecovered, publishedAt: summary.publishedAt}));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
