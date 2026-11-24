import { spawn } from 'node:child_process';
import { networkFailures } from './network-failures.mjs';

const flags = [
  '--import',
  new URL('./isolated-runtime.mjs', import.meta.url).href,
  '--test',
  '--test-timeout=30000',
];
const RETRIES = 2;

/** Runs the tests, forwards the output and returns { code, output }. */
function run(files) {
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(process.execPath, [...flags, ...files], {
      stdio: ['inherit', 'pipe', 'pipe'],
      windowsHide: true,
    });
    for (const [stream, sink] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ])
      stream.on('data', (chunk) => {
        output += chunk;
        sink.write(chunk);
      });
    child.on('error', (error) => {
      console.error(error.message);
      resolve({ code: 1, output });
    });
    child.on('exit', (code) => resolve({ code: code ?? 1, output }));
  });
}

let { code, output } = await run(process.argv.slice(2));
// A network error of the machine (the pool of local ports is full) is retried for the files that
// failed with it, only when nothing else failed.
for (let attempt = 1; code !== 0 && attempt <= RETRIES; attempt++) {
  const files = networkFailures(output);
  if (!files.length) break;
  console.error(
    `\nrun-tests: network error of the machine in ${files.join(', ')}; trying again (${attempt}/${RETRIES}).`,
  );
  ({ code, output } = await run(files));
}
process.exitCode = code;
