// Protavia's Worker.
//
// Almost everything here is an ordinary static asset. One file is not: ONNX Runtime's WebAssembly
// binary is 25.93 MiB, and Cloudflare caps a single static asset at 25 MiB on every plan. Rather
// than drop WebGPU for a smaller runtime, this Worker streams that one path from the repository on
// GitHub and caches it at the edge. The browser only ever sees a same-origin URL, so the page needs
// no cross-origin fetch and no second domain.
//
// The repository is public, so no token is involved. GitHub serves raw files as `text/plain`, which
// `WebAssembly.instantiateStreaming` refuses, so the type is corrected here. That correction is the
// reason this is a Worker and not a redirect.

/** Paths streamed from GitHub. Everything else is served from the asset store. */
const FROM_GITHUB = '/vendor/onnxruntime-web/';

const RAW_BASE = 'https://raw.githubusercontent.com/NakliTechie/protavia/main/';

const CONTENT_TYPES = {
  '.wasm': 'application/wasm',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function contentTypeFor(pathname) {
  const dot = pathname.lastIndexOf('.');
  return (dot === -1 ? null : CONTENT_TYPES[pathname.slice(dot)]) || 'application/octet-stream';
}

async function serveFromGitHub(url, ctx) {
  const cache = caches.default;
  // These paths carry a pinned version (1.24.3), so a cached copy can never go stale.
  const cacheKey = new Request(url.toString(), { method: 'GET' });

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const path = url.pathname.replace(/^\//, '');
  const got = await fetch(RAW_BASE + path, {
    headers: { 'user-agent': 'protavia-worker' },
  });

  if (!got.ok) {
    // A failure is never cached: a bad deploy would otherwise stick for a year.
    return new Response(`Could not read ${path} from the repository (${got.status}).`, {
      status: got.status === 404 ? 404 : 502,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const response = new Response(got.body, {
    status: 200,
    headers: {
      'content-type': contentTypeFor(url.pathname),
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      // Inside NakliOS the page is served from naklios.dev, which is Cloudflare Pages and so has
      // the same 25 MiB cap. Its copy of the app cannot carry this file either, and loads it from
      // here instead. These are public third-party MIT binaries fetched without credentials, so a
      // wildcard costs nothing: there is no private data or session behind this origin to protect.
      'access-control-allow-origin': '*',
      // Says where the bytes came from, so a wrong or stale file is traceable from the browser.
      'x-protavia-source': 'github:NakliTechie/protavia@main',
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith(FROM_GITHUB)) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed.', { status: 405 });
      }
      return serveFromGitHub(url, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};
