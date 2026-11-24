import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMarketplaceGate } from '../marketplace-gate.mjs';
import { parseMarketplace, readSourceHtml, scanMarketplace } from '../marketplaces.mjs';
import { ANTIQUARIAN_SOURCES, categoryPageInfo, categoryPageUrl } from '../antiquarian-sources.mjs';
import { searchOffers, freshCategoryTasks } from '../scan-engine.mjs';
import { SqliteCatalogRepository } from '../sqlite-catalog-repository.mjs';
import { offerKind } from '../offer-kinds.mjs';
import { sourceOfferId } from '../offer-identity.mjs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/marketplaces/${name}`, import.meta.url), 'utf8'));
const task = (source, extra = {}) => ({
  source,
  host: ANTIQUARIAN_SOURCES[source].host,
  mode: 'category',
  categoryUrl: ANTIQUARIAN_SOURCES[source].categories[0],
  page: 1,
  language: 'pl',
  paginationVersion: 1,
  ...extra,
});

test('Conroy: ISBN, publisher, condition and description come from the list itself', () => {
  const { html } = fixture('conroy-category-captured.json');
  const [first] = parseMarketplace(html, task('Antykwariat Conroy'));
  assert.equal(first.title, 'Daniel Abraham "Smocza Droga"');
  assert.equal(first.isbn, '978-83-932319-9-7');
  assert.equal(first.publisher, 'Ars Machina');
  assert.equal(first.conditionClass, 'good');
  assert.match(first.conditionText, /^dobry; wady: lekko podniszczona/);
  assert.match(first.listingDescription, /Rok wydania: 2012/);
  assert.equal(first.price, 1000);
});

test('a category page keeps every book: phrases are matched later, not by the parser', () => {
  const { html } = fixture('szarlatan-category-captured.json');
  const rows = parseMarketplace(html, task('Szarlatan.pl', { searchQuery: 'Warhammer' }));
  assert.equal(rows.length, 3);
  // The shop's catalogue number at the end of the title is dropped.
  assert.equal(rows[0].title, 'Adamiak Stanisław ks. Teologia Tolkiena');
});

test('Stara Dobra Książka: a sold copy stays on the list but is not an offer', () => {
  const { html } = fixture('stara-dobra-ksiazka-category-captured.json');
  assert.match(html, /Egzemplarz sprzedany/);
  const urls = parseMarketplace(html, task('Stara Dobra Książka')).map((row) => row.url);
  assert.ok(urls.every((url) => !/mechanizm-serca/.test(url)));
});

test('shops added 16.11: publisher, joined author, shop id and sold copies', () => {
  const rows = (file, source) =>
    parseMarketplace(fixture(file).html, task(source, { searchQuery: 'Warhammer' }));
  const [torun] = rows('antykwariat-torun-category-captured.json', 'Antykwariat Toruń');
  assert.equal(torun.title, '20 000 mil podmorskiej żeglugi / Juliusz Verne');
  assert.equal(torun.publisher, 'Wydawnictwo Zielona Sowa');
  assert.equal(torun.price, 2400);
  const [tile] = rows('kultura-wraca-category-captured.json', 'Kultura Wraca');
  assert.equal(tile.title, 'Rozbitkowie z Arki Noego Ryszard. Winer');
  assert.equal(tile.externalOfferId, '520750');
  // Bookway prints the author in its own field; phrases name authors.
  const [bookway] = rows('bookway-category-captured.json', 'Bookway');
  assert.match(bookway.title, / - Szczepan Twardoch$/);
  // Gryf keeps sold copies on the list („Wyprzedane”): 4 cards, 2 offers.
  const gryf = fixture('antykwariat-gryf-category-captured.json');
  assert.equal((gryf.html.match(/price--sold-out/g) || []).length, 2);
  assert.equal(rows('antykwariat-gryf-category-captured.json', 'Antykwariat Gryf').length, 2);
  // Bookway page 3 is "?page=2"; a sort link of a Shoper category is not a page.
  assert.equal(
    categoryPageUrl(task('Bookway', { page: 3 })),
    'https://bookway.pl/ksiazki-kategoria/fantastyka?page=2',
  );
  assert.equal(
    ANTIQUARIAN_SOURCES['Antykwariat Toruń'].pageNumber(
      new URL('https://antykwariat-torun.pl/pl/c/Fantastyka/67/1/default/9'),
      '/pl/c/Fantastyka/67',
    ),
    null,
  );
});

