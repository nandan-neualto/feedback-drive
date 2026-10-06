/* Offline app shell only. Responses, photos, sessions and auth are never cached. */
const VERSION = "feedback-drive-v3";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const MAX_ASSETS = 80;
const AUTH_PATHS = new Set(["/signin-with-chatgpt", "/signout-with-chatgpt", "/callback"]);
const OFFLINE = "<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Feedback Drive — Offline</title><style>body{margin:0;background:#090b0e;color:#f1f2f4;font:18px system-ui;display:grid;min-height:100vh;place-content:center;padding:32px;max-width:540px;margin:auto}h1{font-size:32px}p{line-height:1.65}a{color:inherit}</style><h1>You're offline</h1><p>Connect to open Feedback Drive. Feedback already saved on this device will be available when you return.</p><a href='/'>Try again</a></html>";

function isImmutableAsset(url) {
  return url.origin === self.location.origin && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/_next/static/")) && /[.-][A-Za-z0-9_-]{8,}\.(js|css)$/.test(url.pathname) && !url.search;
}

async function cacheShell() {
  // Omit cookies and authenticated headers: one public shell is shared by all users.
  const response = await fetch(new Request(new URL("/", self.location.origin), { credentials: "omit", cache: "no-store", headers: { Accept: "text/html" } }));
  const responseUrl = new URL(response.url || self.location.origin);
  if (response.status !== 200 || response.redirected || responseUrl.origin !== self.location.origin || responseUrl.pathname !== "/" || !response.headers.get("content-type")?.includes("text/html")) return;
  const html = await response.clone().text();
  const cache = await caches.open(SHELL_CACHE);
  await cache.put("/", response);
  // Warm the shell's essential hashed bundles for an offline revisit after first load.
  const assets = new Set();
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/gi)) {
    const url = new URL(match[1], self.location.origin);
    if (isImmutableAsset(url)) assets.add(url.href);
  }
  const urls = Array.from(assets).slice(0, MAX_ASSETS);
  for (let index = 0; index < urls.length; index += 4) await Promise.allSettled(urls.slice(index, index + 4).map((url) => immutableAsset(new Request(url, { credentials: "omit" }))));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheShell().catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => (key.startsWith("survey-drive-") || key.startsWith("feedback-drive-")) && key !== SHELL_CACHE && key !== ASSET_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function navigation(event) {
  try {
    const response = await fetch(event.request);
    if (response.status === 200 && !response.redirected && response.headers.get("content-type")?.includes("text/html")) event.waitUntil(cacheShell().catch(() => {}));
    return response;
  } catch {
    const cached = await caches.match("/", { cacheName: SHELL_CACHE });
    return cached || new Response(OFFLINE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
}

async function immutableAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.status === 200 && !response.redirected && response.type !== "opaque") {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    if (keys.length > MAX_ASSETS) await Promise.all(keys.slice(0, keys.length - MAX_ASSETS).map((key) => cache.delete(key)));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === "/api" || url.pathname.startsWith("/api/") || AUTH_PATHS.has(url.pathname.replace(/\/$/, ""))) return;
  // Only the static root page participates; no RSC, query-specific or admin data.
  if (request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(navigation(event));
    return;
  }
  if (isImmutableAsset(url)) event.respondWith(immutableAsset(request));
});
