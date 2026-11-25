// Proxy API requests through the Pages domain so auth cookies are first-party
// (SameSite=None cross-site cookies are unreliable, same-origin ones just work).
//
// The API origin is resolved as:
//   1. API_ORIGIN env var on the Pages project, if set and it survives a deploy
//   2. DEFAULT_API_ORIGIN below — EDIT THIS when self-hosting to your own
//      Worker URL, e.g. https://ksecrets-api.<your-subdomain>.workers.dev
const DEFAULT_API_ORIGIN = "https://ksecrets-api.xpat.workers.dev";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const apiOrigin = context.env.API_ORIGIN || DEFAULT_API_ORIGIN;
  const target = new URL(url.pathname + url.search, apiOrigin);
  return fetch(new Request(target, context.request));
}