test('pager: next page found per shop; NWS follows the link it prints', () => {
  const expected = {
    'BlackBooks.pl': ['blackbooks-category-captured.json', null],
    'Antykwariat Conroy': [
      'conroy-category-captured.json',
      'https://www.antykwariat-conroy.pl/fantastyka-c-7.html?page=2',
    ],
    'Szarlatan.pl': [
      'szarlatan-category-captured.json',
      'https://szarlatan.pl/kategoria-produktu/ksiazki-wspolczesne/fantastyka/page/2/',
    ],
    'Stara Dobra Książka': [
      'stara-dobra-ksiazka-category-captured.json',
      'https://staradobraksiazka.pl/1100-fantasy-science-fiction-horror,1.html',
    ],
    'Antykwariat NWS': [
      'antykwariat-nws-category-captured.json',
      'https://www.antykwariatnws.pl/antykwariat-27---1-Fantasy.html',
    ],
    'Antykwariat Toruń': [
      'antykwariat-torun-category-captured.json',
      'https://antykwariat-torun.pl/pl/c/Fantastyka/67/2',
    ],
    'Kultura Wraca': [
      'kultura-wraca-category-captured.json',
      'https://kulturawraca.pl/pl/c/Fantastyka%2C-science-fiction%2C-horror/314/2',
    ],
    // Drupal counts pages from zero.
    Bookway: [
      'bookway-category-captured.json',
      'https://bookway.pl/ksiazki-kategoria/fantastyka?page=1',
    ],
    'Antykwariat Gryf': [
      'antykwariat-gryf-category-captured.json',
      'https://antykwariatgryf.pl/collections/ksiazki-fantasy-science-fiction-horror?page=2',
    ],
  };
  for (const [source, [file, next]] of Object.entries(expected)) {
    const { html, categoryUrl } = fixture(file);
    const info = categoryPageInfo(html, task(source, { categoryUrl }), []);
    // The BlackBooks capture is from its fantasy subcategory, outside the configured parent.
    if (!next) continue;
    assert.equal(info.state, 'more', source);
    assert.equal(info.nextPage, 2, source);
    assert.equal(info.nextUrl, next, source);
  }
  // Page 2 of NWS is read only at the address the first page linked.
  const second = task('Antykwariat NWS', {
    page: 2,
    pageUrl: 'https://www.antykwariatnws.pl/antykwariat-27---1-Fantasy.html',
  });
  assert.equal(categoryPageUrl(second), second.pageUrl);
  assert.throws(
    () => categoryPageUrl({ ...second, pageUrl: 'https://www.antykwariatnws.pl/koszyk.html' }),
    /INVALID_MARKETPLACE_PAGE/,
  );
  assert.throws(
    () => categoryPageUrl(task('Szarlatan.pl', { categoryUrl: '/sklep/' })),
    /UNTRUSTED_MARKETPLACE_TASK/,
  );
});

test('the end of a category is concluded only from a pager or a short page', () => {
  const source = 'Antykwariat Conroy';
  const card = '<div class="item col-12"></div>';
  const lastPage = `${card}<a href="https://www.antykwariat-conroy.pl/fantastyka-c-7.html?page=50">50</a>`;
  assert.equal(categoryPageInfo(lastPage, task(source, { page: 51 }), []).state, 'end');
  assert.equal(categoryPageInfo(card.repeat(3), task(source), []).state, 'end');
  // A full first page without any pager: the pager changed, nothing may be marked gone.
  assert.equal(categoryPageInfo(card.repeat(10), task(source), []).state, 'unknown');
});

