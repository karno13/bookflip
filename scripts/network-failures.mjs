// Errors of the machine, not of the code: an exhausted pool of local ports or a refused connection.
export const NETWORK_ERROR =
  /EADDRINUSE|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EADDRNOTAVAIL|fetch failed|test timed out after/;

/**
 * The failed test files when EVERY failure in the output is a network error of the machine, else []:
 * a real failure in the same run must never be hidden behind the retry of the others.
 * @param {string} output output of `node --test`
 */
export function networkFailures(output) {
  const failed = new Set();
  let onlyNetwork = true;
  let any = false;
  for (const block of output.split(/^(?=test at )/m)) {
    if (!block.startsWith('test at ') || !block.includes('✖')) continue;
    any = true;
    const file = block.match(/^test at (\S+?\.test\.mjs):\d+:\d+/)?.[1];
    if (!file || !NETWORK_ERROR.test(block)) onlyNetwork = false;
    else failed.add(file.replaceAll('\\', '/'));
  }
  return any && onlyNetwork ? [...failed] : [];
}
