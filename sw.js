const CACHE = "setdadr-v50";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-180.png",
  "./voice/count-10.mp3",
  "./voice/count-20.mp3",
  "./voice/count-30.mp3",
  "./voice/count-60.mp3",
  "./voice/count-60min.mp3",
  "./voice/done-1.mp3",
  "./voice/done-10.mp3",
  "./voice/done-11.mp3",
  "./voice/done-12.mp3",
  "./voice/done-13.mp3",
  "./voice/done-14.mp3",
  "./voice/done-15.mp3",
  "./voice/done-2.mp3",
  "./voice/done-3.mp3",
  "./voice/done-4.mp3",
  "./voice/done-5.mp3",
  "./voice/done-6.mp3",
  "./voice/done-7.mp3",
  "./voice/done-8.mp3",
  "./voice/done-9.mp3",
  "./voice/phase-10.mp3",
  "./voice/phase-100.mp3",
  "./voice/phase-105.mp3",
  "./voice/phase-110.mp3",
  "./voice/phase-115.mp3",
  "./voice/phase-120.mp3",
  "./voice/phase-15.mp3",
  "./voice/phase-150.mp3",
  "./voice/phase-180.mp3",
  "./voice/phase-20.mp3",
  "./voice/phase-240.mp3",
  "./voice/phase-25.mp3",
  "./voice/phase-30.mp3",
  "./voice/phase-300.mp3",
  "./voice/phase-35.mp3",
  "./voice/phase-40.mp3",
  "./voice/phase-45.mp3",
  "./voice/phase-5.mp3",
  "./voice/phase-50.mp3",
  "./voice/phase-55.mp3",
  "./voice/phase-60.mp3",
  "./voice/phase-600.mp3",
  "./voice/phase-65.mp3",
  "./voice/phase-70.mp3",
  "./voice/phase-75.mp3",
  "./voice/phase-80.mp3",
  "./voice/phase-85.mp3",
  "./voice/phase-90.mp3",
  "./voice/phase-95.mp3",
  "./voice/cheer-ali.mp3",
  "./voice/went-12-of-20.mp3",
  "./voice/went-16-of-25.mp3",
  "./voice/went-19-of-30.mp3",
  "./voice/went-22-of-35.mp3",
  "./voice/went-25-of-40.mp3",
  "./voice/went-28-of-45.mp3",
  "./voice/went-31-of-50.mp3",
  "./voice/went-38-of-60.mp3",
  "./voice/went-47-of-75.mp3",
  "./voice/went-56-of-90.mp3",
  "./voice/went-75-of-120.mp3",
  "./voice/went-5.mp3",
  "./voice/went-8.mp3",
  "./voice/went-10.mp3",
  "./voice/went-12.mp3",
  "./voice/went-15.mp3",
  "./voice/went-16.mp3",
  "./voice/went-18.mp3",
  "./voice/went-20.mp3",
  "./voice/went-24.mp3",
  "./voice/went-25.mp3",
  "./voice/went-30.mp3",
  "./voice/went-32.mp3",
  "./voice/went-35.mp3",
  "./voice/went-40.mp3",
  "./voice/went-45.mp3",
  "./voice/went-50.mp3",
  "./voice/went-60.mp3",
  "./voice/went-75.mp3",
  "./voice/went-80.mp3",
  "./voice/went-90.mp3",
  "./voice/went-120.mp3"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const path = url.pathname;
  const isJS = path.endsWith(".js");
  const isCSS = path.endsWith(".css");
  const isNav = e.request.mode === "navigate" || path.endsWith(".html");

  // شل اپ: اول شبکه، بعد کش؛ هرگز HTML را جای JS برنگردان
  if (isNav || isJS || isCSS) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (!res || !res.ok) throw new Error("net");
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(e.request, { ignoreSearch: true }).then((hit) => {
            if (hit) return hit;
            if (isJS) return caches.match("./app.js");
            if (isCSS) return caches.match("./styles.css");
            if (isNav) return caches.match("./index.html");
            return undefined;
          })
        )
    );
    return;
  }

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
    )
  );
});