test('ISO-8859-2 pages (Antykwariat NWS) are decoded by their charset', async () => {
  const html = '<p>Wojny Świata Wynurzonego — Łódź</p>';
  const bytes = new Uint8Array(
    [...html].map((c) => ({ Ś: 0xa6, Ł: 0xa3, ź: 0xbc, '—': 0x2d })[c] ?? c.charCodeAt(0)),
  );
  const text = await readSourceHtml(
    'https://www.antykwariatnws.pl/antykwariat-27---0-Fantasy.html',
    {
      source: 'Antykwariat NWS',
      gate: createMarketplaceGate({ intervalMs: 0 }),
      pause: async () => {},
      fetcher: async () =>
        new Response(bytes, { headers: { 'content-type': 'text/html; charset=latin2' } }),
    },
  );
  assert.match(text, /Wojny Świata Wynurzonego - Łódź/);
});

const page = (titles, next = '') =>
  titles
    .map(
      (title, i) =>
        `<div class="item col-12"><a href="https://www.antykwariat-conroy.pl/x-p-${title.length}${i}.html"></a><p class="aboutProduct">${title}.<br>Stan: dobry.</p><span class="value"> 12,00 zł</span></div>`,
    )
    .join('') + next;

test('a category is read once per scan and its books are matched to each phrase', async () => {
  const requests = [];
  const scanner = (current, options) =>
    scanMarketplace(current, {
      ...options,
      gate: createMarketplaceGate({ intervalMs: 0 }),
      pause: async () => {},
      fetcher: async (url) => {
        requests.push(String(url));
        const html = String(url).includes('page=2')
          ? page(['Terry Pratchett "Kolor magii"'], '<a href="/fantastyka-c-7.html?page=1">1</a>')
          : page(
              ['Dan Abnett "Duchy Gaunta"', 'Andrzej Sapkowski "Krew elfów"'],
              '<a href="/fantastyka-c-7.html?page=2">2</a>',
            );
        return new Response(html, { headers: { 'content-type': 'text/html' } });
      },
    });
  const events = [];
  const result = await searchOffers(
    {
      queries: ['Terry Pratchett', 'Dan Abnett', 'Herezja Horusa'],
      sources: ['Antykwariat Conroy'],
    },
    {
      scanner,
      onProgress: (event) => events.push(event),
      freshTasks: new Set([JSON.stringify(['Antykwariat Conroy', 'Herezja Horusa'])]),
    },
  );
  assert.equal(requests.length, 2, 'two pages, not two pages per phrase');
  const byQuery = Object.fromEntries(result.results.map((row) => [row.query, row]));
  assert.equal(byQuery['Terry Pratchett'].count, 1);
  assert.equal(byQuery['Dan Abnett'].count, 1);
  assert.equal(byQuery['Terry Pratchett'].status, 'ok');
  assert.equal(byQuery['Terry Pratchett'].pagination.state, 'end');
  // Read in the last hours: not asked again, reported done.
  assert.equal(byQuery['Herezja Horusa'], undefined);
  assert.ok(
    events.some(
      (e) => e.type === 'source-done' && e.query === 'Herezja Horusa' && e.status === 'fresh',
    ),
  );
  // Sapkowski is named by no phrase.
  assert.equal(result.summary.rejected.topic, 1);
  assert.equal(offerKind({ source: 'Antykwariat Conroy' }), 'antiquarian');
  assert.equal(
    sourceOfferId(
      'Antykwariat Conroy',
      'https://www.antykwariat-conroy.pl/kolor-magii-p-17880.html',
    ),
    'Antykwariat Conroy:17880',
  );
});

test('only complete category reads of recent scans count as fresh', () => {
  const repository = new SqliteCatalogRepository(':memory:');
  const save = (at, results) =>
    repository.database
      .prepare('INSERT INTO scan_runs(scanned_at,summary_json,created_at) VALUES(?,?,?)')
      .run(at, JSON.stringify({ at, context: { results } }), at);
  const ok = (source, query) => ({ source, query, status: 'ok', pagination: { state: 'end' } });
  save('2026-11-14T08:00:00.000Z', [
    ok('Antykwariat Conroy', 'Warhammer'),
    { ...ok('Szarlatan.pl', 'Warhammer'), pagination: { state: 'partial' } },
    ok('Vinted', 'Warhammer'),
  ]);
  save('2026-11-12T08:00:00.000Z', [ok('Antykwariat NWS', 'Warhammer')]);
  const fresh = freshCategoryTasks(repository, new Date('2026-11-14T20:00:00.000Z'));
  assert.deepEqual([...fresh], [JSON.stringify(['Antykwariat Conroy', 'Warhammer'])]);
});

