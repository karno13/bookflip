// Real challenge pages must keep being detected (also when the page carries prices), and the saved real
// pages must never be classified as challenges. Detection is deliberately strict: a false alarm costs one
// source for one scan, a missed challenge means more requests to a source that just blocked us.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { sourceChallenge } from '../marketplaces.mjs';

const dir = new URL('../fixtures/marketplaces/', import.meta.url);
const prices = '<div>Książka 20,00 zł</div><div>Druga 35,50 zł</div>';
const challenges = [
  [
    'Cloudflare interstitial',
    '<title>Attention Required! | Cloudflare</title><h1>Sorry, you have been blocked</h1>',
  ],
  ['Cloudflare just a moment', '<title>Just a moment...</title>'],
  ['captcha form as main content', '<form action="/verify"><div class="g-recaptcha"></div></form>'],
  ['verify you are human', '<h1>Verify you are human</h1>'],
  ['Polish human check', '<p>Potwierdź, że jesteś człowiekiem</p>'],
  [
    'Akamai Access Denied',
    '<TITLE>Access Denied</TITLE><H1>Access Denied</H1>Reference #18.1a2b3c',
  ],
];

test('real fixture pages are never classified as challenges', () => {
  const hits = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const html = JSON.parse(readFileSync(new URL(f, dir), 'utf8')).html;
    if (html && sourceChallenge(html)) hits.push(f);
  }
  for (const f of ['../details/tezeusz-product.html', '../details/vinted-item-captured.html'])
    if (sourceChallenge(readFileSync(new URL(f, dir), 'utf8'))) hits.push(f);
  assert.deepEqual(hits, []);
});

for (const [name, html] of challenges) {
  test('challenge detected: ' + name, () => assert.ok(sourceChallenge(html)));
  test('challenge detected with prices on the page: ' + name, () =>
    assert.ok(sourceChallenge(html + prices)),
  );
}
