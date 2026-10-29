import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import stores from '../data/us-stores.json' with {type: 'json'};
import products from '../data/products.json' with {type: 'json'};
import summary from '../data/restock-summary.json' with {type: 'json'};
import {dayKey} from '../shared/daily.js';
import {haversineMiles} from '../shared/model.js';
import {SITE_ORIGIN, breadcrumbJsonLd, datasetJsonLd, faqJsonLd} from '../shared/seo.js';
import {crumbs, escapeHtml, pageShell} from './seo-layout.mjs';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function storeLabel(store) {
  return store.name.startsWith('Apple ') ? store.name : `Apple ${store.name}`;
}

function hourName(hour) {
  const label = hour % 12 === 0 ? 12 : hour % 12;
  return `${label} ${hour < 12 ? 'a.m.' : 'p.m.'}`;
}

export function hourRange(hour) {
  return `${hourName(hour)}–${hourName((hour + 1) % 24)}`;
}

function pacificDate(ts) {
  return new Intl.DateTimeFormat('en-US', {timeZone: 'America/Los_Angeles', dateStyle: 'long'}).format(new Date(ts));
}

function pacificStamp(ts) {
  return new Intl.DateTimeFormat('en-US', {timeZone: 'America/Los_Angeles', dateStyle: 'long', timeStyle: 'short'}).format(new Date(ts));
}

function share(count, total) {
  if (!total) return '0%';
  return `${Math.round(count / total * 100)}%`;
}

const FAQS = [
  {
    question: 'What is the iPhone Duo stock tracker?',
    answer: 'Apple Pickup Live is an independent tracker of iPhone Duo pickup availability at 269 Apple Stores in the United States. It shows saved observations. It is not affiliated with Apple and it does not place orders.'
  },
  {
    question: 'How do I find iPhone Duo in stock near me?',
    answer: 'Open the homepage, enter a US ZIP code, and choose a radius of 25, 50, 100, or 250 miles. You can also filter by state, city or store name, storage, and color. The search reads observations that were already saved. It does not send a request to Apple.'
  },
  {
    question: 'Does an in-stock observation mean a phone is waiting?',
    answer: 'No. An in-stock observation means one saved check showed pickup as available for that store and configuration. It is not a count of phones, and availability can change before checkout. Repeated in-stock checks are counted again.'
  },
  {
    question: 'What does no stock observed mean?',
    answer: 'No stock observed means a successful check reported pickup as unavailable. A missing store, a failed check, an unknown result, or an old check is not treated as out of stock.'
  },
  {
    question: 'Which iPhone Duo models are tracked?',
    answer: 'Eight configurations: 256GB, 512GB, 1TB, and 2TB, each in Star White and Night Sky.'
  },
  {
    question: 'How fresh is the pickup availability?',
    answer: 'The collector aims for a bounded round about every five minutes. Public pages call a result recently in stock only when the latest observation is within 15 minutes. The time on each store is the time of the saved check, not a promise that every store was seen in the last five minutes.'
  },
  {
    question: 'When do the public statistics start?',
    answer: 'Public counts start at 12:00 a.m. Pacific Time on October 24, 2026. Earlier raw records are kept and are not included in the public totals.'
  },
  {
    question: 'Where can I see when stores restock?',
    answer: 'The restock times page lists candidate restocks: a saved out-of-stock observation followed by an in-stock observation for the same store and configuration. That is not a proven delivery and not a count of phones. The homepage Statistics tab separately totals repeated in-stock observations.'
  }
];

function faqBody() {
  return FAQS.map(faq => `<h3>${escapeHtml(faq.question)}</h3><p>${escapeHtml(faq.answer)}</p>`).join('');
}

