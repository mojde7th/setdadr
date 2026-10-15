// Vercel serverless Dilara TTS — phone browsers cannot open Edge WS (non-Edg UA = 403).
const { randomUUID } = require("crypto");
const path = require("path");
const vm = require("vm");
const fs = require("fs");
const WebSocket = require("ws");

const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROME = "143.0.3650.75";
const VOICE_FA = "fa-IR-DilaraNeural";
const VOICE_EN = "en-US-JennyNeural";

function loadGec() {
  const code = fs.readFileSync(path.join(__dirname, "..", "edge-gec.js"), "utf8");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.SetdadrEdgeGec;
}

let gecApi = null;
function getGec() {
  if (!gecApi) gecApi = loadGec();
  return gecApi.generateSecMsGecV2();
}
function gecVer() {
  if (!gecApi) gecApi = loadGec();
  return gecApi.SEC_MS_GEC_VERSION || "2-" + CHROME;
}

function synthesize(text, voice) {
  return new Promise((resolve, reject) => {
    const gec = getGec();
    const conn = randomUUID().replace(/-/g, "").toUpperCase();
    const url =
      "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1" +
      "?TrustedClientToken=" +
      TOKEN +
      "&ConnectionId=" +
      conn +
      "&Sec-MS-GEC=" +
      encodeURIComponent(gec) +
      "&Sec-MS-GEC-Version=" +
      encodeURIComponent(gecVer());
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/" +
      CHROME +
      " Chrome/" +
      CHROME +
      " Safari/" +
      CHROME +
      " Edg/" +
      CHROME;
    const ws = new WebSocket(url, {
      headers: {
        Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "User-Agent": ua,
      },
    });
    const chunks = [];
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      if (chunks.length) resolve(Buffer.concat(chunks));
      else reject(new Error("timeout"));
    }, 12000);
    ws.on("open", () => {
      const cfg =
        '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n';
      ws.send(
        "X-Timestamp:Z\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n" +
          cfg
      );
      const lang = /^en/i.test(voice) ? "en-US" : "fa-IR";
      const safe = String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
      const ssml =
        "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='" +
        lang +
        "'><voice name='" +
        voice +
        "'><prosody pitch='+0Hz' rate='+8%' volume='+0%'>" +
        safe +
        "</prosody></voice></speak>";
      ws.send(
        "X-RequestId:" +
          randomUUID().replace(/-/g, "").toUpperCase() +
          "\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:Z\r\nPath:ssml\r\n\r\n" +
          ssml
      );
    });
    ws.on("message", (data, isBinary) => {
      if (!isBinary) {
        const s = data.toString();
        if (s.indexOf("Path:turn.end") !== -1) {
          clearTimeout(timer);
          try {
            ws.close();
          } catch {}
          resolve(Buffer.concat(chunks));
        }
        return;
      }
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (buf.length < 2) return;
      const hl = (buf[0] << 8) | buf[1];
      const audio = buf.subarray(hl + 2);
      if (audio.length) chunks.push(audio);
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.url === "/health" || req.url === "/api/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain");
    return res.end("ok");
  }
  const q = req.query || {};
  const text = String(q.t || q.q || q.text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
  if (!text) {
    res.statusCode = 400;
    return res.end("missing t");
  }
  const hasFa = /[\u0600-\u06FF]/.test(text);
  const voice = hasFa ? VOICE_FA : VOICE_EN;
  try {
    const buf = await synthesize(text, voice);
    if (!buf || buf.length < 80) {
      res.statusCode = 502;
      return res.end("empty");
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.end(buf);
  } catch (e) {
    res.statusCode = 500;
    return res.end(String(e && e.message ? e.message : e));
  }
};
