import {readdir, readFile, writeFile} from 'node:fs/promises';
import {join, relative, sep} from 'node:path';

export const SITE_ORIGIN = 'https://pickup.o1xhack.com';

// Public IndexNow ownership file. The body is the key alone, with no newline.
export const INDEXNOW_KEY = '286d51f27fb2687514afa4fc89fbe80a';

export function indexNowKeyFilename() {
  return `${INDEXNOW_KEY}.txt`;
}

export async function writeIndexNowKey(distDir) {
  await writeFile(join(distDir, indexNowKeyFilename()), INDEXNOW_KEY);
}

export async function listHtmlFiles(dir, base = dir) {
  const files = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listHtmlFiles(path, base));
    else if (entry.name.endsWith('.html')) files.push(relative(base, path).split(sep).join('/'));
  }
  return files.sort();
}

export function locationForHtml(htmlPath) {
  if (htmlPath === '404.html' || htmlPath.endsWith('/404.html')) return null;
  if (htmlPath === 'index.html') return `${SITE_ORIGIN}/`;
  const route = htmlPath.replace(/\/index\.html$/, '').replace(/\.html$/, '').replace(/\/$/, '');
  return `${SITE_ORIGIN}/${route}`;
}

export function renderRobotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
}

export function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[character]));
}

export function renderSitemap(locations) {
  const urls = [...new Set(locations)].sort((a, b) => a.localeCompare(b));
  const body = urls.map(location => `  <url><loc>${escapeXml(location)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export async function indexableLocations(distDir) {
  const files = await listHtmlFiles(distDir);
  const locations = [];
  for (const file of files) {
    const location = locationForHtml(file);
    if (!location) continue;
    const html = await readFile(join(distDir, file), 'utf8');
    if (/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html)) continue;
    locations.push(location);
  }
  return locations;
}

export async function writeSeoFiles(distDir) {
  const locations = await indexableLocations(distDir);
  await writeFile(join(distDir, 'robots.txt'), renderRobotsTxt());
  await writeFile(join(distDir, 'sitemap.xml'), renderSitemap(locations));
  await writeIndexNowKey(distDir);
  return locations;
}
