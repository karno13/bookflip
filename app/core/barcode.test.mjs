import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeEan13Image, decodeEan13Row, ean13Valid, isBookEan } from './barcode.js';

// Encoder for the test only: EAN-13 digits → 95 modules (1 = bar).
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = L.map((code) => [...code].map((bit) => (bit === '1' ? '0' : '1')).join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

function modules(code) {
  const digits = [...code].map(Number);
  let bits = '101';
  for (let index = 1; index <= 6; index++) bits += (PARITY[digits[0]][index - 1] === 'L' ? L : G)[digits[index]];
  bits += '01010';
  for (let index = 7; index <= 12; index++) bits += R[digits[index]];
  return bits + '101';
}

/** Luminance row: quiet zones, a module `width` px wide (any real number), box blur and noise. */
function render(code, { width = 2.7, offset = 37.3, total = 520, blur = 1, noise = 18, seed = 7 } = {}) {
  const bits = modules(code);
  const row = new Array(total).fill(0).map((_, x) => {
    // Share of the pixel [x, x+1) covered by bars.
    let dark = 0;
    for (let sample = 0; sample < 8; sample++) {
      const module = Math.floor((x + (sample + 0.5) / 8 - offset) / width);
      if (module >= 0 && module < bits.length && bits[module] === '1') dark += 1 / 8;
    }
    return 225 - dark * 190;
  });
  const blurred = row.map((_, x) => {
    let sum = 0;
    let count = 0;
    for (let d = -blur; d <= blur; d++) if (row[x + d] !== undefined) (sum += row[x + d]), count++;
    return sum / count;
  });
  let state = seed;
  const random = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  return blurred.map((value) => Math.max(0, Math.min(255, value + (random() - 0.5) * noise)));
}

const CODES = ['9788373196032', '9780306406157', '9788375780307', '9791032305690', '9788324031511'];

test('check digit and the book (ISBN) range', () => {
  assert.equal(ean13Valid('9788373196032'), true);
  assert.equal(ean13Valid('9788373196033'), false);
  assert.equal(isBookEan('9788373196032'), true);
  assert.equal(isBookEan('5901234123457'), false, 'a valid EAN of a non-book product');
  assert.equal(isBookEan('978837319603'), false);
});

test('reads codes at uneven module widths, blurred and noisy, either way round', () => {
  for (const code of CODES)
    for (const width of [1.9, 2.7, 3.4, 5.1]) {
      const row = render(code, { width, offset: 20 + width * 9, total: Math.ceil(width * 95 + width * 30 + 40) });
      assert.equal(decodeEan13Row(row), code, `${code} at ${width} px`);
      assert.equal(decodeEan13Row([...row].reverse()), code, `${code} reversed at ${width} px`);
    }
});

test('a dark-on-light code in a bright, low-contrast frame still reads', () => {
  const row = render('9788373196032').map((value) => 120 + value * 0.45);
  assert.equal(decodeEan13Row(row), '9788373196032');
});

test('noise, flat rows and a code with a wrong check digit give nothing', () => {
  let state = 3;
  const random = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  assert.equal(decodeEan13Row(Array.from({ length: 600 }, () => random() * 255)), null);
  assert.equal(decodeEan13Row(new Array(600).fill(200)), null);
  assert.equal(decodeEan13Row([1, 2, 3]), null);
  // Modules of a code whose last digit is off: every digit matches, the check digit does not.
  assert.equal(decodeEan13Row(render('9788373196033')), null);
});

test('an RGBA frame is read on the rows around its middle', () => {
  const width = 520;
  const height = 60;
  const row = render('9780306406157', { total: width });
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      // Only the middle band holds the code; the top and bottom are a plain page.
      const value = y > 20 && y < 40 ? row[x] : 230;
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  assert.equal(decodeEan13Image({ data, width, height }), '9780306406157');
});

import { startBarcodeScanner } from './barcode.js';

/** A fake browser: a camera stream whose tracks record stop(), an optional BarcodeDetector. */
function fakeWindow({ detect = async () => [], play = async () => {} } = {}) {
  const tracks = [{ stopped: false, stop() { this.stopped = true; } }];
  const timers = [];
  const win = {
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => tracks }) } },
    document: { createElement: () => ({ getContext: () => null }) },
    setTimeout: (callback) => timers.push(callback),
    BarcodeDetector: Object.assign(function () { return { detect }; }, { getSupportedFormats: async () => ['ean_13'] }),
  };
  const video = { readyState: 4, muted: false, srcObject: null, setAttribute() {}, play };
  return { win, video, tracks, timers };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('a camera that cannot play is turned off and the error is passed on', async () => {
  const fake = fakeWindow({ play: async () => { throw Object.assign(Error('no'), { name: 'NotAllowedError' }); } });
  await assert.rejects(startBarcodeScanner(fake.video, () => {}, { win: fake.win }), /no/);
  assert.equal(fake.tracks[0].stopped, true);
  assert.equal(fake.video.srcObject, null);
});

test('a code read while the camera is being stopped is not reported; a running one reports once per window', async () => {
  let release;
  const pending = new Promise((resolve) => (release = resolve));
  const fake = fakeWindow({ detect: () => pending });
  const codes = [];
  const scanner = await startBarcodeScanner(fake.video, (code) => codes.push(code), { win: fake.win });
  assert.equal(scanner.native, true);
  await flush();
  scanner.stop();
  release([{ rawValue: '9788373196032' }]);
  await flush();
  assert.deepEqual(codes, []);
  assert.equal(fake.tracks[0].stopped, true);
  // A live scanner: the same code twice within the window counts once; a non-book EAN never.
  const live = fakeWindow({ detect: async () => [{ rawValue: '5901234123457' }, { rawValue: '9788373196032' }] });
  const seen = [];
  const running = await startBarcodeScanner(live.video, (code) => seen.push(code), { win: live.win });
  await flush();
  await live.timers.shift()();
  await flush();
  running.stop();
  assert.deepEqual(seen, ['9788373196032']);
});
