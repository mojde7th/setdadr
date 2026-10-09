/**
 * Autotest: unlock with click, start plan, force auto-advance (no skip click),
 * assert speakPhase hard-name path sets lastAutoSpeak.ok.
 */
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function serve() {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      let path = decodeURIComponent((req.url || "/").split("?")[0]);
      if (path === "/") path = "/index.html";
      const file = join(root, path.replace(/^\//, ""));
      if (!file.startsWith(root) || !existsSync(file)) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      res.end(readFileSync(file));
    });
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      resolve({ srv, url: `http://127.0.0.1:${port}/` });
    });
  });
}

async function waitTest(page) {
  await page.waitForFunction(() => !!(window.__setdadrTest && window.__setdadrTest.ver), null, {
    timeout: 20000
  });
}

async function main() {
  const { srv, url } = await serve();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    // جلوگیری از ناوبری سرویس‌ورکر در تست
    if (navigator.serviceWorker) {
      try {
        navigator.serviceWorker.register = () => Promise.reject(new Error("sw-disabled"));
      } catch {}
    }
  });
  const page = await context.newPage();
  const logs = [];
  page.on("console", (m) => logs.push(m.type() + ": " + m.text()));
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message));

  const seed = {
    plans: [
      {
        id: "test-auto-1",
        title: "تست خودکار",
        rounds: 2,
        restSet: 8,
        restMove: 0,
        circuit: [
          { name: "دیوارنشینی آزمایشی", work: 6 },
          { name: "شنا", work: 6 }
        ],
        createdAt: Date.now()
      }
    ],
    moves: []
  };
  await context.addInitScript((st) => {
    localStorage.setItem("setdadr-v2", JSON.stringify(st));
  }, seed);

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitTest(page);
  console.log("APP_VER", await page.evaluate(() => window.__setdadrTest.ver()));

  // User gesture unlock + start
  await page.mouse.click(20, 20);
  await page.evaluate(() => {
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
  const started = await page.evaluate(() => window.__setdadrTest.startFirstPlan());
  console.log("started", started);
  await page.waitForFunction(() => window.__setdadrTest.hasRun(), null, { timeout: 5000 });
  await page.waitForTimeout(1000);

  // Prewarm hard blobs under gesture
  const warm = await page.evaluate(async () => {
    const a = await window.__setdadrTest.speakHard("دیوارنشینی آزمایشی");
    const b = await window.__setdadrTest.speakHard("شنا");
    return { a, b, state: window.__setdadrTest.audioState() };
  });
  console.log("warm", JSON.stringify(warm));

  const auto1 = await page.evaluate(async () => {
    window.__setdadrTest.lastAutoSpeak = null;
    window.__setdadrTest.autoAdvance();
    await new Promise((r) => setTimeout(r, 4000));
    return {
      lastAutoSpeak: window.__setdadrTest.lastAutoSpeak,
      state: window.__setdadrTest.audioState(),
      hasRun: window.__setdadrTest.hasRun()
    };
  });
  console.log("autoAdvance#1", JSON.stringify(auto1, null, 2));

  const auto2 = await page.evaluate(async () => {
    window.__setdadrTest.lastAutoSpeak = null;
    window.__setdadrTest.autoAdvance();
    await new Promise((r) => setTimeout(r, 4000));
    return {
      lastAutoSpeak: window.__setdadrTest.lastAutoSpeak,
      state: window.__setdadrTest.audioState(),
      hasRun: window.__setdadrTest.hasRun()
    };
  });
  console.log("autoAdvance#2", JSON.stringify(auto2, null, 2));

  const ok =
    (auto1.lastAutoSpeak && auto1.lastAutoSpeak.ok) ||
    (auto2.lastAutoSpeak && auto2.lastAutoSpeak.ok);

  await browser.close();
  srv.close();

  if (!ok) {
    console.error("FAIL: speakPhase auto path did not report lastAutoSpeak.ok");
    console.error("console:", logs.slice(-40).join("\n"));
    process.exit(1);
  }
  console.log("PASS: auto speakPhase reported ok after autoAdvance");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