test('Lagano and Vanaheim: ISBN, availability and the pager of their Warhammer categories', () => {
  const lagano = fixture('lagano-category-captured.json');
  const [alpharius, angron, ...rest] = parseMarketplace(lagano.html, task('Lagano'));
  // The ISBN is the cover photo's file name; the sold-out omnibus („Niedostępny”) is no offer.
  assert.equal(alpharius.title, 'Alpharius: Głowa Hydry');
  assert.equal(alpharius.isbn, '9788382323634');
  assert.equal(alpharius.binding, 'oprawa miękka');
  assert.equal(angron.price, 4399, 'the shop price, not the publisher price');
  assert.deepEqual(rest, []);
  assert.match(lagano.html, /product-card--outofstock/);
  const vanaheim = fixture('vanaheim-category-captured.json');
  const [horus, galaxy, ...unorderable] = parseMarketplace(vanaheim.html, task('Vanaheim'));
  // Gross price shown to the buyer; the schema.org price is net.
  assert.equal(horus.price, 4590);
  assert.equal(horus.isbn, '9788382321357');
  assert.equal(horus.publisher, 'Copernicus Corporation');
  assert.equal(galaxy.isbn, '9788382321371');
  // schema.org says InStock, the disabled basket button says otherwise.
  assert.deepEqual(unorderable, []);
  assert.match(vanaheim.html, /Niedostępny do zamówienia/);
  for (const [source, next] of [
    ['Lagano', 'https://lagano.pl/ksiazki/warhammer/page/2/'],
    ['Vanaheim', 'https://vanaheim.pl/pl/1125-black-library-pl?page=2'],
  ]) {
    const info = categoryPageInfo(
      fixture(`${source.toLowerCase()}-category-captured.json`).html,
      task(source),
      [],
    );
    assert.equal(info.nextUrl, next, source);
    assert.equal(categoryPageUrl(task(source, { page: 2 })), next, source);
  }
  assert.equal(offerKind({ source: 'Vanaheim' }), 'new_shop');
});

test('a Warhammer category matches the phrase "Warhammer" although titles do not name it', async () => {
  const card = (slug, title) =>
    `<div class="product-card"><h3 class="product-card__title"><a href="https://lagano.pl/ksiazki/warhammer/${slug}/">${title}</a></h3><span class="product-card__price-current">43,99&nbsp;zł</span></div>`;
  const scanner = (current, options) =>
    scanMarketplace(current, {
      ...options,
      gate: createMarketplaceGate({ intervalMs: 0 }),
      pause: async () => {},
      fetcher: async () =>
        new Response(
          card('anarch', 'Duchy Gaunta - Anarch') + card('corax', 'Corax: Władca Cieni'),
          {
            headers: { 'content-type': 'text/html' },
          },
        ),
    });
  const result = await searchOffers(
    { queries: ['Warhammer', 'Duchy Gaunta', 'Terry Pratchett'], sources: ['Lagano'] },
    { scanner, onProgress: () => {}, freshTasks: new Set() },
  );
  const count = Object.fromEntries(result.results.map((row) => [row.query, row.count]));
  assert.deepEqual(count, { Warhammer: 2, 'Duchy Gaunta': 1, 'Terry Pratchett': 0 });
});

