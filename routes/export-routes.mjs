// @ts-check
// CSV downloads (read only): deals and scan phrases.
import { dealsCsv, phrasesCsv } from '../exports.mjs';

/** @param {any} response @param {string} name @param {string} body */
function download(response, name, body) {
  response.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${name}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

export function addExportRoutes(routes) {
  routes
    .add('GET', '/api/export/deals.csv', async ({ catalog, response }) =>
      download(response, 'bookflip-okazje.csv', dealsCsv(catalog.repository)),
    )
    .add('GET', '/api/export/phrases.csv', async ({ catalog, response }) =>
      download(response, 'bookflip-frazy.csv', phrasesCsv(catalog.repository)),
    );
}
