import {OG_IMAGE, OG_IMAGE_ALT, SITE_NAME, SITE_ORIGIN, jsonLdScript} from '../shared/seo.js';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
}

const MARK = '<span class="brand-mark"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 8h12l1 12H5L6 8Z" stroke="currentColor" stroke-width="1.7"/><path d="M9 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.7"/></svg></span>';

export function footerHtml() {
  return `<footer><div><strong>Apple Pickup Live</strong><span>Independent inventory observations. Not affiliated with Apple.</span></div><p>Availability can change before checkout. Failed or old checks are never treated as confirmed out of stock.</p><nav class="footer-links" aria-label="Footer"><a href="/iphone-duo">iPhone Duo tracker</a><a href="/restock-times">Restock times</a><a href="/stores">All stores</a><a href="https://app.o1xhack.com/" target="_blank" rel="noopener">o1xhack apps</a><a href="https://x.com/o1xhack" target="_blank" rel="noopener">X @o1xhack</a><a href="https://github.com/o1xhack/apple-pickup-live" target="_blank" rel="noopener">GitHub ↗</a></nav></footer>`;
}

export function crumbs(items) {
  return `<nav class="crumbs" aria-label="Breadcrumb">${items.map((item, index) => index === items.length - 1 ? `<span aria-current="page">${escapeHtml(item.name)}</span>` : `<a href="${escapeHtml(item.href)}">${escapeHtml(item.name)}</a>`).join('<span aria-hidden="true">/</span>')}</nav>`;
}

export function pageShell({title, description, path, jsonLd = [], body}) {
  const url = `${SITE_ORIGIN}${path}`;
  const schemas = (Array.isArray(jsonLd) ? jsonLd : [jsonLd]).filter(Boolean);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta name="theme-color" content="#f6f7f3"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(url)}"><meta property="og:site_name" content="${SITE_NAME}"><meta property="og:type" content="website"><meta property="og:locale" content="en_US"><meta property="og:url" content="${escapeHtml(url)}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:image" content="${OG_IMAGE}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${escapeHtml(OG_IMAGE_ALT)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@o1xhack"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${OG_IMAGE}"><meta name="twitter:image:alt" content="${escapeHtml(OG_IMAGE_ALT)}">${schemas.map(schema => jsonLdScript(schema)).join('')}<link rel="stylesheet" href="/styles.css"></head><body>
<header class="site-header"><a class="brand" href="/">${MARK}<span>Apple Pickup <b>Live</b></span></a><nav aria-label="Main"><a class="nav-link" href="/">Live stock</a><a class="nav-link" href="/?tab=history">History</a><a class="nav-link" href="/?tab=stats">Statistics</a><a class="about-link" href="https://app.o1xhack.com/" target="_blank" rel="noopener">About ↗</a></nav></header>
<main>
${body}
</main>
${footerHtml()}
</body></html>
`;
}
