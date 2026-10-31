const FRESH_MS = 900000;
const REFRESH_MS = 60000;

const LABELS = {
  en: {unchecked: 'Not checked yet', stale: 'Not recently verified', inStock: 'In stock', none: 'No stock observed', closed: 'Pickup not open', unknown: 'Unknown'},
  zh: {unchecked: '尚未检查', stale: '近期未验证', inStock: '有货', none: '未观测到库存', closed: '暂不开放取货', unknown: '未知'}
};

function statusKey(cell, now) {
  if (!cell?.at) return 'unchecked';
  if (now - cell.at > FRESH_MS) return 'stale';
  if (cell.code === '1') return 'inStock';
  if (cell.code === '0') return 'none';
  if (cell.code === 'P') return 'closed';
  return 'unknown';
}

function statusLabel(cell, now, lang = 'en') {
  return (LABELS[lang] || LABELS.en)[statusKey(cell, now)];
}

function summaryText(inStock, total, lang) {
  if (lang === 'zh') return `在最新保存的快照里，${total} 种配置中有 ${inStock} 种有货。一次观测不代表货架上有一台手机。`;
  return `${inStock} of ${total} configurations were in stock in the latest saved snapshot. An observation is not a phone on a shelf.`;
}

function renderSnapshot(root, snapshot, storeId, now, lang = 'en') {
  const store = snapshot?.stores?.[storeId];
  if (!store || !Array.isArray(snapshot.products)) return false;
  let inStock = 0;
  for (const row of root.querySelectorAll('[data-part]')) {
    const index = snapshot.products.findIndex(product => product.part === row.getAttribute('data-part'));
    const cell = index >= 0 ? store.cells?.[index] : null;
    const slot = row.querySelector('[data-status]');
    if (!slot) continue;
    slot.textContent = statusLabel(cell, now, lang);
    if (statusKey(cell, now) === 'inStock') inStock += 1;
  }
  const summary = root.querySelector('[data-live-summary]');
  if (summary) summary.textContent = summaryText(inStock, snapshot.products.length, lang);
  return true;
}

function startStoreStatus(doc, fetchImpl, nowFn) {
  const root = doc.querySelector('[data-store-live]');
  if (!root) return;
  const id = root.getAttribute('data-store-id');
  const origin = globalThis.APP_API_ORIGIN || '';
  const clock = nowFn || (() => Date.now());
  const lang = String(doc.documentElement?.lang || '').startsWith('zh') ? 'zh' : 'en';
  let snapshot = null;
  let loading = false;

  async function load() {
    if (loading || doc.hidden) return;
    loading = true;
    try {
      const response = await fetchImpl(`${origin}/api/latest`);
      if (!response.ok) throw Error('snapshot');
      snapshot = await response.json();
      renderSnapshot(root, snapshot, id, clock(), lang);
    } catch {
      if (snapshot) renderSnapshot(root, snapshot, id, clock(), lang);
      else {
        const summary = root.querySelector('[data-live-summary]');
        if (summary) summary.textContent = lang === 'zh' ? '最新快照暂时无法加载。上面的门店信息仍是追踪中的门店资料。' : 'The latest snapshot is temporarily unavailable. The store details above are still the tracked catalog.';
      }
    } finally {
      loading = false;
    }
  }

  function tick() {
    if (snapshot) renderSnapshot(root, snapshot, id, clock(), lang);
    if (!doc.hidden) load();
  }

  load();
  setInterval(tick, REFRESH_MS);
  doc.addEventListener('visibilitychange', () => {
    if (snapshot) renderSnapshot(root, snapshot, id, clock(), lang);
    if (!doc.hidden) load();
  });
}

if (typeof document !== 'undefined' && document.querySelector) startStoreStatus(document, fetch);
