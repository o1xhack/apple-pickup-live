import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import stores from '../data/us-stores.json' with {type: 'json'};
import products from '../data/products.json' with {type: 'json'};
import summary from '../data/restock-summary.json' with {type: 'json'};
import {dayKey} from '../shared/daily.js';
import {haversineMiles} from '../shared/model.js';
import {SITE_ORIGIN, breadcrumbJsonLd, datasetJsonLd, faqJsonLd} from '../shared/seo.js';
import {crumbs, escapeHtml, pageShell, translator} from './seo-layout.mjs';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const COLORS_ZH = {'Star White': '星白色', 'Night Sky': '夜空色'};

export function storeLabel(store) {
  return store.name.startsWith('Apple ') ? store.name : `Apple ${store.name}`;
}

function colorName(color, lang) {
  return lang === 'zh' ? COLORS_ZH[color] || color : color;
}

function hourName(hour) {
  const label = hour % 12 === 0 ? 12 : hour % 12;
  return `${label} ${hour < 12 ? 'a.m.' : 'p.m.'}`;
}

export function hourRange(hour, lang = 'en') {
  if (lang === 'zh') return `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`;
  return `${hourName(hour)}–${hourName((hour + 1) % 24)}`;
}

function locale(lang) {
  return lang === 'zh' ? 'zh-CN' : 'en-US';
}

function number(value, lang) {
  return value.toLocaleString(locale(lang));
}

function pacificDate(ts, lang) {
  return new Intl.DateTimeFormat(locale(lang), {timeZone: 'America/Los_Angeles', dateStyle: 'long'}).format(new Date(ts));
}

