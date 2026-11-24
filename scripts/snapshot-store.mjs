// Storage of a css-snapshot capture: newline-delimited JSON streamed through gzip, so the size is
// bounded by one entry, not by one string (a capture on thousands of works exceeds V8's string limit).
// Files: states.ndjson.gz (one `[id, list]` per line), styles.ndjson.gz (one `[hash, text]` per line).
// The older single-file format (states.json.gz, styles.json.gz) is still read.
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createGunzip, createGzip, gunzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';

/** Writes the [key, value] entries, one JSON line each. */
export async function writeEntries(file, entries) {
  const gzip = createGzip();
  const sink = createWriteStream(file);
  gzip.pipe(sink);
  for (const entry of entries) {
    if (!gzip.write(JSON.stringify(entry) + '\n')) await once(gzip, 'drain');
  }
  gzip.end();
  await finished(sink);
}

/** Reads a file written by writeEntries into an object. */
export async function readEntries(file) {
  const result = {};
  const lines = createInterface({
    input: createReadStream(file).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line) continue;
    const [key, value] = JSON.parse(line);
    result[key] = value;
  }
  return result;
}

/** Reads `<dir>/<name>.ndjson.gz`, or the old `<dir>/<name>.json.gz` when that is all there is. */
export async function readPart(dir, name) {
  const file = `${dir}/${name}.ndjson.gz`;
  if (existsSync(file)) return readEntries(file);
  return JSON.parse(gunzipSync(await readFile(`${dir}/${name}.json.gz`)).toString());
}