function guidePage() {
  const title = 'iPhone Duo Pickup Availability — Stock Tracker Guide';
  const description = 'How the iPhone Duo stock tracker works: search pickup availability near you by ZIP across 269 Apple Stores, and read what in stock, unknown, and restock observations mean.';
  const path = '/iphone-duo';
  const trail = [{name: 'Home', href: '/', url: `${SITE_ORIGIN}/`}, {name: 'iPhone Duo', href: path, url: `${SITE_ORIGIN}${path}`}];
  const configurations = products.map(product => `<li>${escapeHtml(product.capacity)} ${escapeHtml(product.color)}</li>`).join('');
  const body = `${crumbs(trail)}
<section class="intro"><div><p class="eyebrow">IPHONE DUO · PICKUP AVAILABILITY</p><h1>iPhone Duo stock tracker.</h1><p class="intro-note">Find iPhone Duo in stock near you from saved Apple Store pickup observations. Search by ZIP, then open history or restock times.</p><p class="independence-note">Independent inventory tracker. Not affiliated with Apple.</p></div></section>
<article class="seo-block"><h2>What this tracker does</h2><p>Apple Pickup Live watches iPhone Duo pickup availability at ${stores.length} Apple Stores in the United States. Each row is an observation of one store and one configuration. It is a stock tracker for pickup, not a checkout page and not a count of phones on a shelf.</p><p>Visitors only search snapshots that have already been published. Typing a ZIP does not trigger a new request to Apple.</p></article>
<article class="seo-block"><h2>How to use it</h2><ol><li>Start at the <a href="/">live stock page</a> and enter your ZIP code.</li><li>Choose 25, 50, 100, or 250 miles. Distances are approximate straight-line miles from ZIP locations.</li><li>Narrow the list by state, city or store, storage, and color, or show only configurations with a recent in-stock observation.</li><li>Open a store for each configuration. Use the <a href="/stores">store index</a> when you already know the store.</li><li>Use History for recorded state changes, Statistics for repeated in-stock observations, and <a href="/restock-times">restock times</a> for out-of-stock followed by in-stock.</li></ol></article>
<article class="seo-block"><h2>Configurations</h2><p>These eight iPhone Duo pickup configurations are tracked at every store:</p><ul>${configurations}</ul></article>
<article class="seo-block"><h2>How to read a result</h2><ul><li><strong>In stock</strong> means the latest saved check, within 15 minutes, showed pickup available.</li><li><strong>No stock observed</strong> means that check reported pickup unavailable.</li><li><strong>Unknown, not checked, or not recently verified</strong> means the tracker does not have a fresh successful answer. None of those are shown as out of stock.</li></ul></article>
<article class="seo-block"><h2>Questions</h2>${faqBody()}</article>`;
  return {file: 'iphone-duo.html', html: pageShell({title, description, path, jsonLd: [breadcrumbJsonLd(trail.map(({name, url}) => ({name, url}))), faqJsonLd(FAQS)], body})};
}