function pacificStamp(ts, lang) {
  return new Intl.DateTimeFormat(locale(lang), {timeZone: 'America/Los_Angeles', dateStyle: 'long', timeStyle: 'short'}).format(new Date(ts));
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

const FAQS_ZH = [
  {
    question: 'iPhone Duo 库存追踪是什么？',
    answer: 'Apple Pickup Live 是一个独立网站，追踪美国 269 家 Apple Store 的 iPhone Duo 到店取货库存，展示的是已保存的观测记录。它与 Apple 无关联，也不会替你下单。'
  },
  {
    question: '怎么查附近哪家有 iPhone Duo 现货？',
    answer: '打开首页，输入美国邮编，选择 25、50、100 或 250 英里的范围。还可以按州、城市或门店名、容量和颜色筛选。搜索只读取已经保存的观测，不会向 Apple 发送请求。'
  },
  {
    question: '观测到有货，就代表店里有手机在等我吗？',
    answer: '不是。有货观测只表示某次已保存的检查显示该门店、该配置可以取货。它不是手机台数，下单前库存也可能变化。连续多次有货会被重复计数。'
  },
  {
    question: '“未观测到库存”是什么意思？',
    answer: '表示一次成功的检查显示无法取货。门店缺失、检查失败、结果未知或检查已过期，都不会被当作无货。'
  },
  {
    question: '追踪哪些 iPhone Duo 型号？',
    answer: '共 8 种配置：256GB、512GB、1TB 和 2TB，每种都有星白色和夜空色。'
  },
  {
    question: '取货库存有多新？',
    answer: '采集器目标是大约每五分钟完成一轮有上限的检查。只有最新观测在 15 分钟以内，公开页面才会显示近期有货。每家门店显示的时间是那次检查的保存时间，并不保证每家店都在最近五分钟内查过。'
  },
  {
    question: '公开统计从什么时候开始？',
    answer: '公开计数从太平洋时间 2026 年 10 月 24 日 0:00 开始。更早的原始记录会保留，但不计入公开总数。'
  },
  {
    question: '在哪里看门店什么时候补货？',
    answer: '补货时间页列出候选补货：同一门店、同一配置先保存到一次无货观测，紧接着又观测到有货。这不代表确认到货，也不是手机台数。首页的“全国统计”另外汇总重复的有货观测。'
  }
];

function faqBody(lang) {
  return (lang === 'zh' ? FAQS_ZH : FAQS).map(faq => `<h3>${escapeHtml(faq.question)}</h3><p>${escapeHtml(faq.answer)}</p>`).join('');
}

function trailFor(items, lang) {
  const t = translator(lang);
  return [{name: t('Home', '首页'), href: '/', url: `${SITE_ORIGIN}/`}, ...items.map(item => ({name: item.name, href: item.href, url: `${SITE_ORIGIN}${item.href}`}))];
}

function breadcrumbSchema(trail) {
  return breadcrumbJsonLd(trail.map(({name, url}) => ({name, url})));
}

function guidePage(lang) {
  const t = translator(lang);
  const title = t('iPhone Duo Pickup Availability — Stock Tracker Guide', 'iPhone Duo 取货库存 — 库存追踪使用指南');
  const description = t('How the iPhone Duo stock tracker works: search pickup availability near you by ZIP across 269 Apple Stores, and read what in stock, unknown, and restock observations mean.', 'iPhone Duo 库存追踪怎么用：按邮编查询全美 269 家 Apple Store 附近的取货库存，并了解有货、未知和补货观测分别代表什么。');
  const path = '/iphone-duo';
  const trail = trailFor([{name: 'iPhone Duo', href: path}], lang);
  const configurations = products.map(product => `<li>${escapeHtml(product.capacity)} ${escapeHtml(colorName(product.color, lang))}</li>`).join('');
  const body = t(`${crumbs(trail)}
<section class="intro"><div><p class="eyebrow">IPHONE DUO · PICKUP AVAILABILITY</p><h1>iPhone Duo stock tracker.</h1><p class="intro-note">Find iPhone Duo in stock near you from saved Apple Store pickup observations. Search by ZIP, then open history or restock times.</p><p class="independence-note">Independent inventory tracker. Not affiliated with Apple.</p></div></section>
<article class="seo-block"><h2>What this tracker does</h2><p>Apple Pickup Live watches iPhone Duo pickup availability at ${stores.length} Apple Stores in the United States. Each row is an observation of one store and one configuration. It is a stock tracker for pickup, not a checkout page and not a count of phones on a shelf.</p><p>Visitors only search snapshots that have already been published. Typing a ZIP does not trigger a new request to Apple.</p></article>
<article class="seo-block"><h2>How to use it</h2><ol><li>Start at the <a href="/">live stock page</a> and enter your ZIP code.</li><li>Choose 25, 50, 100, or 250 miles. Distances are approximate straight-line miles from ZIP locations.</li><li>Narrow the list by state, city or store, storage, and color, or show only configurations with a recent in-stock observation.</li><li>Open a store for each configuration. Use the <a href="/stores">store index</a> when you already know the store.</li><li>Use History for recorded state changes, Statistics for repeated in-stock observations, and <a href="/restock-times">restock times</a> for out-of-stock followed by in-stock.</li></ol></article>
<article class="seo-block"><h2>Configurations</h2><p>These eight iPhone Duo pickup configurations are tracked at every store:</p><ul>${configurations}</ul></article>
<article class="seo-block"><h2>How to read a result</h2><ul><li><strong>In stock</strong> means the latest saved check, within 15 minutes, showed pickup available.</li><li><strong>No stock observed</strong> means that check reported pickup unavailable.</li><li><strong>Unknown, not checked, or not recently verified</strong> means the tracker does not have a fresh successful answer. None of those are shown as out of stock.</li></ul></article>
<article class="seo-block"><h2>Questions</h2>${faqBody(lang)}</article>`, `${crumbs(trail)}
<section class="intro"><div><p class="eyebrow">IPHONE DUO · 取货库存</p><h1>iPhone Duo 库存追踪。</h1><p class="intro-note">根据已保存的 Apple Store 取货观测，查找你附近有 iPhone Duo 现货的门店。按邮编搜索，再查看历史记录或补货时间。</p><p class="independence-note">独立库存追踪网站，与 Apple 无关联。</p></div></section>
<article class="seo-block"><h2>这个网站做什么</h2><p>Apple Pickup Live 追踪美国 ${stores.length} 家 Apple Store 的 iPhone Duo 到店取货库存。每一行是一家门店、一种配置的一次观测。它追踪的是取货库存，不是下单页面，也不是货架上的手机台数。</p><p>访客搜索的只是已经发布的快照。输入邮编不会触发新的 Apple 请求。</p></article>
<article class="seo-block"><h2>怎么用</h2><ol><li>打开<a href="/">实时库存页</a>，输入你的邮编。</li><li>选择 25、50、100 或 250 英里。距离是根据邮编位置估算的直线英里数。</li><li>按州、城市或门店、容量和颜色缩小范围，或只看近期观测到有货的配置。</li><li>打开门店查看每种配置。已经知道门店时，可以直接用<a href="/stores">门店列表</a>。</li><li>“历史记录”看记录到的状态变化，“全国统计”看重复的有货观测，<a href="/restock-times">补货时间</a>看先无货后有货的变化。</li></ol></article>
<article class="seo-block"><h2>追踪的配置</h2><p>每家门店都追踪以下 8 种 iPhone Duo 取货配置：</p><ul>${configurations}</ul></article>
<article class="seo-block"><h2>怎么看结果</h2><ul><li><strong>有货</strong>：最近 15 分钟内的最新检查显示可以取货。</li><li><strong>未观测到库存</strong>：那次检查显示无法取货。</li><li><strong>未知、尚未检查或近期未验证</strong>：网站没有新的成功结果。这些都不会显示为无货。</li></ul></article>
<article class="seo-block"><h2>常见问题</h2>${faqBody(lang)}</article>`);
  return {file: 'iphone-duo.html', path, title, description, body, jsonLd: [breadcrumbSchema(trail), faqJsonLd(FAQS)]};
}

function restockPage(lang) {
  const t = translator(lang);
  const title = t('iPhone Duo Restock Times — When Pickup Stock Returns', 'iPhone Duo 补货时间 — 取货库存什么时候回来');
  const description = t('When iPhone Duo pickup availability tends to return at US Apple Stores, from recorded out-of-stock to in-stock observations. Not a phone count or an Apple schedule.', '根据记录到的“无货→有货”观测，看美国 Apple Store 的 iPhone Duo 取货库存通常什么时候回来。不是手机台数，也不是 Apple 的补货计划。');
  const path = '/restock-times';
  const trail = trailFor([{name: t('Restock times', '补货时间'), href: path}], lang);
  const total = summary.candidateRestocks;
  const max = Math.max(...summary.hours);
  const peaks = summary.hours.flatMap((count, hour) => count === max && count > 0 ? [hourRange(hour, lang)] : []);
  const weekdayNames = lang === 'zh' ? WEEKDAYS_ZH : WEEKDAYS;
  const quiet = weekdayNames.filter((_, index) => summary.weekdays[index] === 0);
  const byStore = Object.entries(summary.byStore).map(([id, count]) => ({store: stores.find(store => store.id === id), count})).filter(row => row.store).sort((a, b) => b.count - a.count || storeLabel(a.store).localeCompare(storeLabel(b.store)));
  const hourRows = summary.hours.map((count, hour) => `<tr><td>${hourRange(hour, lang)}</td><td>${number(count, lang)}</td><td>${share(count, total)}</td><td>${max ? `<span class="share-meter" style="width:${Math.max(4, Math.round(count / max * 120))}px"></span>` : ''}</td></tr>`).join('');
  const weekdayRows = summary.weekdays.map((count, index) => `<tr><td>${weekdayNames[index]}</td><td>${number(count, lang)}</td><td>${share(count, total)}</td></tr>`).join('');
  const partRows = products.map(product => `<tr><td>${escapeHtml(product.capacity)}</td><td>${escapeHtml(colorName(product.color, lang))}</td><td>${number(summary.byPart[product.part] || 0, lang)}</td></tr>`).join('');
  const storeRows = byStore.map(({store, count}) => `<tr><td><a href="/store/${store.slug}">${escapeHtml(storeLabel(store))}</a></td><td>${escapeHtml(store.city)}, ${escapeHtml(store.stateCode)}</td><td>${number(count, lang)}</td></tr>`).join('');
  const peakSentence = lang === 'zh'
    ? (peaks.length ? `最集中的时段是太平洋时间 ${peaks.join('、')}，共 ${number(max, lang)} 次候选补货观测。` : '这份汇总里还没有候选补货观测。')
    : (peaks.length ? `The busiest ${peaks.length === 1 ? 'hour was' : 'hours were'} ${peaks.join(' and ')} Pacific Time, with ${number(max, lang)} candidate restock observations.` : 'No candidate restock observations are in this summary yet.');
  const quietSentence = !quiet.length ? '' : lang === 'zh'
    ? `${quiet.join('、')}在这段时间里没有记录，所以按星期的表格还不能当作稳定的每周规律。`
    : ` ${quiet.join(' and ')} ${quiet.length === 1 ? 'has' : 'have'} none in this window, so the weekday table is not yet a stable weekly pattern.`;
  const legacySentence = !summary.legacyCandidates ? '' : lang === 'zh'
    ? `其中 ${number(summary.legacyCandidates, lang)} 次候选补货来自公开起点之后的早期加州样本。`
    : ` ${number(summary.legacyCandidates, lang)} of the candidate restocks come from the early California sample on or after the public start.`;
  const body = t(`${crumbs(trail)}
<section class="intro"><div><p class="eyebrow">RECORDED CANDIDATE RESTOCKS</p><h1>When iPhone Duo pickup stock returns.</h1><p class="intro-note">${escapeHtml(peakSentence)} These are observations, not an Apple restock schedule and not a count of phones.</p></div></section>
<article class="seo-block"><h2>What counts</h2><p>A candidate restock is one saved transition for a store and configuration: out of stock, then in stock, on adjacent valid checks. A first sighting, or a sighting after a sampling gap, is counted separately and is not called a restock. Repeated in-stock checks are not in this table. Those repeats are the daily bars on the <a href="/?tab=stats">Statistics tab</a>.</p><p>The public window starts ${escapeHtml(pacificDate(summary.statisticsStartedAt, lang))} at 12:00 a.m. Pacific Time. This summary includes ${number(total, lang)} candidate restocks and ${number(summary.firstOrRecovered, lang)} first-or-after-a-gap in-stock observations through ${escapeHtml(pacificStamp(summary.publishedAt, lang))}.${escapeHtml(legacySentence)} Failed or missing checks are not filled in as out of stock.</p><p>${escapeHtml(peakSentence + quietSentence)}</p></article>
<article class="seo-block table-card"><h2>Time of day, Pacific Time</h2><div class="table-scroll"><table><caption>Candidate restock observations by hour</caption><thead><tr><th>Hour</th><th>Observations</th><th>Share</th><th></th></tr></thead><tbody>${hourRows}</tbody></table></div></article>
<article class="seo-block table-card"><h2>Day of week</h2><p class="fine-print">A short calendar can be dominated by one busy day. Zero does not mean stores never change on that weekday.</p><div class="table-scroll"><table><caption>Candidate restock observations by Pacific weekday</caption><thead><tr><th>Day</th><th>Observations</th><th>Share</th></tr></thead><tbody>${weekdayRows}</tbody></table></div></article>
<article class="seo-block table-card"><h2>By configuration</h2><div class="table-scroll"><table><thead><tr><th>Storage</th><th>Color</th><th>Candidate restocks</th></tr></thead><tbody>${partRows}</tbody></table></div></article>
<article class="seo-block table-card"><h2>By store</h2><p class="fine-print">Stores with no candidate restock in this window are listed on the <a href="/stores">store index</a> and omitted here.</p><div class="table-scroll"><table><thead><tr><th>Store</th><th>City</th><th>Candidate restocks</th></tr></thead><tbody>${storeRows}</tbody></table></div></article>`, `${crumbs(trail)}
<section class="intro"><div><p class="eyebrow">已记录的候选补货</p><h1>iPhone Duo 取货库存什么时候回来。</h1><p class="intro-note">${escapeHtml(peakSentence)}这些是观测记录，不是 Apple 的补货计划，也不是手机台数。</p></div></section>
<article class="seo-block"><h2>怎么计数</h2><p>一次候选补货，是同一门店、同一配置在相邻两次有效检查之间从无货变成有货的一次保存记录。首次看到有货，或采样中断后再看到有货，会单独计数，不算补货。连续有货的重复检查不在这张表里，它们是<a href="/?tab=stats">全国统计</a>里的每日柱状图。</p><p>公开统计从太平洋时间 ${escapeHtml(pacificDate(summary.statisticsStartedAt, lang))} 0:00 开始。截至 ${escapeHtml(pacificStamp(summary.publishedAt, lang))}，这份汇总共有 ${number(total, lang)} 次候选补货，以及 ${number(summary.firstOrRecovered, lang)} 次首次或中断后的有货观测。${escapeHtml(legacySentence)}失败或缺失的检查不会被补记为无货。</p><p>${escapeHtml(peakSentence + quietSentence)}</p></article>
<article class="seo-block table-card"><h2>按时段（太平洋时间）</h2><div class="table-scroll"><table><caption>按小时统计的候选补货观测</caption><thead><tr><th>时段</th><th>观测次数</th><th>占比</th><th></th></tr></thead><tbody>${hourRows}</tbody></table></div></article>
<article class="seo-block table-card"><h2>按星期</h2><p class="fine-print">记录天数还少时，某一天特别忙就会占大头。为零不代表门店在那天从不变化。</p><div class="table-scroll"><table><caption>按太平洋时间星期统计的候选补货观测</caption><thead><tr><th>星期</th><th>观测次数</th><th>占比</th></tr></thead><tbody>${weekdayRows}</tbody></table></div></article>
<article class="seo-block table-card"><h2>按配置</h2><div class="table-scroll"><table><thead><tr><th>容量</th><th>颜色</th><th>候选补货</th></tr></thead><tbody>${partRows}</tbody></table></div></article>
<article class="seo-block table-card"><h2>按门店</h2><p class="fine-print">这段时间没有候选补货的门店不在此列出，可以在<a href="/stores">门店列表</a>里找到。</p><div class="table-scroll"><table><thead><tr><th>门店</th><th>城市</th><th>候选补货</th></tr></thead><tbody>${storeRows}</tbody></table></div></article>`);
  const dataset = datasetJsonLd({
    name: 'iPhone Duo Apple Store candidate restock observations',
    description: 'Out-of-stock to in-stock pickup observations for iPhone Duo at US Apple Stores, tallied by Pacific hour and weekday. Not a count of phones or a confirmed delivery schedule.',
    url: `${SITE_ORIGIN}${path}`,
    temporalCoverage: `${dayKey(summary.statisticsStartedAt)}/${dayKey(summary.latest || summary.publishedAt)}`
  });
  return {file: 'restock-times.html', path, title, description, body, jsonLd: [breadcrumbSchema(trail), dataset]};
}

function storesPage(lang) {
  const t = translator(lang);
  const title = t('Apple Stores Tracked for iPhone Duo Pickup', '追踪 iPhone Duo 取货的 Apple Store');
  const description = t(`All ${stores.length} US Apple Stores in the iPhone Duo stock tracker. Open a store for its address, ZIP, and recorded pickup observations.`, `iPhone Duo 库存追踪覆盖的全部 ${stores.length} 家美国 Apple Store。打开门店可查看地址、邮编和记录到的取货观测。`);
  const path = '/stores';
  const trail = trailFor([{name: t('Stores', '门店'), href: path}], lang);
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
  const body = t(`${crumbs(trail)}
<section class="intro"><div><p class="eyebrow">${stores.length} APPLE STORES</p><h1>iPhone Duo pickup, store by store.</h1><p class="intro-note">Every US Apple Store in this tracker has its own page. For stores near a ZIP code, use the <a href="/">live search</a>.</p></div></section>
<article class="seo-block">${sections}</article>`, `${crumbs(trail)}
<section class="intro"><div><p class="eyebrow">${stores.length} 家 APPLE STORE</p><h1>iPhone Duo 取货，逐店查看。</h1><p class="intro-note">追踪的每家美国 Apple Store 都有自己的页面。想找某个邮编附近的门店，请用<a href="/">实时搜索</a>。</p></div></section>
<article class="seo-block">${sections}</article>`);
  return {file: 'stores.html', path, title, description, body, jsonLd: [breadcrumbSchema(trail)]};
}

function storePage(store, lang) {
  if (!/^[a-z0-9]+$/.test(store.slug)) throw Error(`Unsafe store slug ${store.slug}`);
  const t = translator(lang);
  const label = storeLabel(store);
  const title = t(`iPhone Duo Pickup at ${label}, ${store.city}`, `${label}（${store.city}）的 iPhone Duo 取货库存`);
  const description = t(`iPhone Duo pickup availability at ${label} in ${store.city}, ${store.stateCode}. ZIP ${store.zip}. Saved observations, not a phone count.`, `${store.city}, ${store.stateCode} 的 ${label} iPhone Duo 取货库存，邮编 ${store.zip}。展示已保存的观测，不是手机台数。`);
  const path = `/store/${store.slug}`;
  const trail = trailFor([{name: t('Stores', '门店'), href: '/stores'}, {name: label, href: path}], lang);
  const count = summary.byStore[store.id] || 0;
  const restockSentence = lang === 'zh'
    ? (count ? `公开统计期间，这家门店记录到 ${number(count, lang)} 次候选补货观测（先无货，后有货）。` : '公开统计期间，这家门店还没有记录到相邻的“无货→有货”观测。')
    : (count ? `${number(count, lang)} candidate restock observation${count === 1 ? '' : 's'} (out of stock, then in stock) ${count === 1 ? 'was' : 'were'} recorded for this store in the public window.` : 'No adjacent out-of-stock to in-stock observation has been recorded for this store in the public window yet.');
  const inState = stores.filter(other => other.stateCode === store.stateCode).length;
  const nearby = stores.filter(other => other.id !== store.id).map(other => ({other, miles: haversineMiles(store, other)})).sort((a, b) => a.miles - b.miles).slice(0, 5);
  const nearbyItems = nearby.map(({other, miles}) => `<li><a href="/store/${other.slug}">${escapeHtml(storeLabel(other))}</a> — ${escapeHtml(other.city)}, ${escapeHtml(other.stateCode)} · ${miles.toFixed(0)} ${t('mi', '英里')}</li>`).join('');
  const trackerLink = `/?zip=${encodeURIComponent(store.zip)}&amp;radius=50`;
  const rows = products.map(product => `<tr data-part="${escapeHtml(product.part)}"><td>${escapeHtml(product.capacity)}</td><td>${escapeHtml(colorName(product.color, lang))}</td><td><span data-status>${t('Loads with the published snapshot.', '随已发布的快照加载。')}</span> <a href="${trackerLink}">${t('Open in the tracker', '在追踪页打开')}</a></td></tr>`).join('');
  const body = t(`${crumbs(trail)}
<section class="intro"><div><p class="eyebrow">${escapeHtml(store.state.toUpperCase())} · ${escapeHtml(store.zip)}</p><h1>${escapeHtml(label)}</h1><p class="intro-note">${escapeHtml(store.address)}, ${escapeHtml(store.city)}, ${escapeHtml(store.state)} ${escapeHtml(store.zip)}</p><p class="independence-note">iPhone Duo pickup availability for this Apple Store. Independent tracker. Not affiliated with Apple.</p></div></section>
<article class="seo-block"><h2>Pickup at this store</h2><p>${escapeHtml(label)} in ${escapeHtml(store.city)} is one of ${number(inState, lang)} Apple Stores in ${escapeHtml(store.state)} tracked for iPhone Duo pickup. Search ZIP ${escapeHtml(store.zip)} on the <a href="${trackerLink}">live stock page</a> to compare it with nearby stores. The map distance is an approximate straight-line mile from ZIP estimates, not a driving route.</p><p>${escapeHtml(restockSentence)} See the <a href="/restock-times">restock times</a> for the nationwide hour and weekday pattern. That count is not phones received and not a promise of the next delivery.</p><p><a href="${escapeHtml(store.url)}" target="_blank" rel="noopener">Apple's page for this store</a></p></article>
<article class="seo-block" data-store-live data-store-id="${escapeHtml(store.id)}"><h2>Configurations</h2><p>These eight iPhone Duo models are checked here. The status column fills from the latest published snapshot in your browser. Searching this page does not contact Apple. A missing, failed, or old check is not out of stock.</p><p data-live-summary>Status appears here after the published snapshot loads.</p><div class="table-scroll"><table><caption>iPhone Duo configurations tracked at ${escapeHtml(label)}</caption><thead><tr><th>Storage</th><th>Color</th><th>Latest saved status</th></tr></thead><tbody>${rows}</tbody></table></div></article>
<article class="seo-block"><h2>Nearby stores</h2><ul>${nearbyItems}</ul><p><a href="/stores#${escapeHtml(store.stateCode)}">All tracked stores in ${escapeHtml(store.state)}</a></p></article>`, `${crumbs(trail)}
<section class="intro"><div><p class="eyebrow">${escapeHtml(store.state.toUpperCase())} · ${escapeHtml(store.zip)}</p><h1>${escapeHtml(label)}</h1><p class="intro-note">${escapeHtml(store.address)}, ${escapeHtml(store.city)}, ${escapeHtml(store.state)} ${escapeHtml(store.zip)}</p><p class="independence-note">这家 Apple Store 的 iPhone Duo 取货库存。独立追踪网站，与 Apple 无关联。</p></div></section>
<article class="seo-block"><h2>这家门店的取货情况</h2><p>${escapeHtml(store.state)} 共有 ${number(inState, lang)} 家 Apple Store 在 iPhone Duo 取货追踪范围内，${escapeHtml(store.city)} 的 ${escapeHtml(label)} 是其中之一。在<a href="${trackerLink}">实时库存页</a>搜索邮编 ${escapeHtml(store.zip)}，可以和附近门店对比。地图距离是根据邮编估算的直线英里数，不是驾车路线。</p><p>${escapeHtml(restockSentence)}全国按时段和星期的规律见<a href="/restock-times">补货时间</a>。这个次数不是到货台数，也不预示下一次到货。</p><p><a href="${escapeHtml(store.url)}" target="_blank" rel="noopener">Apple 官网上的这家门店</a></p></article>
<article class="seo-block" data-store-live data-store-id="${escapeHtml(store.id)}"><h2>追踪的配置</h2><p>这家门店检查以下 8 种 iPhone Duo 配置。状态一栏在你的浏览器里根据最新发布的快照填入，浏览本页不会联系 Apple。缺失、失败或过期的检查不算无货。</p><p data-live-summary>已发布的快照加载后，这里会显示状态。</p><div class="table-scroll"><table><caption>${escapeHtml(label)} 追踪的 iPhone Duo 配置</caption><thead><tr><th>容量</th><th>颜色</th><th>最新保存状态</th></tr></thead><tbody>${rows}</tbody></table></div></article>
<article class="seo-block"><h2>附近门店</h2><ul>${nearbyItems}</ul><p><a href="/stores#${escapeHtml(store.stateCode)}">${escapeHtml(store.state)} 的全部追踪门店</a></p></article>`);
  return {file: `store/${store.slug}.html`, path, title, description, body, jsonLd: [breadcrumbSchema(trail)], scripts: ['/store-status.js']};
}

/** English is the indexed HTML (and the JSON-LD); the Chinese build rides along for the language switch. */
function bilingual(build) {
  const en = build('en');
  const zh = build('zh');
  return {file: en.file, html: pageShell({...en, zh: {title: zh.title, description: zh.description, body: zh.body}})};
}

export function canonicalRedirects() {
  return ['/iphone-duo/', '/restock-times/', '/stores/', '/store/:slug/'].map(path => `${path} ${path.slice(0, -1)} 301`).join('\n') + '\n';
}

export async function prerender(distDir) {
  const seen = new Set();
  const pages = [bilingual(guidePage), bilingual(restockPage), bilingual(storesPage), ...stores.map(store => bilingual(lang => storePage(store, lang)))];
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
