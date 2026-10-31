import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {breadcrumbJsonLd, datasetJsonLd, faqJsonLd, homeJsonLd, jsonLdScript} from '../shared/seo.js';

test('homepage JSON-LD matches the WebSite and WebApplication graph', async () => {
  const html = await readFile('public/index.html', 'utf8');
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'homepage is missing JSON-LD');
  assert.deepEqual(JSON.parse(match[1]), homeJsonLd());
  const types = homeJsonLd()['@graph'].map(node => node['@type']);
  assert.deepEqual(types, ['WebSite', 'WebApplication', 'Organization']);
  assert.equal(homeJsonLd()['@graph'][0].potentialAction.target.urlTemplate, 'https://pickup.o1xhack.com/?zip={zip}');
});

test('subpage schema builders describe breadcrumbs, FAQs, and the dataset', () => {
  const crumbs = breadcrumbJsonLd([{name: 'Home', url: 'https://pickup.o1xhack.com/'}, {name: 'Stores', url: 'https://pickup.o1xhack.com/stores'}]);
  assert.equal(crumbs['@type'], 'BreadcrumbList');
  assert.equal(crumbs.itemListElement[1].position, 2);
  const faq = faqJsonLd([{question: 'What is tracked?', answer: 'iPhone Duo pickup observations.'}]);
  assert.equal(faq.mainEntity[0]['@type'], 'Question');
  const dataset = datasetJsonLd({name: 'Restock observations', description: 'Candidate restocks.', url: 'https://pickup.o1xhack.com/restock-times', temporalCoverage: '2026-10-24/2026-10-29'});
  assert.equal(dataset['@type'], 'Dataset');
  assert.match(dataset.variableMeasured, /Not a count of phones/);
  assert.doesNotMatch(jsonLdScript({danger: '<script>'}), /<script>/);
});
