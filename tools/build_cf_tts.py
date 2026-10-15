# -*- coding: utf-8 -*-
"""Build Cloudflare Worker that speaks Dilara via Edge WS (fetch upgrade)."""
from pathlib import Path

root = Path(r"D:\tech-lab\setdadr")
gec = (root / "edge-gec.js").read_text(encoding="utf-8")

handler = r"""
const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const VOICE_FA = "fa-IR-DilaraNeural";
const VOICE_EN = "en-US-JennyNeural";
const CHROME = "143.0.3650.75";
const CHROME_MAJOR = "143";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}

function uuidHex() {
  return crypto.randomUUID().replace(/-/g, "").toUpperCase();
}

function escapeSsml(t) {
  return String(t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fullVoiceName(shortName) {
  const m = /^([a-z]{2,})-([A-Z]{2,})-(.+Neural)$/.exec(String(shortName || ""));
  if (!m) return shortName;
  return (
    "Microsoft Server Speech Text to Speech Voice (" +
    m[1] +
    "-" +
    m[2] +
    ", " +
    m[3] +
    ")"
  );
}

function concat(chunks) {
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function parseBinaryFrame(buf) {
  if (buf.length < 2) return { path: "", body: new Uint8Array(0) };
  const hl = (buf[0] << 8) | buf[1];
  const headerBytes = buf.slice(2, 2 + hl);
  const body = buf.slice(2 + hl);
  let headerText = "";
  try {
    headerText = new TextDecoder().decode(headerBytes);
  } catch {
    headerText = "";
  }
  const headers = {};
  for (const line of headerText.split("\r\n")) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  return { path: headers.Path || "", body, headers };
}

async function synthesize(text, voiceShort) {
  const gecApi = globalThis.SetdadrEdgeGec;
  if (!gecApi || typeof gecApi.generateSecMsGecV2 !== "function") {
    throw new Error("gec missing");
  }
  const gec = gecApi.generateSecMsGecV2();
  const ver = gecApi.SEC_MS_GEC_VERSION || "2-" + CHROME;
  const conn = uuidHex();
  const url =
    "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1" +
    "?TrustedClientToken=" +
    TOKEN +
    "&ConnectionId=" +
    conn +
    "&Sec-MS-GEC=" +
    encodeURIComponent(gec) +
    "&Sec-MS-GEC-Version=" +
    encodeURIComponent(ver);

  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" +
    CHROME_MAJOR +
    ".0.0.0 Safari/537.36 Edg/" +
    CHROME_MAJOR +
    ".0.0.0";

  const response = await fetch(url, {
    headers: {
      "User-Agent": ua,
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      "Sec-WebSocket-Version": "13",
      Upgrade: "websocket",
      Cookie: "muid=" + uuidHex() + ";",
    },
  });

  const ws = response.webSocket;
  if (response.status !== 101 || !ws) {
    throw new Error("upgrade " + response.status);
  }

  const voice = fullVoiceName(voiceShort);
  const chunks = [];

  return await new Promise((resolve, reject) => {
    let settled = false;
    const done = (err, data) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {}
      if (err) reject(err);
      else resolve(data);
    };
    const timer = setTimeout(() => {
      if (chunks.length) done(null, concat(chunks));
      else done(new Error("timeout"));
    }, 18000);

    ws.addEventListener("message", (ev) => {
      const data = ev.data;
      if (typeof data === "string") {
        if (data.indexOf("Path:turn.end") !== -1) {
          clearTimeout(timer);
          if (!chunks.length) done(new Error("no audio"));
          else done(null, concat(chunks));
        }
        return;
      }
      try {
        const buf =
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : data instanceof Uint8Array
              ? data
              : new Uint8Array(0);
        const frame = parseBinaryFrame(buf);
        if (frame.path === "audio" && frame.body && frame.body.length) {
          chunks.push(frame.body);
        }
      } catch {}
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      done(new Error("ws error"));
    });
    ws.addEventListener("close", () => {
      clearTimeout(timer);
      if (!settled) {
        if (chunks.length) done(null, concat(chunks));
        else done(new Error("closed"));
      }
    });

    ws.accept();
    const cfg =
      '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n';
    ws.send(
      "X-Timestamp:Z\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n" +
        cfg
    );
    const lang = /^en/i.test(voiceShort) ? "en-US" : "fa-IR";
    const ssml =
      "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='" +
      lang +
      "'><voice name='" +
      voice +
      "'><prosody pitch='+0Hz' rate='+8%' volume='+0%'>" +
      escapeSsml(text) +
      "</prosody></voice></speak>";
    ws.send(
      "X-RequestId:" +
        uuidHex() +
        "\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:Z\r\nPath:ssml\r\n\r\n" +
        ssml
    );
  });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }
    const url = new URL(request.url);
    if (url.pathname === "/health" || url.pathname === "/") {
      return new Response("ok", {
        headers: { ...cors(), "Content-Type": "text/plain" },
      });
    }
    if (url.pathname !== "/tts") {
      return new Response("not found", { status: 404, headers: cors() });
    }
    let text = (url.searchParams.get("t") || url.searchParams.get("q") || "").trim();
    let voiceOverride = url.searchParams.get("voice") || "";
    if ((!text || request.method === "POST") && request.method === "POST") {
      try {
        const j = await request.json();
        if (!text) text = String(j.text || j.t || "").trim();
        if (!voiceOverride && j.voice) voiceOverride = String(j.voice);
      } catch {}
    }
    text = text.replace(/\s+/g, " ").slice(0, 400);
    if (!text) {
      return new Response("missing t", { status: 400, headers: cors() });
    }
    const voice =
      voiceOverride ||
      (/[\u0600-\u06FF]/.test(text) ? VOICE_FA : VOICE_EN);
    try {
      const buf = await synthesize(text, voice);
      if (!buf || buf.length < 80) {
        return new Response("empty", { status: 502, headers: cors() });
      }
      return new Response(buf, {
        headers: {
          ...cors(),
          "Content-Type": "audio/mpeg",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch (e) {
      return new Response(String(e && e.message ? e.message : e), {
        status: 500,
        headers: cors(),
      });
    }
  },
};
"""

out = gec + "\n" + handler
path = root / "cf-tts" / "worker.js"
path.write_text(out, encoding="utf-8")
print("wrote", path, "bytes", len(out))
