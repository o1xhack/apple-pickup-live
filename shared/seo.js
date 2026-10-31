export const SITE_ORIGIN = 'https://pickup.o1xhack.com';
export const SITE_NAME = 'Apple Pickup Live';
export const HOME_TITLE = 'iPhone Duo Stock Tracker — Apple Pickup Live';
export const HOME_DESCRIPTION = 'iPhone Duo stock tracker for pickup availability across US Apple Stores. Find iPhone Duo in stock near you by ZIP, plus history and restock observations.';
export const OG_IMAGE = `${SITE_ORIGIN}/og.png`;
export const OG_IMAGE_ALT = 'Apple Pickup Live: iPhone Duo stock tracker for pickup availability across the United States.';

export function jsonLdScript(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

export function homeJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_ORIGIN}/#website`,
        name: SITE_NAME,
        url: `${SITE_ORIGIN}/`,
        description: HOME_DESCRIPTION,
        inLanguage: 'en',
        publisher: {'@id': `${SITE_ORIGIN}/#publisher`},
        potentialAction: {
          '@type': 'SearchAction',
          target: {'@type': 'EntryPoint', urlTemplate: `${SITE_ORIGIN}/?zip={zip}`},
          'query-input': 'required name=zip'
        }
      },
      {
        '@type': 'WebApplication',
        '@id': `${SITE_ORIGIN}/#app`,
        name: SITE_NAME,
        url: `${SITE_ORIGIN}/`,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Web',
        description: HOME_DESCRIPTION,
        offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'},
        isAccessibleForFree: true,
        publisher: {'@id': `${SITE_ORIGIN}/#publisher`}
      },
      {
        '@type': 'Organization',
        '@id': `${SITE_ORIGIN}/#publisher`,
        name: 'o1xhack',
        url: 'https://app.o1xhack.com/',
        sameAs: 'https://x.com/o1xhack'
      }
    ]
  };
}

export function breadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  };
}

export function faqJsonLd(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {'@type': 'Answer', text: faq.answer}
    }))
  };
}

export function datasetJsonLd({name, description, url, temporalCoverage}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name,
    description,
    url,
    creator: {'@id': `${SITE_ORIGIN}/#publisher`},
    license: 'https://www.gnu.org/licenses/gpl-3.0.html',
    isAccessibleForFree: true,
    spatialCoverage: {'@type': 'Place', name: 'United States'},
    temporalCoverage,
    keywords: ['iPhone Duo', 'Apple Store pickup', 'restock observations'],
    variableMeasured: 'Candidate restock observations: an out-of-stock check followed by an in-stock check. Not a count of phones.'
  };
}