test('Gelber: a blog post per book — ISBN, state and price from its lines, unavailable copies kept off', async () => {
  const gelber = fixture('antykwariat-gelber-category-captured.json');
  const rows = parseMarketplace(gelber.html, task('Antykwariat Gelber'));
  const byTitle = (part) => rows.find((row) => row.title.includes(part));
  const duncan = byTitle('Zaklęta wnęka');
  assert.equal(duncan.price, 1900);
  assert.equal(duncan.isbn, '83-7001-872-6');
  assert.equal(duncan.publisher, 'Wydawnictwo ALFA');
  assert.equal(duncan.binding, 'miękka');
  assert.equal(duncan.conditionClass, 'good');
  assert.match(duncan.listingDescription, /Człowiek ze słowem/);
  // The price paragraph is nested differently in other posts.
  assert.equal(byTitle('Fatalne jaja').price, 1200);
  assert.equal(byTitle('Żołnierz z mgły').price, 600);
  // Out of stock: "cena" without an amount and „Pozycja tymczasowo niedostępna”.
  assert.match(gelber.html, /Pozycja tymczasowo niedostępna/);
  assert.equal(byTitle('Obława na'), undefined);
  // The note „Powieść ze świata Warhammera” puts the universe into the title the phrases see.
  assert.equal(byTitle('Piętno chaosu').title, 'Anthony Reynolds : Piętno chaosu (Warhammer)');
  assert.equal(byTitle('Piętno chaosu').conditionClass, 'very_good');
  assert.equal(offerKind({ source: 'Antykwariat Gelber' }), 'antiquarian');
  // Pager of the category: page 2 is "page/2/".
  const info = categoryPageInfo(gelber.html, task('Antykwariat Gelber'), []);
  assert.equal(info.state, 'more');
  assert.equal(
    info.nextUrl,
    'https://antykwariatgelber.pl/category/fantastyka-i-horror-zagraniczna/page/2/',
  );
  assert.equal(
    categoryPageUrl(
      task('Antykwariat Gelber', { categoryUrl: '/category/fantastyka-i-horror-polska/', page: 3 }),
    ),
    'https://antykwariatgelber.pl/category/fantastyka-i-horror-polska/page/3/',
  );
  // Through the scan: the phrase "Warhammer" finds the novel, the author's name finds the other.
  const scanner = (current, options) =>
    scanMarketplace(current, {
      ...options,
      gate: createMarketplaceGate({ intervalMs: 0 }),
      pause: async () => {},
      // Without the pager: the one page is the whole category.
      fetcher: async () =>
        new Response(gelber.html.replace(/<div class="pagination[\s\S]*?<\/div>/, ''), {
          headers: { 'content-type': 'text/html' },
        }),
    });
  const result = await searchOffers(
    { queries: ['Warhammer', 'Dave Duncan', 'Terry Pratchett'], sources: ['Antykwariat Gelber'] },
    { scanner, onProgress: () => {}, freshTasks: new Set() },
  );
  const count = Object.fromEntries(result.results.map((row) => [row.query, row.count]));
  assert.deepEqual(count, { Warhammer: 1, 'Dave Duncan': 1, 'Terry Pratchett': 0 });
});

test('Insignis: publisher shop tiles — price, author from the cover text, ISBN from the address, out of stock left out', async () => {
  const insignis = fixture('insignis-category-captured.json');
  const rows = parseMarketplace(insignis.html, task('Insignis'));
  const byTitle = (part) => rows.find((row) => row.title.includes(part));
  const blood = byTitle('Więzy krwi');
  assert.equal(blood.title, 'World of Warcraft: Więzy krwi - Christie Golden');
  // The current price, not the regular one (49,99 zł).
  assert.equal(blood.price, 2749);
  // A newer book has no ISBN in its address; an older one has.
  assert.equal(blood.isbn, undefined);
  assert.equal(byTitle('Dzień smoka').isbn, '9788367323000');
  assert.equal(byTitle('Dzień smoka').publisher, 'Insignis Media');
  // Out of stock ("Obecnie brak na stanie"): on the list, but not an offer.
  assert.match(insignis.html, /Obecnie brak na stanie/);
  assert.equal(byTitle('Brudne pranie'), undefined);
  assert.equal(offerKind({ source: 'Insignis' }), 'new_shop');
  // The page size is part of the category address; there is no pager on a short list.
  assert.equal(
    categoryPageUrl(task('Insignis')),
    'https://sklep.insignis.pl/30-world-of-warcraft?resultsPerPage=80',
  );
  assert.equal(categoryPageInfo(insignis.html, task('Insignis'), []).state, 'end');
  const second = categoryPageInfo(
    `${insignis.html}<a href="https://sklep.insignis.pl/30-world-of-warcraft?resultsPerPage=80&amp;page=2">2</a>`,
    task('Insignis'),
    [],
  );
  assert.equal(second.state, 'more');
  assert.equal(
    second.nextUrl,
    'https://sklep.insignis.pl/30-world-of-warcraft?resultsPerPage=80&page=2',
  );
  // Through the scan: the phrase "Warcraft" finds all three novels, an author finds his own.
  const scanner = (current, options) =>
    scanMarketplace(current, {
      ...options,
      gate: createMarketplaceGate({ intervalMs: 0 }),
      pause: async () => {},
      fetcher: async () =>
        new Response(insignis.html, { headers: { 'content-type': 'text/html' } }),
    });
  const result = await searchOffers(
    { queries: ['Warcraft', 'Richard A. Knaak', 'Terry Pratchett'], sources: ['Insignis'] },
    { scanner, onProgress: () => {}, freshTasks: new Set() },
  );
  const count = Object.fromEntries(result.results.map((row) => [row.query, row.count]));
  assert.deepEqual(count, { Warcraft: 3, 'Richard A. Knaak': 1, 'Terry Pratchett': 0 });
});

