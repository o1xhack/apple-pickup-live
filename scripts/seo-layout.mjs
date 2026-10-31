import {OG_IMAGE, OG_IMAGE_ALT, SITE_NAME, SITE_ORIGIN, jsonLdScript} from '../shared/seo.js';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
}

/** Picks the English or Chinese string. Pages are English by default; Chinese is the same page swapped in the browser. */
export function translator(lang) {
  return (en, zh) => lang === 'zh' ? zh : en;
}

const MARK = '<span class="brand-mark"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 8h12l1 12H5L6 8Z" stroke="currentColor" stroke-width="1.7"/><path d="M9 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.7"/></svg></span>';

export function headerHtml(lang = 'en') {
  const t = translator(lang);
  return `<header class="site-header"><a class="brand" href="/">${MARK}<span>Apple Pickup <b>Live</b></span></a><nav aria-label="${t('Main', '主导航')}"><a class="nav-link" href="/">${t('Live stock', '实时库存')}</a><a class="nav-link" href="/?tab=history">${t('History', '历史记录')}</a><a class="nav-link" href="/?tab=stats">${t('Statistics', '全国统计')}</a><a class="about-link" href="https://app.o1xhack.com/" target="_blank" rel="noopener">${t('About ↗', '关于我 ↗')}</a></nav><button class="language" type="button" data-language-toggle aria-label="${t('Change language', '切换语言')}">${t('中文', 'English')}</button></header>`;
}

export function footerHtml(lang = 'en') {
  const t = translator(lang);
  return `<footer><div><strong>Apple Pickup Live</strong><span>${t('Independent inventory observations. Not affiliated with Apple.', '独立库存观测，与 Apple 无关联。')}</span></div><p>${t('Availability can change before checkout. Failed or old checks are never treated as confirmed out of stock.', '下单前库存随时可能变化。失败或过期的检查不会被当作确认无货。')}</p><nav class="footer-links" aria-label="${t('Footer', '页脚')}"><a href="/iphone-duo">${t('iPhone Duo tracker', 'iPhone Duo 库存追踪')}</a><a href="/restock-times">${t('Restock times', '补货时间')}</a><a href="/stores">${t('All stores', '全部门店')}</a><a href="https://app.o1xhack.com/" target="_blank" rel="noopener">${t('o1xhack apps', 'o1xhack 的作品')}</a><a href="https://x.com/o1xhack" target="_blank" rel="noopener">X @o1xhack</a><a href="https://github.com/o1xhack/apple-pickup-live" target="_blank" rel="noopener">GitHub ↗</a></nav></footer>`;
}

export function crumbs(items) {
  return `<nav class="crumbs" aria-label="Breadcrumb">${items.map((item, index) => index === items.length - 1 ? `<span aria-current="page">${escapeHtml(item.name)}</span>` : `<a href="${escapeHtml(item.href)}">${escapeHtml(item.name)}</a>`).join('<span aria-hidden="true">/</span>')}</nav>`;
}

function pageContent(lang, body) {
  return `${headerHtml(lang)}
<main>
${body}
</main>
${footerHtml(lang)}`;
}

/**
 * Crawlers and English visitors get the English HTML. The Chinese version sits in a template and
 * /page-language.js swaps it in when the visitor chose Chinese on any page (the shared `apl-language` key).
 */
export function pageShell({title, description, path, jsonLd = [], body, zh, scripts = []}) {
  const url = `${SITE_ORIGIN}${path}`;
  const schemas = (Array.isArray(jsonLd) ? jsonLd : [jsonLd]).filter(Boolean);
  const chinese = zh ? `<template id="page-zh" data-title="${escapeHtml(zh.title)}" data-description="${escapeHtml(zh.description)}">${pageContent('zh', zh.body)}</template>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta name="theme-color" content="#f6f7f3"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(url)}"><meta property="og:site_name" content="${SITE_NAME}"><meta property="og:type" content="website"><meta property="og:locale" content="en_US"><meta property="og:url" content="${escapeHtml(url)}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:image" content="${OG_IMAGE}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${escapeHtml(OG_IMAGE_ALT)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@o1xhack"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${OG_IMAGE}"><meta name="twitter:image:alt" content="${escapeHtml(OG_IMAGE_ALT)}">${schemas.map(schema => jsonLdScript(schema)).join('')}<link rel="stylesheet" href="/styles.css"></head><body>
<div id="page-content" class="page-content">${pageContent('en', body)}</div>
${chinese}<script src="/page-language.js"></script>${scripts.map(src => `<script src="${escapeHtml(src)}" defer></script>`).join('')}
</body></html>
`;
}
