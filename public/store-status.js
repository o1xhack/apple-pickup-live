const FRESH_MS = 900000;
const REFRESH_MS = 60000;

function statusLabel(cell, now) {
  if (!cell?.at) return 'Not checked yet';
  if (now - cell.at > FRESH_MS) return 'Not recently verified';
  if (cell.code === '1') return 'In stock';
  if (cell.code === '0') return 'No stock observed';
  if (cell.code === 'P') return 'Pickup not open';
  return 'Unknown';
}

function renderSnapshot(root, snapshot, storeId, now) {
  const store = snapshot?.stores?.[storeId];
  if (!store || !Array.isArray(snapshot.products)) return false;
  let inStock = 0;
  for (const row of root.querySelectorAll('[data-part]')) {
    const index = snapshot.products.findIndex(product => product.part === row.getAttribute('data-part'));
    const cell = index >= 0 ? store.cells?.[index] : null;
    const slot = row.querySelector('[data-status]');
    if (!slot) continue;
    const label = statusLabel(cell, now);
    slot.textContent = label;
    if (label === 'In stock') inStock += 1;
  }
  const summary = root.querySelector('[data-live-summary]');
  if (summary) summary.textContent = `${inStock} of ${snapshot.products.length} configurations were in stock in the latest saved snapshot. An observation is not a phone on a shelf.`;
  return true;
}

function startStoreStatus(doc, fetchImpl, nowFn) {
  const root = doc.querySelector('[data-store-live]');
  if (!root) return;
  const id = root.getAttribute('data-store-id');
  const origin = globalThis.APP_API_ORIGIN || '';
  const clock = nowFn || (() => Date.now());
  let snapshot = null;
  let loading = false;

  async function load() {
    if (loading || doc.hidden) return;
    loading = true;
    try {
      const response = await fetchImpl(`${origin}/api/latest`);
      if (!response.ok) throw Error('snapshot');
      snapshot = await response.json();
      renderSnapshot(root, snapshot, id, clock());
    } catch {
      if (snapshot) renderSnapshot(root, snapshot, id, clock());
      else {
        const summary = root.querySelector('[data-live-summary]');
        if (summary) summary.textContent = 'The latest snapshot is temporarily unavailable. The store details above are still the tracked catalog.';
      }
    } finally {
      loading = false;
    }
  }

  function tick() {
    if (snapshot) renderSnapshot(root, snapshot, id, clock());
    if (!doc.hidden) load();
  }

  load();
  setInterval(tick, REFRESH_MS);
  doc.addEventListener('visibilitychange', () => {
    if (snapshot) renderSnapshot(root, snapshot, id, clock());
    if (!doc.hidden) load();
  });
}

if (typeof document !== 'undefined' && document.querySelector) startStoreStatus(document, fetch);
