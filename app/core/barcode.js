// Book barcodes (EAN-13 that start with 978/979 = ISBN-13) from the phone camera, without a
// library. The browser's own BarcodeDetector is used where it exists (Chrome on Android); elsewhere
// (Safari, Firefox) frames go through decodeEan13Row, a plain scanline decoder: threshold the row,
// measure bar widths, match each digit's four widths against the EAN tables and check the check
// digit. A code must be read twice in a row from frames before it counts (a misread rarely repeats).

// Widths (in modules) of the four elements of each digit, left-hand odd parity ("L") code.
const L_WIDTHS = ['3211', '2221', '2122', '1411', '1132', '1231', '1114', '1312', '1213', '3112'].map((code) => [...code].map(Number));
// Even parity ("G") is the L code mirrored; the right half ("R") has the L widths.
const G_WIDTHS = L_WIDTHS.map((widths) => [...widths].reverse());
// First digit from the parity of the six left digits.
const FIRST_DIGIT = { LLLLLL: 0, LLGLGG: 1, LLGGLG: 2, LLGGGL: 3, LGLLGG: 4, LGGLLG: 5, LGGGLL: 6, LGLGLG: 7, LGLGGL: 8, LGGLGL: 9 };
// 3 start guard + 6×4 left + 5 middle guard + 6×4 right + 3 end guard elements; 95 modules wide.
const RUNS = 59;
const MODULES = 95;
const MAX_DIGIT_ERROR = 0.38; // mean width error per element, in modules
const MAX_GUARD_ERROR = 0.5;

