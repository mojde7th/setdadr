// Auto-built BigInt-safe GEC v2 matching edge-tts
(function (global) {
  const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
  const WIN_EPOCH = 11644473600;
  const S_TO_NS = 1000000000.0;
  const CHROMIUM_FULL_VERSION = "143.0.3650.75";
  const SEC_MS_GEC_VERSION = "2-143.0.3650.75";
  const SHA256_INITIAL = [0x6A09E667,0xBB67AE85,0x3C6EF372,0xA54FF53A,0x510E527F,0x9B05688C,0x1F83D9AB,0x5BE0CD19];
  const SHA256_STATE = [0xFD9FBEA2,0x91243CE7,0xBE499094,0xCD2E1E0A,0x6C006F49,0x04BD35AB,0xFEB0A7E4,0x03EFFBD2];
  const SHA256_SCHEDULE = [0xEB24BF9E,0x1558691F,0xA0C09EE2,0x0CFA32BA,0xA622EE8C,0xD1DD9491,0xC0DD25A0,0xF9E70AB6,0xF0C31573,0x7058CE4E,0x7188E606,0x00E5AB33,0xD258B060,0x72766564];
  const SHA256_ROUND_CONSTANTS = [0x428A2F98,0x71374491,0xB5C0FBCF,0xE9B5DBA5,0x3956C25B,0x59F111F1,0x923F82A4,0xAB1C5ED5,0xD807AA98,0x12835B01,0x243185BE,0x550C7DC3,0x72BE5D74,0x80DEB1FE,0x9BDC06A7,0xC19BF174,0xE49B69C1,0xEFBE4786,0x0FC19DC6,0x240CA1CC,0x2DE92C6F,0x4A7484AA,0x5CB0A9DC,0x76F988DA,0x983E5152,0xA831C66D,0xB00327C8,0xBF597FC7,0xC6E00BF3,0xD5A79147,0x06CA6351,0x14292967,0x27B70A85,0x2E1B2138,0x4D2C6DFC,0x53380D13,0x650A7354,0x766A0ABB,0x81C2C92E,0x92722C85,0xA2BFE8A1,0xA81A664B,0xC24B8B70,0xC76C51A3,0xD192E819,0xD6990624,0xF40E3585,0x106AA070,0x19A4C116,0x1E376C08,0x2748774C,0x34B0BCB5,0x391C0CB3,0x4ED8AA4A,0x5B9CCA4F,0x682E6FF3,0x748F82EE,0x78A5636F,0x84C87814,0x8CC70208,0x90BEFFFA,0xA4506CEB,0xBEF9A3F7,0xC67178F2];
  const SHA256_ADJUSTMENT = 0xC9DC06A7;
  const SHA256_SIGMA0_ADJUSTMENT = 0x059C0B80;
  const SHA256_SIGMA1_ADJUSTMENT = 0x000B92C0;
  const SHA256_BLOCK_CONSTANTS = SHA256_ROUND_CONSTANTS.slice(0,14).concat([SHA256_ADJUSTMENT], SHA256_ROUND_CONSTANTS.slice(15));
  const CS64_FACTOR = 0x82893933;
  const CS64_COEFFICIENTS = [[0xE82E91B1,0xB32700D0],[0x44DE24C6,0x88DFF51D],[0x3BEB65BC,0x29514038],[0xC89C5933,0xB328CBDF],[0x8D1EC211,0xD405B4D5],[0x314EF5D5,0x26E55F3C],[0xE92491B1,0x607801C6],[0xF0A5B9D5,0x82B2C1FB],[0x06064CF3,0xFA51A3DA],[0xDA79FA60,0x207CC464],[0xBED20560,0x3C3C74F3],[0x89F9C9F8,0xD2D14B61],[0x35FA38C6,0xBB04A2C1],[0xCB49E3C6,0xC5626167]];
  const CS64_ADJUSTMENT0 = 0xF2F90B1A;
  const CS64_ADJUSTMENT1 = 0x0B1A0000;
  const MASK = 0xFFFFFFFFn;

  function u32(n) { return Number(BigInt(n) & MASK); }
  function B(n) { return BigInt(n >>> 0); }
  function addU32() {
    var s = 0n;
    for (var i = 0; i < arguments.length; i++) s += BigInt(arguments[i]) & MASK;
    return Number(s & MASK);
  }
  function mulU32(a, b) { return Number((B(a) * B(b)) & MASK); }
  function sigma0(v) {
    v = u32(v);
    return u32((v >>> 7) ^ ((v << 25) >>> 0) ^ (v >>> 18) ^ ((v << 14) >>> 0) ^ (v >>> 3));
  }
  function sigma1(v) {
    v = u32(v);
    return u32((v >>> 17) ^ ((v << 15) >>> 0) ^ (v >>> 19) ^ ((v << 13) >>> 0) ^ (v >>> 10));
  }
  function rol16(v) {
    v = u32(v);
    return u32(((v << 16) >>> 0) | (v >>> 16));
  }
  function bigSigma0(e) {
    var rot = B(e) * 0x100000001n;
    return Number(((rot >> 6n) ^ (rot >> 11n) ^ (rot >> 25n)) & MASK);
  }
  function bigSigma1(a) {
    var rot = B(a) * 0x100000001n;
    return Number(((rot >> 2n) ^ (rot >> 13n) ^ (rot >> 22n)) & MASK);
  }
  function expandSchedule(words, start) {
    for (var i = start == null ? 16 : start; i < 64; i++) {
      words[i] = addU32(sigma1(words[i - 2]), words[i - 7], sigma0(words[i - 15]), words[i - 16]);
    }
  }
  function sha256Rounds(state, words, firstRound) {
    var a = state[0], b = state[1], c = state[2], d = state[3];
    var e = state[4], f = state[5], g = state[6], h = state[7];
    var fr = firstRound || 0;
    var constants = fr === 14 ? SHA256_BLOCK_CONSTANTS : SHA256_ROUND_CONSTANTS;
    var aligned = Math.min(64, Math.floor((fr + 7) / 8) * 8);
    for (var index = fr; index < aligned; index++) {
      var t1 = addU32(h, bigSigma0(e), g ^ (e & (f ^ g)), constants[index], words[index]);
      var t2 = addU32(bigSigma1(a), (a & b) | (c & (a | b)));
      h = g; g = f; f = e; e = addU32(d, t1); d = c; c = b; b = a; a = addU32(t1, t2);
    }
    for (index = aligned; index < 64; index += 8) {
      var t1x = addU32(h, bigSigma0(e), g ^ (e & (f ^ g)), constants[index], words[index]);
      d = addU32(d, t1x);
      h = addU32(t1x, bigSigma1(a), (a & b) | (c & (a | b)));
      t1x = addU32(g, bigSigma0(d), f ^ (d & (e ^ f)), constants[index + 1], words[index + 1]);
      c = addU32(c, t1x);
      g = addU32(t1x, bigSigma1(h), (h & a) | (b & (h | a)));
      t1x = addU32(f, bigSigma0(c), e ^ (c & (d ^ e)), constants[index + 2], words[index + 2]);
      b = addU32(b, t1x);
      f = addU32(t1x, bigSigma1(g), (g & h) | (a & (g | h)));
      t1x = addU32(e, bigSigma0(b), d ^ (b & (c ^ d)), constants[index + 3], words[index + 3]);
      a = addU32(a, t1x);
      e = addU32(t1x, bigSigma1(f), (f & g) | (h & (f | g)));
      t1x = addU32(d, bigSigma0(a), c ^ (a & (b ^ c)), constants[index + 4], words[index + 4]);
      h = addU32(h, t1x);
      d = addU32(t1x, bigSigma1(e), (e & f) | (g & (e | f)));
      t1x = addU32(c, bigSigma0(h), b ^ (h & (a ^ b)), constants[index + 5], words[index + 5]);
      g = addU32(g, t1x);
      c = addU32(t1x, bigSigma1(d), (d & e) | (f & (d | e)));
      t1x = addU32(b, bigSigma0(g), a ^ (g & (h ^ a)), constants[index + 6], words[index + 6]);
      f = addU32(f, t1x);
      b = addU32(t1x, bigSigma1(c), (c & d) | (e & (c | d)));
      t1x = addU32(a, bigSigma0(f), h ^ (f & (g ^ h)), constants[index + 7], words[index + 7]);
      e = addU32(e, t1x);
      a = addU32(t1x, bigSigma1(b), (b & c) | (d & (b | c)));
    }
    return [a, b, c, d, e, f, g, h];
  }
  function sha256Init(head7) {
    var words = new Array(64).fill(0);
    words[14] = u32((head7[0] << 16) | (head7[1] << 8) | head7[2]);
    words[15] = u32((head7[3] << 24) | (head7[4] << 16) | (head7[5] << 8) | head7[6]);
    for (var index = 16; index < 30; index++) {
      var value = SHA256_SCHEDULE[index - 16];
      if (index - 2 >= 14) {
        value = addU32(value, index === 16 ? (sigma1(words[index - 2]) ^ SHA256_SIGMA1_ADJUSTMENT) : sigma1(words[index - 2]));
      }
      if (index - 7 >= 14) value = addU32(value, words[index - 7]);
      if (index - 15 >= 14) {
        value = addU32(value, index === 29 ? (sigma0(words[index - 15]) ^ SHA256_SIGMA0_ADJUSTMENT) : sigma0(words[index - 15]));
      }
      words[index] = u32(value);
    }
    words[30] = addU32(sigma1(words[28]), words[23], sigma0(words[15]), words[14], SHA256_ADJUSTMENT, (~SHA256_ROUND_CONSTANTS[14] + 1) >>> 0);
    // Python: + ADJUSTMENT - ROUND[14]  == add ADJUSTMENT + (-ROUND[14] mod 2^32)
    words[30] = u32((BigInt(sigma1(words[28])) + BigInt(words[23]) + BigInt(sigma0(words[15])) + BigInt(words[14]) + BigInt(SHA256_ADJUSTMENT) - BigInt(SHA256_ROUND_CONSTANTS[14])) & MASK);
    expandSchedule(words, 31);
    var working = sha256Rounds(SHA256_STATE.slice(), words, 14);
    return SHA256_INITIAL.map(function (x, i) { return addU32(x, working[i]); });
  }
  function wordsLe4Even(buf) {
    var padded = buf;
    var rem = (4 - (padded.length % 4)) % 4;
    if (rem) {
      var p = new Uint8Array(padded.length + rem);
      p.set(padded);
      padded = p;
    }
    var out = [];
    for (var i = 0; i + 4 <= padded.length; i += 4) {
      out.push(u32(padded[i] | (padded[i + 1] << 8) | (padded[i + 2] << 16) | (padded[i + 3] << 24)));
    }
    if (out.length % 2) out.push(0);
    return out;
  }
  function cs64Digest(data, digest) {
    var keyA = u32(digest[0] | (digest[1] << 8) | (digest[2] << 16) | (digest[3] << 24)) | 1;
    var keyB = u32(digest[4] | (digest[5] << 8) | (digest[6] << 16) | (digest[7] << 24)) | 1;
    var factors = [mulU32(keyA, CS64_FACTOR), mulU32(keyB, CS64_FACTOR)];
    var terms = [];
    var offsets = [];
    for (var i = 0; i < CS64_COEFFICIENTS.length; i++) {
      terms.push(mulU32(CS64_COEFFICIENTS[i][0], factors[i % 2]));
      offsets.push(CS64_COEFFICIENTS[i][1]);
    }
    var padded = new Uint8Array(1 + data.length);
    padded.set(data, 1);
    var wds = wordsLe4Even(padded);
    for (var index = 0; index < wds.length; index++) {
      var word = wds[index];
      var term = Number((B(word) * B(index % 2 === 0 ? keyA : keyB)) & MASK);
      var offset = Number((B(rol16(word)) * B(index % 2 === 0 ? 0xef0569fb : 0xc31713db)) & MASK);
      if (index === 0) {
        term = addU32(term, mulU32(CS64_ADJUSTMENT0, factors[0]));
        offset = addU32(offset, CS64_ADJUSTMENT1);
      }
      terms.push(u32(term));
      offsets.push(u32(offset));
    }
    var swapAcc = 0, swapLast = 0, state = 0, acc = 0;
    for (index = 0; index < terms.length; index += 2) {
      var x = terms[index], y = terms[index + 1];
      var t = rol16(addU32(offsets[index], x));
      var q = mulU32(t, 0x76f50f34);
      swapAcc = addU32(swapAcc, addU32(mulU32(rol16(q), 0xc3efea97), q));
      t = rol16(addU32(offsets[index + 1], y));
      q = mulU32(t, 0x1881ce3c);
      swapLast = addU32(mulU32(rol16(q), 0x35bd1ec9), q);
      swapAcc = addU32(swapAcc, swapLast);
      state = addU32(mulU32(state, keyA), x);
      state = mulU32(rol16(state), 0xcf98b111);
      state = mulU32(rol16(state), 0x87085b9f);
      state = mulU32(rol16(state), 0x12ceb96d);
      state = mulU32(rol16(state), 0x257e1d83);
      acc = addU32(acc, state);
      t = addU32(mulU32(state, keyB), y);
      t = mulU32(rol16(t), 0xa27416f5);
      t = mulU32(rol16(t), 0xd38396ff);
      state = mulU32(rol16(mulU32(rol16(t), 0x7c932b89)), 0xbfa49f69);
      acc = addU32(acc, state);
    }
    return [u32(swapLast ^ state), u32(swapAcc ^ acc)];
  }
  function sha256Digest(dataBytes) {
    var data = dataBytes instanceof Uint8Array ? dataBytes : new Uint8Array(dataBytes);
    if (data.length < 7) throw new Error("token salt short");
    var length = 57 + data.length;
    var body = data.subarray(7);
    var pad = [];
    for (var i = 0; i < body.length; i++) pad.push(body[i]);
    pad.push(0x80);
    while ((pad.length + 8) % 64 !== 0) pad.push(0);
    var bits = length * 8;
    var hi = Math.floor(bits / 0x100000000);
    var lo = bits >>> 0;
    pad.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
    pad.push((lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var paddedPy = new Uint8Array(pad);
    var state = sha256Init(data.subarray(0, 7));
    for (var offset = 0; offset < paddedPy.length; offset += 64) {
      var words = new Array(64);
      for (var j = 0; j < 16; j++) {
        var o = offset + j * 4;
        words[j] = u32((paddedPy[o] << 24) | (paddedPy[o + 1] << 16) | (paddedPy[o + 2] << 8) | paddedPy[o + 3]);
      }
      expandSchedule(words);
      var working = sha256Rounds(state.slice(), words, 0);
      state = state.map(function (x, i) { return addU32(x, working[i]); });
    }
    var out = new Uint8Array(32);
    for (var k = 0; k < 8; k++) {
      var v = state[k];
      out[k * 4] = (v >>> 24) & 255;
      out[k * 4 + 1] = (v >>> 16) & 255;
      out[k * 4 + 2] = (v >>> 8) & 255;
      out[k * 4 + 3] = v & 255;
    }
    return out;
  }
  function hexUpper(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += ("0" + bytes[i].toString(16)).slice(-2);
    return s.toUpperCase();
  }
  function hexU32LE(words) {
    var out = new Uint8Array(8);
    for (var i = 0; i < 2; i++) {
      var v = u32(words[i]);
      out[i * 4] = v & 255;
      out[i * 4 + 1] = (v >>> 8) & 255;
      out[i * 4 + 2] = (v >>> 16) & 255;
      out[i * 4 + 3] = (v >>> 24) & 255;
    }
    return hexUpper(out);
  }
  function generateSecMsGecV2(unixTimestamp, skewSec) {
    var ticks = (unixTimestamp != null ? unixTimestamp : (Date.now() / 1000)) + (skewSec || 0);
    ticks += WIN_EPOCH;
    ticks -= ticks % 300;
    ticks = Math.floor(ticks * (S_TO_NS / 100));
    var ascii = String(ticks) + TRUSTED_CLIENT_TOKEN;
    var data = new Uint8Array(ascii.length);
    for (var i = 0; i < ascii.length; i++) data[i] = ascii.charCodeAt(i) & 255;
    var digest = sha256Digest(data);
    var cs = cs64Digest(data, digest);
    return hexU32LE(cs) + "-" + hexUpper(digest);
  }
  var api = {
    TRUSTED_CLIENT_TOKEN: TRUSTED_CLIENT_TOKEN,
    CHROMIUM_FULL_VERSION: CHROMIUM_FULL_VERSION,
    SEC_MS_GEC_VERSION: SEC_MS_GEC_VERSION,
    generateSecMsGecV2: generateSecMsGecV2
  };
  global.SetdadrEdgeGec = api;
  return api;
})(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this));


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
