// Shared HTTP JSON request helper.
export async function json(url, options, fetcher = fetch) {
  const response = await fetcher(url, options);
  // A body that is not JSON (an empty reply, a proxy error page) still gets its HTTP code.
  let parsed = true;
  const data = await response.json().catch(() => ((parsed = false), null));
  if (!response.ok) throw Error(data?.error || `HTTP_${response.status}`);
  // JSON `null` is a valid reply (a route with nothing to return); only a body that is not JSON fails.
  if (!parsed) throw Error('INVALID_RESPONSE');
  return data;
}
