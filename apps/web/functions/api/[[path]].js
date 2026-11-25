// Proxy API requests through the Pages domain so auth cookies are first-party.
// Set API_ORIGIN in the Pages project (wrangler.toml [vars] or dashboard) to
// point at your own Worker deployment.
const DEFAULT_API_ORIGIN = "https://ksecrets-api.xpat.workers.dev";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const apiOrigin = context.env.API_ORIGIN || DEFAULT_API_ORIGIN;
  const target = new URL(url.pathname + url.search, apiOrigin);
  return fetch(new Request(target, context.request));
}
