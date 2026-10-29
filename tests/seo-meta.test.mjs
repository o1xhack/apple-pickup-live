import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {HOME_DESCRIPTION, HOME_TITLE, OG_IMAGE, OG_IMAGE_ALT} from '../shared/seo.js';

test('the homepage head has a canonical URL and share cards', async () => {
  const html = await readFile('public/index.html', 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  assert.match(head, new RegExp(`<title>${HOME_TITLE}</title>`));
  assert.match(head, new RegExp(`<meta name="description" content="${HOME_DESCRIPTION}">`));
  assert.match(head, /<link rel="canonical" href="https:\/\/pickup\.o1xhack\.com\/">/);
  for (const property of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt']) {
    assert.match(head, new RegExp(`property="${property}"`));
  }
  assert.match(head, new RegExp(`property="og:image" content="${OG_IMAGE}"`));
  assert.match(head, /property="og:image:width" content="1200"/);
  assert.match(head, /property="og:image:height" content="630"/);
  assert.match(head, new RegExp(`property="og:image:alt" content="${OG_IMAGE_ALT}"`));
  assert.match(head, /name="twitter:card" content="summary_large_image"/);
  assert.match(head, /name="twitter:site" content="@o1xhack"/);
  assert.match(head, new RegExp(`name="twitter:image" content="${OG_IMAGE}"`));
});

test('the share image is a 1200 by 630 PNG', async () => {
  const png = await readFile('public/og.png');
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});