function restockPage() {
  const title = 'iPhone Duo Restock Times — When Pickup Stock Returns';
  const description = 'When iPhone Duo pickup availability tends to return at US Apple Stores, from recorded out-of-stock to in-stock observations. Not a phone count or an Apple schedule.';
  const path = '/restock-times';
  const trail = [{name: 'Home', href: '/', url: `${SITE_ORIGIN}/`}, {name: 'Restock times', href: path, url: `${SITE_ORIGIN}${path}`}];
  const total = summary.candidateRestocks;
  const max = Math.max(...summary.hours);
  const peaks = summary.hours.flatMap((count, hour) => count === max && count > 0 ? [hourRange(hour)] : []);
  const quiet = WEEKDAYS.filter((_, index) => summary.weekdays[index] === 0);
  const byStore = Object.entries(summary.byStore).map(([id, count]) => ({store: stores.find(store => store.id === id), count})).filter(row => row.store).sort((a, b) => b.count - a.count || storeLabel(a.store).localeCompare(storeLabel(b.store)));
  const hourRows = summary.hours.map((count, hour) => `<tr><td>${hourRange(hour)}</td><td>${count.toLocaleString('en-US')}</td><td>${share(count, total)}</td><td>${max ? `<span class="share-meter" style="width:${Math.max(4, Math.round(count / max * 120))}px"></span>` : ''}</td></tr>`).join('');
  const weekdayRows = summary.weekdays.map((count, index) => `<tr><td>${WEEKDAYS[index]}</td><td>${count.toLocaleString('en-US')}</td><td>${share(count, total)}</td></tr>`).join('');
  const partRows = products.map(product => `<tr><td>${escapeHtml(product.capacity)}</td><td>${escapeHtml(product.color)}</td><td>${(summary.byPart[product.part] || 0).toLocaleString('en-US')}</td></tr>`).join('');
  const storeRows = byStore.map(({store, count}) => `<tr><td><a href="/store/${store.slug}">${escapeHtml(storeLabel(store))}</a></td><td>${escapeHtml(store.city)}, ${escapeHtml(store.stateCode)}</td><td>${count.toLocaleString('en-US')}</td></tr>`).join('');
  const peakSentence = peaks.length ? `The busiest ${peaks.length === 1 ? 'hour was' : 'hours were'} ${peaks.join(' and ')} Pacific Time, with ${max.toLocaleString('en-US')} candidate restock observations.` : 'No candidate restock observations are in this summary yet.';
  const quietSentence = quiet.length ? ` ${quiet.join(' and ')} ${quiet.length === 1 ? 'has' : 'have'} none in this window, so the weekday table is not yet a stable weekly pattern.` : '';
  const legacySentence = summary.legacyCandidates ? ` ${summary.legacyCandidates.toLocaleString('en-US')} of the candidate restocks come from the early California sample on or after the public start.` : '';
  const body = `${crumbs(trail)}
<section class="intro"><div><p class="eyebrow">RECORDED CANDIDATE RESTOCKS</p><h1>When iPhone Duo pickup stock returns.</h1><p class="intro-note">${escapeHtml(peakSentence)} These are observations, not an Apple restock schedule and not a count of phones.</p></div></section>
<article class="seo-block"><h2>What counts</h2><p>A candidate restock is one saved transition for a store and configuration: out of stock, then in stock, on adjacent valid checks. A first sighting, or a sighting after a sampling gap, is counted separately and is not called a restock. Repeated in-stock checks are not in this table. Those repeats are the daily bars on the <a href="/?tab=stats">Statistics tab</a>.</p><p>The public window starts ${escapeHtml(pacificDate(summary.statisticsStartedAt))} at 12:00 a.m. Pacific Time. This summary includes ${total.toLocaleString('en-US')} candidate restocks and ${summary.firstOrRecovered.toLocaleString('en-US')} first-or-after-a-gap in-stock observations through ${escapeHtml(pacificStamp(summary.publishedAt))}.${escapeHtml(legacySentence)} Failed or missing checks are not filled in as out of stock.</p><p>${escapeHtml(peakSentence + quietSentence)}</p></article>
<article class="seo-block table-card"><h2>Time of day, Pacific Time</h2><div class="table-scroll"><table><caption>Candidate restock observations by hour</caption><thead><tr><th>Hour</th><th>Observations</th><th>Share</th><th></th></tr></thead><tbody>${hourRows}</tbody></table></div></article>
<article class="seo-block table-card"><h2>Day of week</h2><p class="fine-print">A short calendar can be dominated by one busy day. Zero does not mean stores never change on that weekday.</p><div class="table-scroll"><table><caption>Candidate restock observations by Pacific weekday</caption><thead><tr><th>Day</th><th>Observations</th><th>Share</th></tr></thead><tbody>${weekdayRows}</tbody></table></div></article>
<article class="seo-block table-card"><h2>By configuration</h2><div class="table-scroll"><table><thead><tr><th>Storage</th><th>Color</th><th>Candidate restocks</th></tr></thead><tbody>${partRows}</tbody></table></div></article>
<article class="seo-block table-card"><h2>By store</h2><p class="fine-print">Stores with no candidate restock in this window are listed on the <a href="/stores">store index</a> and omitted here.</p><div class="table-scroll"><table><thead><tr><th>Store</th><th>City</th><th>Candidate restocks</th></tr></thead><tbody>${storeRows}</tbody></table></div></article>`;
  const dataset = datasetJsonLd({
    name: 'iPhone Duo Apple Store candidate restock observations',
    description: 'Out-of-stock to in-stock pickup observations for iPhone Duo at US Apple Stores, tallied by Pacific hour and weekday. Not a count of phones or a confirmed delivery schedule.',
    url: `${SITE_ORIGIN}${path}`,
    temporalCoverage: `${dayKey(summary.statisticsStartedAt)}/${dayKey(summary.latest || summary.publishedAt)}`
  });
  return {file: 'restock-times.html', html: pageShell({title, description, path, jsonLd: [breadcrumbJsonLd(trail.map(({name, url}) => ({name, url}))), dataset], body})};
}

