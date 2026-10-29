const root = document.querySelector('[data-store-live]');
if (root) {
  const id = root.getAttribute('data-store-id');
  const origin = globalThis.APP_API_ORIGIN || '';
  fetch(`${origin}/api/latest`).then(response => {
    if (!response.ok) throw Error('snapshot');
    return response.json();
  }).then(snapshot => {
    const store = snapshot.stores?.[id];
    if (!store || !Array.isArray(snapshot.products)) return;
    const now = Date.now();
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
  }).catch(() => {
    const summary = root.querySelector('[data-live-summary]');
    if (summary) summary.textContent = 'The latest snapshot is temporarily unavailable. The store details above are still the tracked catalog.';
  });
}

function statusLabel(cell, now) {
  if (!cell?.at) return 'Not checked yet';
  if (now - cell.at > 900000) return 'Not recently verified';
  if (cell.code === '1') return 'In stock';
  if (cell.code === '0') return 'No stock observed';
  if (cell.code === 'P') return 'Pickup not open';
  return 'Unknown';
}
