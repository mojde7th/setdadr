const CACHE = "setdadr-v110";
const ASSETS = [
  "./",
  "./index.html",
  "./tts-endpoint.js",
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
  "./voice/dyn/0211c960f65410c4.mp3",
  "./voice/dyn/06e61ea6eed1702d.mp3",
  "./voice/dyn/0c1ac9c9ef30833d.mp3",
  "./voice/dyn/10e7523e1415a3e7.mp3",
  "./voice/dyn/11b6815edebc0300.mp3",
  "./voice/dyn/214170079efde281.mp3",
  "./voice/dyn/26dbcf0da8bac190.mp3",
  "./voice/dyn/2fa4f95b81a4c0a2.mp3",
  "./voice/dyn/43564d3cda152851.mp3",
  "./voice/dyn/575955b662b62138.mp3",
  "./voice/dyn/584ca2d71c32b33b.mp3",
  "./voice/dyn/5ae8a327caf450b4.mp3",
  "./voice/dyn/5cf7ff791d693ee5.mp3",
  "./voice/dyn/6a87c09459170d72.mp3",
  "./voice/dyn/6c9c735fbbc8a9f6.mp3",
  "./voice/dyn/6e79483b6ade7003.mp3",
  "./voice/dyn/abd4db93f183679f.mp3",
  "./voice/dyn/b6ba8e4cfb22905f.mp3",
  "./voice/dyn/b75256b9e0047691.mp3",
  "./voice/dyn/b7c60dbe12ae9067.mp3",
  "./voice/dyn/bf3245ade528b7a3.mp3",
  "./voice/dyn/c985d5cbf5e0e5bf.mp3",
  "./voice/dyn/d6aef3fae7615ac3.mp3",
  "./voice/dyn/e0f4c3a57632a158.mp3",
  "./voice/dyn/e1009c2c8bd05248.mp3",
  "./voice/dyn/e8cdc05b346aa0d4.mp3",
  "./voice/dyn/f7402b537632cb30.mp3",
  "./voice/dyn/f754be895d799ee2.mp3",
  "./voice/dyn/f838ecdbb858f272.mp3",
  "./voice/dyn/f844f4d4f48025a1.mp3",
  "./voice/phrase-next.mp3",
  "./voice/silence.wav",
  "./voice/move-air-squat.mp3",
  "./voice/move-battle.mp3",
  "./voice/move-bench.mp3",
  "./voice/move-bent-row.mp3",
  "./voice/move-bicep.mp3",
  "./voice/move-box-jump.mp3",
  "./voice/move-burpee.mp3",
  "./voice/move-butt-kicks.mp3",
  "./voice/move-calf.mp3",
  "./voice/move-crunch.mp3",
  "./voice/move-deadlift.mp3",
  "./voice/move-divar-space.mp3",
  "./voice/move-divar.mp3",
  "./voice/move-farmer.mp3",
  "./voice/move-glute-bridge.mp3",
  "./voice/move-goblet-squat.mp3",
  "./voice/move-high-knees.mp3",
  "./voice/move-hip-thrust.mp3",
  "./voice/move-hollow.mp3",
  "./voice/move-jj.mp3",
  "./voice/move-jump.mp3",
  "./voice/move-jump-rope.mp3",
  "./voice/move-jump-squat.mp3",
  "./voice/move-kb-swing.mp3",
  "./voice/move-lateral.mp3",
  "./voice/move-leg-raise.mp3",
  "./voice/move-lunge.mp3",
  "./voice/move-lange.mp3",
  "./voice/move-lunges.mp3",
  "./voice/move-mc.mp3",
  "./voice/move-plank.mp3",
  "./voice/move-pullup.mp3",
  "./voice/move-pushup.mp3",
  "./voice/move-rdl-short.mp3",
  "./voice/move-rdl.mp3",
  "./voice/move-row.mp3",
  "./voice/move-russian.mp3",
  "./voice/move-shoulder.mp3",
  "./voice/move-side-plank.mp3",
  "./voice/move-situp.mp3",
  "./voice/move-squat.mp3",
  "./voice/move-stretch.mp3",
  "./voice/move-sumo.mp3",
  "./voice/move-swim.mp3",
  "./voice/move-tricep.mp3",
  "./voice/move-wall-sit.mp3",
  "./voice/move-yoga.mp3",
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

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const path = url.pathname;
  const isJS = path.endsWith(".js");
  const isCSS = path.endsWith(".css");
  const isNav = e.request.mode === "navigate" || path.endsWith("/") || path.endsWith(".html");

  // Ã˜Â´Ã™â€ž Ã˜Â§Ã™Â¾: Ã˜Â§Ã™Ë†Ã™â€ž Ã˜Â´Ã˜Â¨ÃšÂ©Ã™â€¡Ã˜â€º Ã™ÂÃ™â€šÃ˜Â· ÃšÂ©Ã˜Â´ Ã™â€ Ã˜Â³Ã˜Â®Ã™â€¡Ã™â€ Ã™ÂÃ˜Â¹Ã™â€žÃ›Å’ (Ã˜Â¨Ã˜Â¯Ã™Ë†Ã™â€  ignoreSearch Ã˜ÂªÃ˜Â§ Ã™ÂÃ˜Â§Ã›Å’Ã™â€ž Ã™â€šÃ˜Â¯Ã›Å’Ã™â€¦Ã›Å’ Ã›Â¶Ã›Â¹ Ã˜Â¨Ã˜Â±Ã™â€ ÃšÂ¯Ã˜Â±Ã˜Â¯Ã˜Â¯)
  if (isNav || isJS || isCSS) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then((res) => {
          if (!res || !res.ok) throw new Error("net");
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.open(CACHE).then((c) =>
            c.match(e.request).then((hit) => {
              if (hit) return hit;
              if (isJS && path.endsWith("app.js")) return c.match("./app.js");
              if (isCSS && path.endsWith("styles.css")) return c.match("./styles.css");
              if (isNav) return c.match("./index.html");
              return undefined;
            })
          )
        )
    );
    return;
  }

  e.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const copy = res.clone();
            c.put(e.request, copy).catch(() => {});
            return res;
          })
      )
    )
  );
});