test('Copernicus Corporation: WooCommerce list without author or ISBN, sale price, out of stock left out', async () => {
  const cop = fixture('copernicus-corporation-category-captured.json');
  const rows = parseMarketplace(cop.html, task('Copernicus Corporation'));
  const byTitle = (part) => rows.find((row) => row.title.includes(part));
  assert.equal(rows.length, 3);
  // The title alone: no catalogue number to strip, no author, no ISBN (the product page has it).
  assert.equal(byTitle('Wizje Herezji').price, 22000);
  assert.equal(byTitle('Wizje Herezji').isbn, undefined);
  // A sale shows the old price in <del>: the current one counts.
  assert.equal(byTitle('Wywyższenie Horusa').price, 4190);
  assert.match(byTitle('Wizje Herezji').image, /^https:\/\/copcorp\.pl\/wp-content\/uploads\//);
  // Out of stock is on the list but is not an offer.
  assert.match(cop.html, /outofstock/);
  assert.equal(byTitle('Eisenhorn'), undefined);
  assert.equal(offerKind({ source: 'Copernicus Corporation' }), 'new_shop');
  const info = categoryPageInfo(cop.html, task('Copernicus Corporation'), []);
  assert.equal(info.state, 'more');
  assert.equal(
    info.nextUrl,
    'https://copcorp.pl/kategoria-produktu/ksiazki/ksiazki-warhammer-40-000/page/2/',
  );
  assert.equal(
    categoryPageUrl(
      task('Copernicus Corporation', {
        page: 3,
        categoryUrl: ANTIQUARIAN_SOURCES['Copernicus Corporation'].categories[1],
      }),
    ),
    'https://copcorp.pl/kategoria-produktu/ksiazki/ksiazki-warhammer/page/3/',
  );
  // Through the scan: titles do not name the universe, the shop's topic does.
  const scanner = (current, options) =>
    scanMarketplace(current, {
      ...options,
      gate: createMarketplaceGate({ intervalMs: 0 }),
      pause: async () => {},
      fetcher: async () =>
        new Response(cop.html.replace(/<nav class="woocommerce-pagination"[\s\S]*?<\/nav>/, ''), {
          headers: { 'content-type': 'text/html' },
        }),
    });
  const result = await searchOffers(
    {
      queries: ['Warhammer', 'Komisarz Gaunt', 'Terry Pratchett'],
      sources: ['Copernicus Corporation'],
    },
    { scanner, onProgress: () => {}, freshTasks: new Set() },
  );
  // The same three books come from each of the three categories (the fetcher answers alike).
  const count = Object.fromEntries(result.results.map((row) => [row.query, row.count]));
  assert.deepEqual(count, { Warhammer: 3, 'Komisarz Gaunt': 1, 'Terry Pratchett': 0 });
});

test('Królicza Jama: a gone copy stays on the list with its price but is not an offer', async () => {
  const jama = fixture('kroliczajama-category-captured.json');
  const rows = parseMarketplace(jama.html, task('Antykwariat Królicza Jama'));
  const byTitle = (part) => rows.find((row) => row.title.includes(part));
  assert.equal(rows.length, 2);
  assert.equal(byTitle('Eryk Promiennooki').title, 'H. Rider Haggard • Eryk Promiennooki');
  assert.equal(byTitle('Eryk Promiennooki').price, 1600);
  assert.equal(byTitle('Eryk Promiennooki').externalOfferId, '85456');
  assert.equal(byTitle('Powrót z gwiazd').price, 4500);
  // „Produkt niedostępny”: 45,00 zł on the list, no offer.
  assert.match(jama.html, /view_stock_info_text_not/);
  assert.equal(byTitle('Gemina'), undefined);
  assert.equal(offerKind({ source: 'Antykwariat Królicza Jama' }), 'antiquarian');
  // Page 2 is ",1.html" (RedCart counts from zero).
  const info = categoryPageInfo(jama.html, task('Antykwariat Królicza Jama'), []);
  assert.equal(info.state, 'more');
  assert.equal(info.nextUrl, 'https://kroliczajama.pl/52-fantasy,1.html');
  assert.equal(
    categoryPageUrl(task('Antykwariat Królicza Jama', { categoryUrl: '/54-horror', page: 3 })),
    'https://kroliczajama.pl/54-horror,2.html',
  );
  // Through the scan: an author's name finds the available book only.
  const scanner = (current, options) =>
    scanMarketplace(current, {
      ...options,
      gate: createMarketplaceGate({ intervalMs: 0 }),
      pause: async () => {},
      fetcher: async () =>
        new Response(jama.html.replace(/<div class="pagination"[\s\S]*?<\/div>/, ''), {
          headers: { 'content-type': 'text/html' },
        }),
    });
  const result = await searchOffers(
    {
      queries: ['Stanisław Lem', 'Kristoff', 'Warhammer'],
      sources: ['Antykwariat Królicza Jama'],
    },
    { scanner, onProgress: () => {}, freshTasks: new Set() },
  );
  const count = Object.fromEntries(result.results.map((row) => [row.query, row.count]));
  assert.deepEqual(count, { 'Stanisław Lem': 1, Kristoff: 0, Warhammer: 0 });
});

test('Exlibris: Flatsome tiles — title with author, price without a currency space, pager of 15 pages', async () => {
  const exlibris = fixture('antykwariat-exlibris-category-captured.json');
  const rows = parseMarketplace(exlibris.html, task('Antykwariat Exlibris'));
  const byTitle = (part) => rows.find((row) => row.title.includes(part));
  assert.equal(rows.length, 3);
  assert.equal(byTitle('Bunt').title, '01 Starship – Bunt – Mike Resnick');
  assert.equal(byTitle('Bunt').price, 1000);
  assert.equal(byTitle('Bunt').externalOfferId, '18927');
  assert.equal(byTitle('Wichry wojny').price, 1500);
  assert.match(
    byTitle('Bunt').image,
    /^https:\/\/antykwariat-exlibris\.com\/wp-content\/uploads\//,
  );
  assert.equal(offerKind({ source: 'Antykwariat Exlibris' }), 'antiquarian');
  // The pager prints ellipsis and a "next" arrow: page 2 is the first link to follow.
  const info = categoryPageInfo(exlibris.html, task('Antykwariat Exlibris'), []);
  assert.equal(info.state, 'more');
  assert.equal(
    info.nextUrl,
    'https://antykwariat-exlibris.com/sklep/kategoria/fantastyka-fantasy/page/2/',
  );
  assert.equal(
    categoryPageUrl(task('Antykwariat Exlibris', { page: 15 })),
    'https://antykwariat-exlibris.com/sklep/kategoria/fantastyka-fantasy/page/15/',
  );
  const scanner = (current, options) =>
    scanMarketplace(current, {
      ...options,
      gate: createMarketplaceGate({ intervalMs: 0 }),
      pause: async () => {},
      fetcher: async () =>
        new Response(
          exlibris.html.replace(/<nav class="woocommerce-pagination"[\s\S]*?<\/nav>/, ''),
          { headers: { 'content-type': 'text/html' } },
        ),
    });
  const result = await searchOffers(
    { queries: ['Warcraft', 'Mike Resnick', 'Terry Pratchett'], sources: ['Antykwariat Exlibris'] },
    { scanner, onProgress: () => {}, freshTasks: new Set() },
  );
  const count = Object.fromEntries(result.results.map((row) => [row.query, row.count]));
  assert.deepEqual(count, { Warcraft: 1, 'Mike Resnick': 1, 'Terry Pratchett': 0 });
});