function storesPage() {
  const title = 'Apple Stores Tracked for iPhone Duo Pickup';
  const description = `All ${stores.length} US Apple Stores in the iPhone Duo stock tracker. Open a store for its address, ZIP, and recorded pickup observations.`;
  const path = '/stores';
  const trail = [{name: 'Home', href: '/', url: `${SITE_ORIGIN}/`}, {name: 'Stores', href: path, url: `${SITE_ORIGIN}${path}`}];
  const groups = new Map();
  for (const store of stores) {
    const list = groups.get(store.state) || [];
    list.push(store);
    groups.set(store.state, list);
  }
  const sections = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([state, list]) => {
    const items = list.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name)).map(store => `<li><a href="/store/${store.slug}">${escapeHtml(storeLabel(store))}</a> — ${escapeHtml(store.city)}, ${escapeHtml(store.zip)}</li>`).join('');
    return `<h2 id="${escapeHtml(list[0].stateCode)}">${escapeHtml(state)}</h2><ul>${items}</ul>`;
  }).join('');
  const body = `${crumbs(trail)}
<section class="intro"><div><p class="eyebrow">${stores.length} APPLE STORES</p><h1>iPhone Duo pickup, store by store.</h1><p class="intro-note">Every US Apple Store in this tracker has its own page. For stores near a ZIP code, use the <a href="/">live search</a>.</p></div></section>
<article class="seo-block">${sections}</article>`;
  return {file: 'stores.html', html: pageShell({title, description, path, jsonLd: [breadcrumbJsonLd(trail.map(({name, url}) => ({name, url})))], body})};
}

