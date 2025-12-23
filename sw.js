const CACHE = "kindling-cache-v1";
const ASSETS = [
"./",
"./index.html",
"./styles.css",
"./app.js",
"./data.js",
"./manifest.webmanifest",
"./icons/icon-192.png",
"./icons/icon-512.png",
"./icons/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
event.waitUntil(
caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(self.skipWaiting())
);
});

self.addEventListener("activate", (event) => {
event.waitUntil(
caches.keys().then(keys => Promise.all(keys.map(k => k === CACHE ? null : caches.delete(k))))
);
self.clients.claim();
});

self.addEventListener("fetch", (event) => {
event.respondWith(
caches.match(event.request).then(cached => cached || fetch(event.request).then(res => {
const copy = res.clone();
caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(()=>{});
return res;
}).catch(() => cached))
);
});