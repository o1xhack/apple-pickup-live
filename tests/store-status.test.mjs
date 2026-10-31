import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function loadScript(extra = {}) {
  const context = {console, setInterval() { return 0; }, ...extra};
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync('public/store-status.js', 'utf8'), context);
  return context;
}

function row(part, cellAt) {
  const status = {attrs: {'data-status': ''}, textContent: '', getAttribute: () => null, querySelector: () => null, querySelectorAll: () => []};
  return {
    attrs: {'data-part': part},
    textContent: '',
    children: [status],
    getAttribute: name => (name === 'data-part' ? part : null),
    querySelector: selector => selector === '[data-status]' ? status : null,
    querySelectorAll: () => []
  };
}

function page(parts) {
  const rows = parts.map(part => row(part.part));
  const summary = {attrs: {'data-live-summary': ''}, textContent: 'Status appears here after the published snapshot loads.', getAttribute: () => '', querySelector: () => null, querySelectorAll: () => []};
  const root = {
    attrs: {'data-store-live': '', 'data-store-id': 'R225'},
    getAttribute: name => name === 'data-store-id' ? 'R225' : '',
    querySelector: selector => selector === '[data-live-summary]' ? summary : null,
    querySelectorAll: selector => selector === '[data-part]' ? rows : []
  };
  return {root, rows, summary};
}

test('an in-stock label expires 15 minutes after the saved observation', () => {
  const {statusLabel} = loadScript();
  const at = 1_000_000;
  const cell = {at, code: '1'};
  assert.equal(statusLabel(cell, at + 900000), 'In stock');
  assert.equal(statusLabel(cell, at + 900001), 'Not recently verified');
  assert.equal(statusLabel({at: 0, code: '1'}, at), 'Not checked yet');
  assert.equal(statusLabel({at, code: '0'}, at), 'No stock observed');
});

test('a saved snapshot is relabeled on a later clock without a new fetch', () => {
  const {renderSnapshot} = loadScript();
  const at = 5_000_000;
  const {root, rows, summary} = page([{part: 'MK1E4LL/A'}]);
  const snapshot = {products: [{part: 'MK1E4LL/A'}], stores: {R225: {cells: [{at, code: '1'}]}}};
  assert.equal(renderSnapshot(root, snapshot, 'R225', at + 1000), true);
  assert.equal(rows[0].querySelector('[data-status]').textContent, 'In stock');
  assert.match(summary.textContent, /^1 of 1 configurations were in stock/);
  renderSnapshot(root, snapshot, 'R225', at + 900001);
  assert.equal(rows[0].querySelector('[data-status]').textContent, 'Not recently verified');
  assert.match(summary.textContent, /^0 of 1 configurations were in stock/);
});

test('visibility and the 60 second timer re-evaluate and refetch', async () => {
  let now = 10_000_000;
  const calls = [];
  let hidden = false;
  const listeners = {};
  const {root, rows} = page([{part: 'MK1E4LL/A'}]);
  const doc = {
    get hidden() { return hidden; },
    querySelector: () => root,
    addEventListener: (type, fn) => { listeners[type] = fn; }
  };
  let interval = null;
  const snapshot = {products: [{part: 'MK1E4LL/A'}], stores: {R225: {cells: [{at: now, code: '1'}]}}};
  const context = loadScript({
    document: undefined,
    setInterval: (fn, ms) => { interval = {fn, ms}; return 1; }
  });
  context.startStoreStatus(doc, async url => {
    calls.push(url);
    return {ok: true, json: async () => snapshot};
  }, () => now);
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  await flush();
  assert.equal(rows[0].querySelector('[data-status]').textContent, 'In stock');
  assert.equal(interval.ms, 60000);
  await flush();
  now += 900001;
  const beforeHidden = calls.length;
  hidden = true;
  interval.fn();
  assert.equal(rows[0].querySelector('[data-status]').textContent, 'Not recently verified');
  assert.equal(calls.length, beforeHidden);
  hidden = false;
  listeners.visibilitychange();
  await flush();
  assert.ok(calls.length > beforeHidden);
});

test('Chinese pages label the saved snapshot in Chinese', () => {
  const {statusLabel, renderSnapshot} = loadScript();
  const at = 7_000_000;
  assert.equal(statusLabel({at, code: '1'}, at, 'zh'), '有货');
  assert.equal(statusLabel({at, code: '1'}, at + 900001, 'zh'), '近期未验证');
  const {root, rows, summary} = page([{part: 'MK1E4LL/A'}]);
  const snapshot = {products: [{part: 'MK1E4LL/A'}], stores: {R225: {cells: [{at, code: '1'}]}}};
  renderSnapshot(root, snapshot, 'R225', at + 1000, 'zh');
  assert.equal(rows[0].querySelector('[data-status]').textContent, '有货');
  assert.match(summary.textContent, /1 种配置中有 1 种有货/);
});