function storePage(store) {
  if (!/^[a-z0-9]+$/.test(store.slug)) throw Error(`Unsafe store slug ${store.slug}`);
  const label = storeLabel(store);
  const title = `iPhone Duo Pickup at ${label}, ${store.city}`;
  const description = `iPhone Duo pickup availability at ${label} in ${store.city}, ${store.stateCode}. ZIP ${store.zip}. Saved observations, not a phone count.`;
  const path = `/store/${store.slug}`;
  const trail = [{name: 'Home', href: '/', url: `${SITE_ORIGIN}/`}, {name: 'Stores', href: '/stores', url: `${SITE_ORIGIN}/stores`}, {name: label, href: path, url: `${SITE_ORIGIN}${path}`}];
  const count = summary.byStore[store.id] || 0;
  const restockSentence = count
    ? `${count.toLocaleString('en-US')} candidate restock observation${count === 1 ? '' : 's'} (out of stock, then in stock) ${count === 1 ? 'was' : 'were'} recorded for this store in the public window.`
    : 'No adjacent out-of-stock to in-stock observation has been recorded for this store in the public window yet.';
  const inState = stores.filter(other => other.stateCode === store.stateCode).length;
  const nearby = stores.filter(other => other.id !== store.id).map(other => ({other, miles: haversineMiles(store, other)})).sort((a, b) => a.miles - b.miles).slice(0, 5);
  const nearbyItems = nearby.map(({other, miles}) => `<li><a href="/store/${other.slug}">${escapeHtml(storeLabel(other))}</a> — ${escapeHtml(other.city)}, ${escapeHtml(other.stateCode)} · ${miles.toFixed(0)} mi</li>`).join('');
  const rows = products.map(product => `<tr data-part="${escapeHtml(product.part)}"><td>${escapeHtml(product.capacity)}</td><td>${escapeHtml(product.color)}</td><td><span data-status>Loads with the published snapshot.</span> <a href="/?zip=${encodeURIComponent(store.zip)}&amp;radius=50">Open in the tracker</a></td></tr>`).join('');
  const body = `${crumbs(trail)}
<section class="intro"><div><p class="eyebrow">${escapeHtml(store.state.toUpperCase())} · ${escapeHtml(store.zip)}</p><h1>${escapeHtml(label)}</h1><p class="intro-note">${escapeHtml(store.address)}, ${escapeHtml(store.city)}, ${escapeHtml(store.state)} ${escapeHtml(store.zip)}</p><p class="independence-note">iPhone Duo pickup availability for this Apple Store. Independent tracker. Not affiliated with Apple.</p></div></section>
<article class="seo-block"><h2>Pickup at this store</h2><p>${escapeHtml(label)} in ${escapeHtml(store.city)} is one of ${inState.toLocaleString('en-US')} Apple Stores in ${escapeHtml(store.state)} tracked for iPhone Duo pickup. Search ZIP ${escapeHtml(store.zip)} on the <a href="/?zip=${encodeURIComponent(store.zip)}&amp;radius=50">live stock page</a> to compare it with nearby stores. The map distance is an approximate straight-line mile from ZIP estimates, not a driving route.</p><p>${escapeHtml(restockSentence)} See the <a href="/restock-times">restock times</a> for the nationwide hour and weekday pattern. That count is not phones received and not a promise of the next delivery.</p><p><a href="${escapeHtml(store.url)}" target="_blank" rel="noopener">Apple's page for this store</a></p></article>
<article class="seo-block" data-store-live data-store-id="${escapeHtml(store.id)}"><h2>Configurations</h2><p>These eight iPhone Duo models are checked here. The status column fills from the latest published snapshot in your browser. Searching this page does not contact Apple. A missing, failed, or old check is not out of stock.</p><p data-live-summary>Status appears here after the published snapshot loads.</p><div class="table-scroll"><table><caption>iPhone Duo configurations tracked at ${escapeHtml(label)}</caption><thead><tr><th>Storage</th><th>Color</th><th>Latest saved status</th></tr></thead><tbody>${rows}</tbody></table></div></article>
<article class="seo-block"><h2>Nearby stores</h2><ul>${nearbyItems}</ul><p><a href="/stores#${escapeHtml(store.stateCode)}">All tracked stores in ${escapeHtml(store.state)}</a></p></article>
<script src="/store-status.js" defer></script>`;
  return {file: `store/${store.slug}.html`, html: pageShell({title, description, path, jsonLd: [breadcrumbJsonLd(trail.map(({name, url}) => ({name, url})))], body})};
}

export function canonicalRedirects() {
  return ['/iphone-duo/', '/restock-times/', '/stores/', '/store/:slug/'].map(path => `${path} ${path.slice(0, -1)} 301`).join('\n') + '\n';
}

export async function prerender(distDir) {
  const seen = new Set();
  const pages = [guidePage(), restockPage(), storesPage(), ...stores.map(storePage)];
  for (const page of pages) {
    if (seen.has(page.file)) throw Error(`Duplicate prerendered page ${page.file}`);
    seen.add(page.file);
    const target = join(distDir, page.file);
    await mkdir(dirname(target), {recursive: true});
    await writeFile(target, page.html);
  }
  await writeFile(join(distDir, '_redirects'), canonicalRedirects());
  return pages.map(page => page.file);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = await prerender(process.argv[2] || 'dist');
  console.log(`Prerendered ${files.length} pages`);
}
