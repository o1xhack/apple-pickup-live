export const API_PATHS = ['info', 'latest', 'checkpoint', 'series', 'history', 'legacy/statistics'];
const API_ORIGIN = 'https://apple-pickup-live.o1xhack.workers.dev';

export function apiRedirectLines() {
  return API_PATHS.map(name => `/api/${name} ${API_ORIGIN}/api/${name} 302`);
}

export function mergeRedirects(existing = '') {
  const lines = String(existing).split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  const spa = lines.filter(line => /\/index\.html(?:\s|$)/.test(line) && /\s200(?:\s|$)/.test(line));
  if (spa.length) throw Error('A 200 rewrite to index.html would hide real HTTP 404s');
  const kept = lines.filter(line => !line.startsWith('/api/'));
  return [...kept, ...apiRedirectLines()].join('\n') + '\n';
}