/** EAN-13 check digit is right. @param {string} code 13 digits */
export function ean13Valid(code) {
  if (!/^\d{13}$/.test(code)) return false;
  const sum = [...code.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

/** A book barcode: a valid EAN-13 in the ISBN ranges 978 / 979. */
export function isBookEan(code) {
  return /^97[89]\d{10}$/.test(String(code)) && ean13Valid(String(code));
}

/** Run lengths of a row of 0/1 (1 = dark), starting with the first dark run: [{ dark, width, start }]. */
function runsOf(bits) {
  const runs = [];
  let start = 0;
  for (let index = 1; index <= bits.length; index++) {
    if (index === bits.length || bits[index] !== bits[start]) {
      runs.push({ dark: bits[start] === 1, width: index - start, start });
      start = index;
    }
  }
  return runs;
}

/** Best digit for four widths (already in modules) from a table; { digit, error }. */
function matchDigit(widths, table) {
  let best = { digit: -1, error: Infinity };
  table.forEach((pattern, digit) => {
    const error = pattern.reduce((total, value, index) => total + Math.abs(value - widths[index]), 0) / 4;
    if (error < best.error) best = { digit, error };
  });
  return best;
}

/** Four run widths in pixels → widths in modules (a digit is 7 modules). */
function toModules(runs, from) {
  const pixels = runs.slice(from, from + 4).map((run) => run.width);
  const total = pixels.reduce((sum, value) => sum + value, 0);
  return pixels.map((value) => (value / total) * 7);
}

/** Decode 59 runs starting at a dark run; the 13 digits or null. */
function decodeRuns(runs, at) {
  const slice = runs.slice(at, at + RUNS);
  if (slice.length < RUNS || !slice[0].dark) return null;
  const total = slice.reduce((sum, run) => sum + run.width, 0);
  const module = total / MODULES;
  // Guards are bars and spaces of one module each.
  const guards = [0, 1, 2, 27, 28, 29, 30, 31, 56, 57, 58];
  if (guards.some((index) => Math.abs(slice[index].width / module - 1) > MAX_GUARD_ERROR)) return null;
  // A quiet zone of light at least a few modules wide before the code (when the row shows it).
  const before = runs[at - 1];
  if (before && before.width < module * 3) return null;
  let parity = '';
  let digits = '';
  for (let digit = 0; digit < 6; digit++) {
    const widths = toModules(slice, 3 + digit * 4);
    const odd = matchDigit(widths, L_WIDTHS);
    const even = matchDigit(widths, G_WIDTHS);
    const best = odd.error <= even.error ? { ...odd, parity: 'L' } : { ...even, parity: 'G' };
    if (best.error > MAX_DIGIT_ERROR) return null;
    parity += best.parity;
    digits += best.digit;
  }
  for (let digit = 0; digit < 6; digit++) {
    const best = matchDigit(toModules(slice, 32 + digit * 4), L_WIDTHS);
    if (best.error > MAX_DIGIT_ERROR) return null;
    digits += best.digit;
  }
  const first = FIRST_DIGIT[/** @type {keyof typeof FIRST_DIGIT} */ (parity)];
  if (first === undefined) return null;
  const code = `${first}${digits}`;
  return ean13Valid(code) ? code : null;
}

/**
 * EAN-13 from one row of luminance values (0 dark – 255 light), read either way round; null when
 * the row holds no readable code.
 * @param {ArrayLike<number>} row
 */
export function decodeEan13Row(row) {
  const values = Array.from(row);
  if (values.length < MODULES) return null;
  // Threshold between the dark and light levels of the middle of the row (glare at the edges).
  const middle = values.slice(Math.floor(values.length * 0.1), Math.ceil(values.length * 0.9));
  const sorted = [...middle].sort((a, b) => a - b);
  const dark = sorted[Math.floor(sorted.length * 0.05)];
  const light = sorted[Math.floor(sorted.length * 0.95)];
  if (light - dark < 40) return null;
  const threshold = (dark + light) / 2;
  const bits = values.map((value) => (value < threshold ? 1 : 0));
  for (const direction of [bits, [...bits].reverse()]) {
    const runs = runsOf(direction);
    for (let index = 0; index + RUNS <= runs.length; index++) {
      if (!runs[index].dark) continue;
      const code = decodeRuns(runs, index);
      if (code) return code;
    }
  }
  return null;
}

/**
 * EAN-13 from an RGBA image (canvas ImageData): several horizontal rows around the middle.
 * @param {{ data: ArrayLike<number>, width: number, height: number }} image
 */
export function decodeEan13Image(image) {
  const { data, width, height } = image;
  const rows = [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7];
  for (const share of rows) {
    const y = Math.min(height - 1, Math.round(height * share));
    const row = new Array(width);
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      row[x] = data[at] * 0.299 + data[at + 1] * 0.587 + data[at + 2] * 0.114;
    }
    const code = decodeEan13Row(row);
    if (code) return code;
  }
  return null;
}

/** The camera can be asked for: a secure page (HTTPS, localhost) with mediaDevices. */
export function cameraAvailable(win = globalThis) {
  return Boolean(win.isSecureContext && win.navigator?.mediaDevices?.getUserMedia);
}

/**
 * Starts the back camera in `video` and calls onCode(isbn13) for every book barcode it reads (the
 * same code again only after `repeatMs`). Returns { stop, native } — native: the browser's own detector.
 * @param {HTMLVideoElement} video
 * @param {(code: string) => void} onCode
 */
export async function startBarcodeScanner(video, onCode, { repeatMs = 4000, win = globalThis } = {}) {
  const stream = await win.navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  const release = () => {
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  try {
    await video.play();
  } catch (error) {
    // A camera that cannot play is turned off, not left running unseen.
    release();
    throw error;
  }
  let detector = null;
  try {
    // @ts-ignore BarcodeDetector is not in every browser (nor in TypeScript's DOM types)
    if (win.BarcodeDetector && (await win.BarcodeDetector.getSupportedFormats()).includes('ean_13'))
      // @ts-ignore
      detector = new win.BarcodeDetector({ formats: ['ean_13'] });
  } catch {
    detector = null;
  }
  const canvas = win.document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  let stopped = false;
  let last = { code: '', at: 0 };
  let candidate = '';
  const report = (code) => {
    // A frame read while the camera was being stopped says nothing any more.
    if (stopped) return;
    const now = Date.now();
    if (code === last.code && now - last.at < repeatMs) return;
    last = { code, at: now };
    onCode(code);
  };
  const tick = async () => {
    if (stopped) return;
    try {
      if (video.readyState >= 2) {
        if (detector) {
          const found = await detector.detect(video);
          const code = found.map((item) => String(item.rawValue)).find(isBookEan);
          if (code) report(code);
        } else if (context && video.videoWidth) {
          const width = Math.min(960, video.videoWidth);
          canvas.width = width;
          canvas.height = Math.round((video.videoHeight / video.videoWidth) * width);
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const code = decodeEan13Image(context.getImageData(0, 0, canvas.width, canvas.height));
          // Own decoder: the same code from two frames in a row.
          if (code && isBookEan(code) && code === candidate) report(code);
          candidate = code || '';
        }
      }
    } catch {
      /* a frame that cannot be read: try the next one */
    }
    if (!stopped) win.setTimeout(tick, detector ? 150 : 120);
  };
  void tick();
  return {
    native: Boolean(detector),
    stop() {
      stopped = true;
      release();
    },
  };
}
