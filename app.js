(() => {
  const LS = "setdadr-v2";
  const APP_VER = "81";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function load() {
    try {
      const cur = JSON.parse(localStorage.getItem(LS));
      if (cur && Array.isArray(cur.moves) && Array.isArray(cur.plans)) return cur;
    } catch {}
    return { moves: [], plans: [] };
  }
  function save(st) {
    localStorage.setItem(LS, JSON.stringify(st));
  }

  let state = load();
  let editId = null;
  let circuit = [];
  let run = null;
  let raf = 0;
  let voiceReady = false;
  let faVoice = null;
  let enVoice = null;
  let speakToken = 0;
  let audioCtx = null;
  let activeBeep = null;
  let startLock = false;
  let speechWarmed = false;
  let voicePlayer = null;
  let announceSeq = 0;
  let announceChain = Promise.resolve();
  const MUTE_LS = "setdadr-mute";
  let soundMuted = false;
  try {
    soundMuted = localStorage.getItem(MUTE_LS) === "1";
  } catch {
    soundMuted = false;
  }
  const voiceBuf = new Map();
  const VOICE_BASE = "./voice/";
  const VOICE_Q = "?v=81";
  const dynFaAudio = new Map(); // متن → Audio
  const dynFaBlob = new Map(); // متن → Blob کش‌شده
  const DYN_FA_CACHE = "setdadr-fa-tts-v1";
  let tickIv = 0;
  let bgKeepAudio = null;
  let bgKeepOn = false;
  // سرور دیلارا — هر جمله/کلمه؛ نتیجه در کش گوشی می‌ماند
  const TTS_API_LS = "setdadr-tts-api";
  function getTtsApiBases() {
    const out = [];
    try {
      const saved = localStorage.getItem(TTS_API_LS);
      if (saved) out.push(saved.replace(/\/$/, ""));
    } catch {}
    if (typeof window !== "undefined" && window.SETDADR_TTS_API) {
      out.push(String(window.SETDADR_TTS_API).replace(/\/$/, ""));
    }
    out.push("https://tension-salaries-mercy-blackberry.trycloudflare.com");
    try {
      const h = location.hostname;
      if (h === "localhost" || h === "127.0.0.1") out.push("http://127.0.0.1:8787");
    } catch {}
    return [...new Set(out.filter(Boolean))];
  }
  const VOICE_FILES = {
    count: { 10: true, 20: true, 30: true, 60: true },
    phase: {},
    done: {},
    cheer: { ali: true },
    phrase: { next: true },
    move: {},
    went: {}
  };
  [5,8,10,12,15,16,18,20,24,25,30,32,35,40,45,50,60,75,80,90,120].forEach((n) => {
    VOICE_FILES.went[n] = true;
  });
  VOICE_FILES.wentOf = {};
  [20,25,30,35,40,45,50,60,75,90,120].forEach((t) => {
    const d = Math.max(1, Math.round((t * 5) / 8));
    VOICE_FILES.wentOf[t + ":" + d] = true;
  });
  [5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100,105,110,115,120,150,180,240,300,600].forEach((n) => {
    VOICE_FILES.phase[n] = true;
  });
  for (let i = 1; i <= 15; i++) VOICE_FILES.done[i] = true;

  const viewIds = ["home", "moves", "edit", "run", "done"];

  const FA_NUM = {
    0: "صفر",
    1: "یک",
    2: "دو",
    3: "سه",
    4: "چهار",
    5: "پنج",
    6: "شش",
    7: "هفت",
    8: "هشت",
    9: "نه",
    10: "ده",
    11: "یازده",
    12: "دوازده",
    13: "سیزده",
    14: "چهارده",
    15: "پانزده",
    16: "شانزده",
    17: "هفده",
    18: "هجده",
    19: "نوزده",
    20: "بیست",
    30: "سی",
    40: "چهل",
    50: "پنجاه",
    60: "شصت",
    70: "هفتاد",
    80: "هشتاد",
    90: "نود",
    100: "صد",
    200: "دویست",
    300: "سیصد",
    400: "چهارصد",
    500: "پانصد",
    600: "ششصد"
  };

  function faNum(n) {
    n = Math.round(Math.abs(Number(n) || 0));
    if (FA_NUM[n]) return FA_NUM[n];
    if (n > 20 && n < 100) {
      const tens = Math.floor(n / 10) * 10;
      const ones = n % 10;
      const t = FA_NUM[tens] || String(tens);
      return ones ? t + " و " + (FA_NUM[ones] || ones) : t;
    }
    if (n > 100 && n < 1000) {
      const hundreds = Math.floor(n / 100) * 100;
      const rest = n % 100;
      const h = FA_NUM[hundreds] || String(hundreds);
      return rest ? h + " و " + faNum(rest) : h;
    }
    return String(n);
  }

  function loadVoices() {
    if (!window.speechSynthesis) return;
    const voices = speechSynthesis.getVoices() || [];
    const scoreVoice = (v, preferLang) => {
      let s = 0;
      const n = ((v.name || "") + " " + (v.lang || "")).toLowerCase();
      if (preferLang.test(v.lang || "")) s += 6;
      // ترجیح صداهای روشن‌تر و جدیدتر
      if (/neural|natural|online|google|microsoft.*aria|jenny|sara|sonia|zira|samantha/i.test(n)) s += 8;
      if (/female|woman|girl/i.test(n)) s += 3;
      // صداهای کند/تخت را کنار بگذار
      if (/compact|eloquence|desktop|espeak|microsoft.*server|heda|nazanin|dariush/i.test(n)) s -= 6;
      if (/male|david|mark|george|james|farid|hamid/i.test(n)) s -= 5;
      return s;
    };
    const faList = [...voices]
      .filter((v) => /^fa(-|_|$)/i.test(v.lang) || /persian|farsi|فارسی/i.test(v.name))
      .sort((a, b) => scoreVoice(b, /^fa/) - scoreVoice(a, /^fa/));
    // اگر چند فارسی هست، دومی را ترجیح بده اگر اولی امتیاز منفی/ضعیف است
    faVoice = faList.find((v) => scoreVoice(v, /^fa/) >= 6) || faList[0] || null;
    // اگر فارسی خوب نبود، از انگلیسی زنانه پرانرژی برای تشویق استفاده می‌کنیم
    const enList = [...voices]
      .filter((v) => /^en(-|_|$)/i.test(v.lang))
      .sort((a, b) => scoreVoice(b, /^en/) - scoreVoice(a, /^en/));
    enVoice =
      enList.find((v) => /aria|jenny|samantha|zira|female|google|neural/i.test(v.name || "")) ||
      enList[0] ||
      null;
    // صدای تشویق جدا: ترجیح انگلیسی زنانه پرانرژی اگر فارسی ضعیف است
    window.__cheerVoice = enVoice || faVoice;
    voiceReady = !!voices.length;
  }
  if (window.speechSynthesis) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function isIOSLike() {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    return (
      /iPad|iPhone|iPod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }

  function buzz(pattern) {
    try {
      // ویبره همیشه روشن می‌ماند تا در باشگاه حس شود
      if (navigator.vibrate) navigator.vibrate(pattern || [70]);
    } catch {}
  }

  function paintMuteBtn() {
    const btn = $("#btnMute");
    if (!btn) return;
    btn.setAttribute("aria-pressed", soundMuted ? "true" : "false");
    btn.classList.toggle("is-muted", soundMuted);
    btn.setAttribute("aria-label", soundMuted ? "صدا قطع است" : "صدا روشن است");
  }

  function setSoundMuted(on) {
    soundMuted = !!on;
    try {
      localStorage.setItem(MUTE_LS, soundMuted ? "1" : "0");
    } catch {}
    if (soundMuted) {
      stopAllSound();
      stopBgKeepAlive();
    } else if (run && !run.paused) {
      startBgKeepAlive();
    }
    paintMuteBtn();
  }

  function announceAlive(seq) {
    return seq === announceSeq;
  }

  function queueAnnounce(task) {
    const seq = announceSeq;
    announceChain = announceChain
      .then(async () => {
        if (!announceAlive(seq)) return;
        await task(seq);
      })
      .catch(() => {});
    return announceChain;
  }

  function timePhrase(sec) {
    sec = Math.round(Math.abs(Number(sec) || 0));
    if (sec < 60) return faNum(sec) + " ثانیه";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (s === 0) return faNum(m) + " دقیقه";
    return faNum(m) + " دقیقه و " + faNum(s) + " ثانیه";
  }

  function unlockAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        if (!audioCtx) audioCtx = new AC();
        if (audioCtx.state === "suspended") {
          audioCtx.resume().catch(() => {});
        }
      }
    } catch {}
    if (window.speechSynthesis) {
      try {
        speechSynthesis.resume();
        loadVoices();
      } catch {}
    }
    if (!speechWarmed) {
      speechWarmed = true;
      try {
        if (audioCtx) {
          const g = audioCtx.createGain();
          g.gain.value = 0.0001;
          const o = audioCtx.createOscillator();
          o.connect(g);
          g.connect(audioCtx.destination);
          o.start();
          o.stop(audioCtx.currentTime + 0.015);
        }
      } catch {}
    }
  }

  function stopBeep() {
    if (!activeBeep) return;
    try {
      const now = audioCtx ? audioCtx.currentTime : 0;
      if (activeBeep.gain) {
        activeBeep.gain.gain.cancelScheduledValues(now);
        activeBeep.gain.gain.setValueAtTime(0.0001, now);
      }
      const list = activeBeep.oscs || [activeBeep.osc, activeBeep.osc2, activeBeep.osc3].filter(Boolean);
      list.forEach((o) => {
        try {
          o.stop(now);
          o.disconnect();
        } catch {}
      });
    } catch {}
    activeBeep = null;
  }

  function stopVoiceFile() {
    if (!voicePlayer) return;
    try {
      if (voicePlayer.stop) voicePlayer.stop();
      if (voicePlayer.disconnect) voicePlayer.disconnect();
    } catch {}
    try {
      if (voicePlayer.pause) {
        voicePlayer.onended = null;
        voicePlayer.onerror = null;
        voicePlayer.pause();
        voicePlayer.removeAttribute("src");
        voicePlayer.load();
      }
    } catch {}
    voicePlayer = null;
  }

  function stopAllSound() {
    announceSeq += 1;
    speakToken += 1;
    // صف اعلام قبلی را رها کن تا با «بعدی» حرف قبلی نگوید
    announceChain = Promise.resolve();
    stopBeep();
    stopVoiceFile();
    if (window.speechSynthesis) {
      try {
        speechSynthesis.cancel();
      } catch {}
    }
    // keep-alive پس‌زمینه را قطع نکن — فقط با پایان/خروج/توقف
  }

  function setMediaPlaying(on, title) {
    try {
      if (!navigator.mediaSession) return;
      navigator.mediaSession.playbackState = on ? "playing" : "paused";
      if (on) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: title || "ست‌یار",
          artist: "ست‌یار",
          album: "تمرین"
        });
      }
    } catch {}
  }

  function startBgKeepAlive() {
    if (soundMuted) return;
    bgKeepOn = true;
    unlockAudio();
    try {
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    } catch {}
    if (!bgKeepAudio) {
      const a = makeHtmlAudio(VOICE_BASE + "silence.wav" + VOICE_Q);
      a.loop = true;
      a.volume = 0.001;
      bgKeepAudio = a;
    }
    const p = bgKeepAudio.play();
    if (p && typeof p.then === "function") p.catch(() => {});
    setMediaPlaying(true, (run && run.title) || "ست‌یار");
  }

  function stopBgKeepAlive() {
    bgKeepOn = false;
    setMediaPlaying(false);
    if (!bgKeepAudio) return;
    try {
      bgKeepAudio.onended = null;
      bgKeepAudio.onerror = null;
      bgKeepAudio.pause();
      bgKeepAudio.removeAttribute("src");
      bgKeepAudio.load();
    } catch {}
    bgKeepAudio = null;
  }

  function resumeBgIfNeeded() {
    if (!run || run.paused || soundMuted || !bgKeepOn) return;
    unlockAudio();
    try {
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    } catch {}
    if (bgKeepAudio) {
      const p = bgKeepAudio.play();
      if (p && typeof p.then === "function") p.catch(() => {});
    } else {
      startBgKeepAlive();
    }
    try {
      if (window.speechSynthesis) speechSynthesis.resume();
    } catch {}
    setMediaPlaying(true, (run && run.title) || "ست‌یار");
  }

  // زنگ گرم باشگاهی — بم، نرم، بدون تیغ؛ برای ساعت‌ها تکرار آزار ندهد
  function playWarmChime(opts) {
    if (soundMuted) return;
    const o = opts || {};
    try {
      unlockAudio();
      if (!audioCtx) return;
      const start = () => {
        if (!o.stack) stopBeep();
        const t0 = audioCtx.currentTime + (o.atMs || 0) / 1000;
        const master = audioCtx.createGain();
        const lp = audioCtx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(o.bright ? 1600 : 1200, t0);
        lp.Q.setValueAtTime(0.55, t0);
        const peak = o.peak != null ? o.peak : 1.15;
        const total = o.total != null ? o.total : 0.7;
        master.gain.setValueAtTime(0.0001, t0);
        master.gain.exponentialRampToValueAtTime(peak, t0 + 0.05);
        master.gain.setValueAtTime(peak * 0.85, t0 + total * 0.55);
        master.gain.exponentialRampToValueAtTime(0.0001, t0 + total);
        master.connect(lp);
        lp.connect(audioCtx.destination);
        const notes = o.notes || [
          { f: 392.0, at: 0, dur: 0.38, g: 0.95 },
          { f: 523.25, at: 0.14, dur: 0.42, g: 1.05 },
          { f: 659.25, at: 0.3, dur: 0.45, g: 0.85 }
        ];
        const oscs = [];
        notes.forEach((n) => {
          const o1 = audioCtx.createOscillator();
          const o2 = audioCtx.createOscillator();
          const g1 = audioCtx.createGain();
          const g2 = audioCtx.createGain();
          o1.type = "sine";
          o2.type = "sine";
          const gt = t0 + n.at;
          o1.frequency.setValueAtTime(n.f, gt);
          o2.frequency.setValueAtTime(n.f * 2, gt);
          g1.gain.setValueAtTime(0.0001, gt);
          g1.gain.exponentialRampToValueAtTime(n.g * 0.7, gt + 0.05);
          g1.gain.exponentialRampToValueAtTime(0.0001, gt + n.dur);
          // هارمونیک دوم خیلی ملایم — تیز نشود
          g2.gain.setValueAtTime(0.0001, gt);
          g2.gain.exponentialRampToValueAtTime(n.g * 0.12, gt + 0.06);
          g2.gain.exponentialRampToValueAtTime(0.0001, gt + n.dur);
          o1.connect(g1);
          o2.connect(g2);
          g1.connect(master);
          g2.connect(master);
          o1.start(gt);
          o2.start(gt);
          o1.stop(gt + n.dur + 0.03);
          o2.stop(gt + n.dur + 0.03);
          oscs.push(o1, o2);
        });
        activeBeep = { osc: oscs[0], gain: master, oscs };
      };
      if (audioCtx.state === "suspended") audioCtx.resume().then(start).catch(start);
      else start();
    } catch {}
  }

  function beepSoftRing(atMs) {
    playWarmChime({
      atMs: atMs || 0,
      stack: true,
      peak: 1.05,
      total: 0.55,
      notes: [
        { f: 440, at: 0, dur: 0.32, g: 1.0 },
        { f: 554.37, at: 0.1, dur: 0.36, g: 0.95 }
      ]
    });
  }

  function beepSoftDouble() {
    beepSoftRing(0);
    setTimeout(() => beepSoftRing(0), 520);
  }

  function beepWhite(ms, soft) {
    if (soundMuted) return;
    if (soft) {
      beepSoftDouble();
      return;
    }
    playWarmChime({
      peak: 1.2,
      total: 0.75,
      notes: [
        { f: 349.23, at: 0, dur: 0.4, g: 1.0 },
        { f: 440.0, at: 0.16, dur: 0.42, g: 1.1 },
        { f: 523.25, at: 0.34, dur: 0.48, g: 0.9 }
      ]
    });
  }

  function nearestPhaseClip(n) {
    n = Math.round(n);
    if (VOICE_FILES.phase[n]) return n;
    const keys = Object.keys(VOICE_FILES.phase).map(Number).sort((a, b) => a - b);
    let best = keys[0];
    let dist = Math.abs(best - n);
    keys.forEach((k) => {
      const d = Math.abs(k - n);
      if (d < dist) {
        dist = d;
        best = k;
      }
    });
    return dist <= 5 ? best : null;
  }

  async function loadVoiceBuffer(rel) {
    if (voiceBuf.has(rel)) return voiceBuf.get(rel);
    unlockAudio();
    if (!audioCtx) return null;
    const res = await fetch(VOICE_BASE + rel + VOICE_Q, { cache: "force-cache" });
    if (!res.ok) return null;
    const raw = await res.arrayBuffer();
    const buf = await audioCtx.decodeAudioData(raw.slice(0));
    voiceBuf.set(rel, buf);
    return buf;
  }

  function faTtsUrls(text, lang) {
    const q = encodeURIComponent(String(text || "").trim().slice(0, 160));
    const tl = lang === "en" ? "en" : "fa";
    const direct = [
      "https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=" + tl + "&q=" + q,
      "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=" + tl + "&q=" + q
    ];
    const out = [...direct];
    direct.forEach((u) => {
      out.push("https://corsproxy.io/?" + encodeURIComponent(u));
      out.push("https://api.allorigins.win/raw?url=" + encodeURIComponent(u));
      out.push("https://corsproxy.org/?" + encodeURIComponent(u));
    });
    return out;
  }

  function hasUsableFaVoice() {
    loadVoices();
    return !!(faVoice && /^fa/i.test(String(faVoice.lang || "")));
  }

  function hasUsableEnVoice() {
    loadVoices();
    return !!enVoice;
  }

  function makeHtmlAudio(src) {
    const a = new Audio(src);
    a.playsInline = true;
    a.setAttribute("playsinline", "");
    a.setAttribute("webkit-playsinline", "");
    a.preload = "auto";
    return a;
  }

  async function loadDynFaFromCache(key) {
    if (dynFaBlob.has(key)) return dynFaBlob.get(key);
    try {
      if (!("caches" in window)) return null;
      const cache = await caches.open(DYN_FA_CACHE);
      const hit = await cache.match("fa-tts:" + encodeURIComponent(key));
      if (!hit || !hit.ok) return null;
      const blob = await hit.blob();
      if (!blob || blob.size < 80) return null;
      dynFaBlob.set(key, blob);
      return blob;
    } catch {
      return null;
    }
  }

  async function saveDynFaToCache(key, blob) {
    dynFaBlob.set(key, blob);
    try {
      if (!("caches" in window)) return;
      const cache = await caches.open(DYN_FA_CACHE);
      await cache.put(
        "fa-tts:" + encodeURIComponent(key),
        new Response(blob, { headers: { "Content-Type": blob.type || "audio/mpeg" } })
      );
    } catch {}
  }

  function fetchWithTimeout(url, ms) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => {
      try {
        if (ctrl) ctrl.abort();
      } catch {}
    }, ms || 1800);
    return fetch(url, {
      cache: "force-cache",
      credentials: "omit",
      signal: ctrl ? ctrl.signal : undefined
    }).finally(() => clearTimeout(timer));
  }

  // صدای دیلارا مثل کلیپ‌ها — برای هر متن فارسی دلخواه
  const EDGE_TTS_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
  const EDGE_TTS_VOICE = "fa-IR-DilaraNeural";
  const EDGE_TTS_CHROME = "143.0.3650.75";
  let edgeTtsSkew = 0;

  function edgeUuid() {
    if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
    return (
      Date.now().toString(16) +
      Math.random().toString(16).slice(2) +
      Math.random().toString(16).slice(2)
    ).slice(0, 32);
  }

  async function edgeSecMsGec() {
    const WIN_EPOCH = 11644473600;
    let ticks = Date.now() / 1000 + edgeTtsSkew + WIN_EPOCH;
    ticks -= ticks % 300;
    ticks = Math.floor(ticks * (1e9 / 100));
    const str = String(ticks) + EDGE_TTS_TOKEN;
    const data = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(hash)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }

  function edgeJsDate() {
    return (
      new Date().toUTCString().replace("GMT", "GMT+0000") +
      " (Coordinated Universal Time)"
    );
  }

  function escapeSsml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function synthesizeEdgeFa(text) {
    const key = String(text || "").trim().slice(0, 160);
    if (!key) return Promise.resolve(null);
    return new Promise(async (resolve) => {
      let settled = false;
      const done = (blob) => {
        if (settled) return;
        settled = true;
        resolve(blob);
      };
      try {
        const gec = await edgeSecMsGec();
        const connId = edgeUuid();
        const url =
          "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1" +
          "?TrustedClientToken=" +
          EDGE_TTS_TOKEN +
          "&ConnectionId=" +
          connId +
          "&Sec-MS-GEC=" +
          gec +
          "&Sec-MS-GEC-Version=1-" +
          EDGE_TTS_CHROME;
        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        const chunks = [];
        const killer = setTimeout(() => {
          try {
            ws.close();
          } catch {}
          done(chunks.length ? new Blob(chunks, { type: "audio/mpeg" }) : null);
        }, 12000);

        ws.onopen = () => {
          try {
            const ts = edgeJsDate();
            ws.send(
              "X-Timestamp:" +
                ts +
                "\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n" +
                '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n'
            );
            const ssml =
              "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='fa-IR'>" +
              "<voice name='" +
              EDGE_TTS_VOICE +
              "'>" +
              "<prosody pitch='+0Hz' rate='+5%' volume='+0%'>" +
              escapeSsml(key) +
              "</prosody></voice></speak>";
            ws.send(
              "X-RequestId:" +
                edgeUuid() +
                "\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:" +
                ts +
                "Z\r\nPath:ssml\r\n\r\n" +
                ssml
            );
          } catch {
            clearTimeout(killer);
            try {
              ws.close();
            } catch {}
            done(null);
          }
        };

        ws.onmessage = (ev) => {
          if (typeof ev.data === "string") {
            if (ev.data.indexOf("Path:turn.end") !== -1) {
              clearTimeout(killer);
              try {
                ws.close();
              } catch {}
              if (!chunks.length) done(null);
              else done(new Blob(chunks, { type: "audio/mpeg" }));
            }
            return;
          }
          try {
            const buf = new Uint8Array(ev.data);
            if (buf.length < 2) return;
            const headerLength = (buf[0] << 8) | buf[1];
            if (headerLength > buf.length) return;
            let audio = buf.slice(headerLength + 2);
            if (!audio.length && headerLength < buf.length) {
              audio = buf.slice(headerLength);
            }
            // فقط اگر هدر Path:audio دارد یا بدنه mp3 است
            const headTxt = new TextDecoder().decode(buf.slice(0, Math.min(headerLength, buf.length)));
            if (headTxt.indexOf("Path:audio") === -1 && audio.length < 40) return;
            if (audio.length) chunks.push(audio);
          } catch {}
        };

        ws.onerror = () => {
          clearTimeout(killer);
          done(chunks.length ? new Blob(chunks, { type: "audio/mpeg" }) : null);
        };
        ws.onclose = () => {
          clearTimeout(killer);
          if (!settled) {
            done(chunks.length ? new Blob(chunks, { type: "audio/mpeg" }) : null);
          }
        };
      } catch {
        done(null);
      }
    });
  }

  async function fetchFaTtsBlob(text) {
    const key = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!key) return null;
    const cached = await loadDynFaFromCache(key);
    if (cached) return cached;

    // ۱) سرور دیلارا — هر جمله / کلمه بی‌ربط (مسیر اصلی ۱۰۰٪)
    const bases = getTtsApiBases();
    for (let i = 0; i < bases.length; i++) {
      try {
        const url = bases[i] + "/tts?t=" + encodeURIComponent(key);
        const res = await fetchWithTimeout(url, 8000);
        if (!res || !res.ok) continue;
        const blob = await res.blob();
        if (!blob || blob.size < 80) continue;
        if (blob.type && blob.type.indexOf("audio") === -1 && blob.size < 500) continue;
        await saveDynFaToCache(key, blob);
        return blob;
      } catch {}
    }

    // ۲) اج مرورگر (غالباً روی گوشی قطع است)
    try {
      const edgeBlob = await synthesizeEdgeFa(key.slice(0, 160));
      if (edgeBlob && edgeBlob.size > 80) {
        await saveDynFaToCache(key, edgeBlob);
        return edgeBlob;
      }
    } catch {}

    // ۳) گوگل
    const urls = faTtsUrls(key.slice(0, 160)).slice(0, 2);
    for (let i = 0; i < urls.length; i++) {
      try {
        const res = await fetchWithTimeout(urls[i], 2000);
        if (!res || !res.ok) continue;
        const blob = await res.blob();
        if (!blob || blob.size < 80) continue;
        await saveDynFaToCache(key, blob);
        return blob;
      } catch {}
    }
    return null;
  }

  async function warmFaTts(text) {
    const key = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!key) return;
    if (typeof MOVE_CLIP !== "undefined" && MOVE_CLIP[key]) return;
    try {
      await fetchFaTtsBlob(key);
    } catch {}
  }

  async function warmMoveVoice(name) {
    try {
      const raw = String(name || "").replace(/\s+/g, " ").trim();
      if (!raw) return;
      // عین متن کاربر را کش کن (حتی بی‌ربط / چندکلمه‌ای)
      await warmFaTts(raw);
      const said = sayForMove(raw);
      if (said && said.text && said.text !== raw) await warmFaTts(said.text);
    } catch {}
  }

  async function playHtmlAudioEl(a, vol, maxWaitMs) {
    if (soundMuted || !a) return false;
    unlockAudio();
    stopVoiceFile();
    try {
      a.pause();
      a.currentTime = 0;
    } catch {}
    a.volume = Math.max(0.05, Math.min(1, vol == null ? 0.98 : vol));
    voicePlayer = a;
    // گوشی ایران کند است؛ ۲ث کافی نیست (روی کامپیوتر زود می‌آمد، روی گوشی قطع می‌شد)
    const waitCap = maxWaitMs != null ? maxWaitMs : 12000;
    return await new Promise((resolve) => {
      let done = false;
      let heard = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        try {
          a.onplaying = null;
          a.onended = null;
          a.onerror = null;
        } catch {}
        resolve(!!ok);
      };
      a.onplaying = () => {
        heard = true;
      };
      a.onended = () => finish(true);
      a.onerror = () => finish(false);
      const p = a.play();
      if (p && typeof p.then === "function") {
        p.then(() => {}).catch(() => finish(false));
      }
      // فقط اگر اصلاً شروع نشد؛ اگر شروع شد تا ته صبر کن
      setTimeout(() => {
        if (done) return;
        if (heard || (a.currentTime || 0) > 0.02) {
          const left = Math.max(500, (isFinite(a.duration) ? a.duration * 1000 : 4000) + 800);
          setTimeout(() => finish(true), left);
          return;
        }
        try {
          a.pause();
        } catch {}
        finish(false);
      }, waitCap);
    });
  }

  async function playBlobFa(blob, vol) {
    if (!blob) return false;
    try {
      unlockAudio();
      // اول با AudioContext (بعد از آنلاک روی آیفون پایدارتر است)
      if (audioCtx) {
        try {
          if (audioCtx.state === "suspended") await audioCtx.resume();
          const raw = await blob.arrayBuffer();
          const buf = await audioCtx.decodeAudioData(raw.slice(0));
          stopVoiceFile();
          await new Promise((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              resolve();
            };
            const src = audioCtx.createBufferSource();
            const g = audioCtx.createGain();
            g.gain.value = Math.max(0.05, Math.min(1, vol == null ? 0.98 : vol));
            src.buffer = buf;
            src.connect(g);
            g.connect(audioCtx.destination);
            voicePlayer = src;
            src.onended = finish;
            src.start();
            setTimeout(finish, Math.min(8000, (buf.duration + 0.4) * 1000));
          });
          return true;
        } catch {}
      }
      const url = URL.createObjectURL(blob);
      const a = makeHtmlAudio(url);
      dynFaAudio.set(String(url), a);
      const ok = await playHtmlAudioEl(a, vol);
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 15000);
      return ok;
    } catch {
      return false;
    }
  }

  // هر متن فارسی دلخواه — اول از کش/دانلود، بعد پخش
  async function playDynamicFa(text, vol) {
    const key = String(text || "").trim().slice(0, 160);
    if (!key) return false;
    try {
      const blob = await fetchFaTtsBlob(key);
      if (blob) {
        const ok = await playBlobFa(blob, vol);
        if (ok) return true;
      }
      // آخرین تلاش: پخش مستقیم لینک
      const urls = faTtsUrls(key).slice(0, 2);
      for (let i = 0; i < urls.length; i++) {
        const a = makeHtmlAudio(urls[i]);
        const ok = await playHtmlAudioEl(a, vol);
        if (ok) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async function playVoiceFileHtml(rel, vol) {
    try {
      if (soundMuted) return false;
      const a = makeHtmlAudio(VOICE_BASE + rel + VOICE_Q);
      return await playHtmlAudioEl(a, vol);
    } catch {
      return false;
    }
  }

  async function playVoiceFile(rel, vol) {
    try {
      if (soundMuted) return false;
      unlockAudio();
      // گوشی: اول HTML Audio (قطعی‌تر از WebAudio روی اندروید/آیفون)
      {
        const htmlOk = await playVoiceFileHtml(rel, vol);
        if (htmlOk) return true;
      }
      if (!audioCtx) return false;
      if (audioCtx.state === "suspended") {
        try {
          await audioCtx.resume();
        } catch {}
      }
      stopVoiceFile();
      const buf = await loadVoiceBuffer(rel);
      if (!buf) return false;
      const gain = Math.max(0.05, Math.min(1, vol == null ? 0.98 : vol));
      await new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        const src = audioCtx.createBufferSource();
        const g = audioCtx.createGain();
        g.gain.value = gain;
        src.buffer = buf;
        src.connect(g);
        g.connect(audioCtx.destination);
        voicePlayer = src;
        src.onended = finish;
        src.start();
        setTimeout(finish, Math.min(8000, (buf.duration + 0.4) * 1000));
      });
      return true;
    } catch {
      return false;
    }
  }

  function speakFaSynthAsync(text, vol, lang, opts) {
    return new Promise((resolve) => {
      if (soundMuted || !window.speechSynthesis || !text) {
        resolve(false);
        return;
      }
      unlockAudio();
      loadVoices();
      const ios = isIOSLike();
      const o = opts || {};
      const wantEn = lang === "en";
      speakToken += 1;
      const tok = speakToken;
      if (!ios && !o.noCancel) {
        try {
          speechSynthesis.cancel();
        } catch {}
      }
      setTimeout(() => {
        if (tok !== speakToken) {
          resolve(false);
          return;
        }
        try {
          speechSynthesis.resume();
        } catch {}
        try {
          const u = new SpeechSynthesisUtterance(String(text));
          // حتی بدون پیدا کردن voice؛ lang را بگذار تا موتور گوشی (گوگل‌تی‌تی‌اس) بخواند
          if (o.voice) {
            u.voice = o.voice;
            u.lang = o.lang || o.voice.lang || (wantEn ? "en-US" : "fa-IR");
            u.rate = o.rate != null ? o.rate : 1.3;
            u.pitch = o.pitch != null ? o.pitch : 1.3;
          } else if (wantEn) {
            if (enVoice) u.voice = enVoice;
            u.lang = (enVoice && enVoice.lang) || "en-US";
            u.rate = o.rate != null ? o.rate : 1.12;
            u.pitch = o.pitch != null ? o.pitch : 1.12;
          } else {
            if (faVoice) u.voice = faVoice;
            u.lang = (faVoice && faVoice.lang) || "fa-IR";
            u.rate = o.rate != null ? o.rate : 1.28;
            u.pitch = o.pitch != null ? o.pitch : 1.12;
          }
          u.volume = vol == null ? 1 : Math.min(1, vol);
          let finished = false;
          let started = false;
          const done = (ok) => {
            if (finished) return;
            finished = true;
            resolve(!!ok);
          };
          let resumeIv = 0;
          u.onstart = () => {
            started = true;
          };
          u.onend = () => {
            if (resumeIv) clearInterval(resumeIv);
            done(started);
          };
          u.onerror = () => {
            if (resumeIv) clearInterval(resumeIv);
            done(false);
          };
          speechSynthesis.speak(u);
          // بعضی گوشی‌ها onstart نمی‌فرستند ولی واقعاً حرف می‌زنند
          const poke = setInterval(() => {
            if (finished) {
              clearInterval(poke);
              return;
            }
            try {
              if (speechSynthesis.speaking || speechSynthesis.pending) started = true;
            } catch {}
          }, 120);
          if (ios) {
            resumeIv = setInterval(() => {
              if (finished) {
                clearInterval(resumeIv);
                return;
              }
              try {
                speechSynthesis.resume();
              } catch {}
            }, 200);
          }
          setTimeout(() => {
            clearInterval(poke);
            if (finished) return;
            if (resumeIv) clearInterval(resumeIv);
            done(started || speechSynthesis.speaking || speechSynthesis.pending);
          }, Math.min(14000, 2200 + String(text).length * 200));
        } catch {
          resolve(false);
        }
      }, ios ? 120 : 50);
    });
  }

  function speakFaSynth(text) {
    speakFaSynthAsync(text, 0.9);
  }

  async function speakFa(text) {
    await speakFaSynthAsync(text, 0.9);
  }

  async function sayTime(sec) {
    const n = Math.round(sec);
    // اول کلیپ؛ برای دقیقه حتماً عبارت درست
    if (n >= 60) {
      const clip = nearestPhaseClip(n);
      if (clip != null) {
        const ok = await playVoiceFile("phase-" + clip + ".mp3", 0.88);
        if (ok) return true;
      }
      return await speakFaSynthAsync(timePhrase(n), 0.95);
    }
    const clip = nearestPhaseClip(n);
    if (clip != null) {
      const ok = await playVoiceFile("phase-" + clip + ".mp3", 0.88);
      if (ok) return true;
    }
    return await speakFaSynthAsync(timePhrase(n), 0.95);
  }

  async function speakSeconds(sec) {
    const n = Math.round(sec);
    return queueAnnounce(async () => {
      buzz(n <= 10 ? [40, 30, 40] : [28]);
      beepWhite(200);
      await sleep(120);
      if (VOICE_FILES.count[n]) {
        const ok = await playVoiceFile("count-" + n + ".mp3", 0.82);
        if (ok) return;
      }
      await speakFaSynthAsync(faNum(n), 0.9);
    });
  }


  function normMoveKey(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/[_./]+/g, " ")
      .replace(/[-]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[….,!?()[\]{}«»"']/g, "")
      .trim();
  }

  // تلفظ رایج حرکت‌ها برای صدای فارسی
  const MOVE_SAY = {
    squat: "اسکوات",
    squats: "اسکوات",
    "air squat": "ایر اسکوات",
    "goblet squat": "گبلت اسکوات",
    اسکوات: "اسکوات",
    burpee: "برپی",
    burpees: "برپی",
    berpi: "برپی",
    برپی: "برپی",
    plank: "پلانک",
    planks: "پلانک",
    پلانک: "پلانک",
    "push up": "شنا سوئدی",
    "push-up": "شنا سوئدی",
    pushup: "شنا سوئدی",
    pushups: "شنا سوئدی",
    "pull up": "بارفیکس",
    "pull-up": "بارفیکس",
    pullup: "بارفیکس",
    pullups: "بارفیکس",
    بارفیکس: "بارفیکس",
    شنا: "شنا",
    "شنا سوئدی": "شنا سوئدی",
    deadlift: "ددلیفت",
    "romanian deadlift": "ددلیفت رومانیایی",
    rdl: "آر دی ال",
    ددلیفت: "ددلیفت",
    lunge: "لانج",
    lunges: "لانگز",
    lange: "لانج",
    langz: "لانگز",
    لانج: "لانج",
    لانگز: "لانگز",
    لانگ: "لانگز",
    "jumping jack": "جامپینگ جک",
    "jumping jacks": "جامپینگ جک",
    "mountain climber": "مانتین کلایمر",
    "mountain climbers": "مانتین کلایمر",
    crunch: "کرانچ",
    crunches: "کرانچ",
    کرانچ: "کرانچ",
    "sit up": "دراز و نشست",
    "sit-up": "دراز و نشست",
    situp: "دراز و نشست",
    "hip thrust": "هیپ تراست",
    "glute bridge": "بریج باسن",
    "wall sit": "وال سیت",
    "calf raise": "ساق پا",
    "bicep curl": "جلو بازو",
    "tricep dip": "دیپ پشت بازو",
    "shoulder press": "پرس شانه",
    "bench press": "پرس سینه",
    "lateral raise": "نشر جانب",
    "kettlebell swing": "سوئینگ کتل بل",
    row: "روئینگ",
    "bent over row": "روئینگ خم",
    "high knees": "زانو بلند",
    "butt kicks": "پاشنه به باسن",
    "leg raise": "پای بالا",
    "russian twist": "راشن توییست",
    "box jump": "پرش روی باکس",
    "jump squat": "اسکوات پرشی",
    "sumo squat": "اسکوات سومو",
    "side plank": "پلانک بغل",
    hollow: "هالو هولد",
    "hollow hold": "هالو هولد",
    "farmer walk": "راه رفتن کشاورز",
    "battle rope": "بتل روپ",
    "jump rope": "طناب",
    yoga: "یوگا",
    stretch: "کشش",
    کشش: "کشش",
    استراحت: "استراحت",
    jump: "جامپ",
    jumps: "جامپ",
    جامپ: "جامپ",
    دیوارنشینی: "دیوارنشینی",
    "دیوار نشینی": "دیوار نشینی",
    "wall sit": "دیوارنشینی",
    wallsit: "دیوارنشینی"
  };

  // کلیپ آفلاین فارسی برای گوشی (آیفون تلفظ فارسی سیستم ندارد)
  const MOVE_CLIP = {
    اسکوات: "move-squat.mp3",
    "ایر اسکوات": "move-air-squat.mp3",
    "گبلت اسکوات": "move-goblet-squat.mp3",
    برپی: "move-burpee.mp3",
    پلانک: "move-plank.mp3",
    "شنا سوئدی": "move-pushup.mp3",
    بارفیکس: "move-pullup.mp3",
    شنا: "move-swim.mp3",
    ددلیفت: "move-deadlift.mp3",
    "ددلیفت رومانیایی": "move-rdl.mp3",
    "آر دی ال": "move-rdl-short.mp3",
    لانج: "move-lange.mp3",
    لانگز: "move-lunges.mp3",
    لانگ: "move-lunges.mp3",
    "جامپینگ جک": "move-jj.mp3",
    "مانتین کلایمر": "move-mc.mp3",
    کرانچ: "move-crunch.mp3",
    "دراز و نشست": "move-situp.mp3",
    "هیپ تراست": "move-hip-thrust.mp3",
    "بریج باسن": "move-glute-bridge.mp3",
    "وال سیت": "move-wall-sit.mp3",
    "ساق پا": "move-calf.mp3",
    "جلو بازو": "move-bicep.mp3",
    "دیپ پشت بازو": "move-tricep.mp3",
    "پرس شانه": "move-shoulder.mp3",
    "پرس سینه": "move-bench.mp3",
    "نشر جانب": "move-lateral.mp3",
    "سوئینگ کتل بل": "move-kb-swing.mp3",
    روئینگ: "move-row.mp3",
    "روئینگ خم": "move-bent-row.mp3",
    "زانو بلند": "move-high-knees.mp3",
    "پاشنه به باسن": "move-butt-kicks.mp3",
    "پای بالا": "move-leg-raise.mp3",
    "راشن توییست": "move-russian.mp3",
    "پرش روی باکس": "move-box-jump.mp3",
    "اسکوات پرشی": "move-jump-squat.mp3",
    "اسکوات سومو": "move-sumo.mp3",
    "پلانک بغل": "move-side-plank.mp3",
    "هالو هولد": "move-hollow.mp3",
    "راه رفتن کشاورز": "move-farmer.mp3",
    "بتل روپ": "move-battle.mp3",
    طناب: "move-jump-rope.mp3",
    یوگا: "move-yoga.mp3",
    کشش: "move-stretch.mp3",
    جامپ: "move-jump.mp3",
    دیوارنشینی: "move-divar.mp3",
    "دیوار نشینی": "move-divar-space.mp3"
  };

  const MOVE_EN = {
    اسکوات: "squat",
    "ایر اسکوات": "air squat",
    "گبلت اسکوات": "goblet squat",
    برپی: "burpee",
    پلانک: "plank",
    "شنا سوئدی": "push up",
    بارفیکس: "pull up",
    شنا: "swim",
    ددلیفت: "deadlift",
    "ددلیفت رومانیایی": "romanian deadlift",
    "آر دی ال": "R D L",
    لانج: "lunge",
    لانگز: "lunges",
    لانگ: "lunges",
    "جامپینگ جک": "jumping jack",
    "مانتین کلایمر": "mountain climber",
    کرانچ: "crunch",
    "دراز و نشست": "sit up",
    "هیپ تراست": "hip thrust",
    "بریج باسن": "glute bridge",
    "وال سیت": "wall sit",
    "ساق پا": "calf raise",
    "جلو بازو": "bicep curl",
    "دیپ پشت بازو": "tricep dip",
    "پرس شانه": "shoulder press",
    "پرس سینه": "bench press",
    "نشر جانب": "lateral raise",
    "سوئینگ کتل بل": "kettlebell swing",
    روئینگ: "row",
    "روئینگ خم": "bent over row",
    "زانو بلند": "high knees",
    "پاشنه به باسن": "butt kicks",
    "پای بالا": "leg raise",
    "راشن توییست": "russian twist",
    "پرش روی باکس": "box jump",
    "اسکوات پرشی": "jump squat",
    "اسکوات سومو": "sumo squat",
    "پلانک بغل": "side plank",
    "هالو هولد": "hollow hold",
    "راه رفتن کشاورز": "farmer walk",
    "بتل روپ": "battle rope",
    طناب: "jump rope",
    یوگا: "yoga",
    کشش: "stretch",
    جامپ: "jump",
    دیوارنشینی: "wall sit",
    "دیوار نشینی": "wall sit"
  };

  // اسم انگلیسی → همان کلیپ آفلاین
  Object.keys(MOVE_SAY).forEach((enKey) => {
    const fa = MOVE_SAY[enKey];
    if (fa && MOVE_CLIP[fa] && !MOVE_CLIP[enKey]) MOVE_CLIP[enKey] = MOVE_CLIP[fa];
  });
  Object.keys(MOVE_EN).forEach((fa) => {
    const en = MOVE_EN[fa];
    if (en && MOVE_CLIP[fa]) {
      const k = String(en).toLowerCase();
      if (!MOVE_CLIP[k]) MOVE_CLIP[k] = MOVE_CLIP[fa];
      if (!MOVE_CLIP[en]) MOVE_CLIP[en] = MOVE_CLIP[fa];
    }
  });

  function sayForMove(name) {
    const raw = String(name || "").trim();
    if (!raw) return { text: "", lang: "fa" };
    const key = normMoveKey(raw);
    if (MOVE_SAY[key]) return { text: MOVE_SAY[key], lang: "fa" };
    const compact = key.replace(/\s+/g, "");
    if (MOVE_SAY[compact]) return { text: MOVE_SAY[compact], lang: "fa" };

    // جایگزینی تک‌واژه‌های انگلیسی داخل عبارت
    const parts = key.split(" ");
    let changed = false;
    const out = parts.map((p) => {
      if (MOVE_SAY[p]) {
        changed = true;
        return MOVE_SAY[p];
      }
      return p;
    });
    if (changed) {
      return { text: out.join(" "), lang: "fa" };
    }

    const hasLatin = /[A-Za-z]/.test(raw);
    const hasFa = /[\u0600-\u06FF]/.test(raw);
    if (hasLatin && !hasFa) {
      return { text: raw, lang: "en" };
    }
    return { text: raw, lang: "fa" };
  }

  async function playCachedFaOnly(text, vol) {
    const key = String(text || "").trim().slice(0, 160);
    if (!key) return false;
    try {
      const blob = await loadDynFaFromCache(key);
      if (!blob) return false;
      return playBlobFa(blob, vol);
    } catch {
      return false;
    }
  }

  async function sha1Short(text) {
    const data = new TextEncoder().encode(String(text));
    const hash = await crypto.subtle.digest("SHA-1", data);
    return [...new Uint8Array(hash)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  }

  // کلیپ آفلاین برای هر متن دلخواه که با اسکریپت پخته شده: voice/dyn/{sha1}.mp3
  async function playBakedDynClip(text, vol) {
    const key = String(text || "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (!key || !window.crypto || !crypto.subtle) return false;
    try {
      const h = await sha1Short(key);
      return playVoiceFile("dyn/" + h + ".mp3", vol);
    } catch {
      return false;
    }
  }

  async function playGoogleFaAudio(text, vol, lang) {
    // روش رایج اپ‌های ایرانی: گوگل‌تی‌تی‌اس + پروکسی (روی گوشی ایران مستقیم گوگل اغلب بسته است)
    const key = String(text || "").trim().slice(0, 160);
    if (!key) return false;
    const urls = faTtsUrls(key, lang);
    for (let i = 0; i < urls.length; i++) {
      try {
        try {
          const res = await fetchWithTimeout(urls[i], 7000);
          if (res && res.ok) {
            const blob = await res.blob();
            if (blob && blob.size > 80) {
              await saveDynFaToCache(key, blob);
              const okBlob = await playBlobFa(blob, vol);
              if (okBlob) return true;
            }
          }
        } catch {}
        const a = makeHtmlAudio(urls[i]);
        const ok = await playHtmlAudioEl(a, vol, 10000);
        if (ok) {
          warmFaTts(key);
          return true;
        }
      } catch {}
    }
    return false;
  }

  async function waitVoices(ms) {
    loadVoices();
    if (!window.speechSynthesis) return;
    if ((speechSynthesis.getVoices() || []).length) return;
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      try {
        speechSynthesis.onvoiceschanged = () => {
          loadVoices();
          finish();
        };
      } catch {}
      setTimeout(finish, ms || 500);
    });
    loadVoices();
  }

  async function speakSynthLang(text, vol, lang, opts) {
    if (soundMuted || !text) return false;
    unlockAudio();
    // بعد از پخش mp3، بدون cancel گاهی سیستم ساکت می‌ماند
    try {
      speechSynthesis.cancel();
    } catch {}
    await sleep(isIOSLike() ? 90 : 40);
    try {
      speechSynthesis.resume();
    } catch {}
    await waitVoices(isIOSLike() ? 600 : 300);
    const o = opts || {};
    return speakFaSynthAsync(text, vol, lang, {
      ...o,
      noCancel: true,
      rate: o.rate != null ? o.rate : lang === "fa" ? 1.28 : 1.12,
      pitch: o.pitch != null ? o.pitch : 1.12
    });
  }

  async function playGoogleDirect(text, vol, lang) {
    // فقط لینک مستقیم گوگل — بدون صف طولانی پروکسی
    const key = String(text || "").trim().slice(0, 160);
    if (!key || soundMuted) return false;
    const urls = faTtsUrls(key, lang).slice(0, 2);
    for (let i = 0; i < urls.length; i++) {
      try {
        const a = makeHtmlAudio(urls[i]);
        const ok = await playHtmlAudioEl(a, vol, 7000);
        if (ok) {
          warmFaTts(key);
          return true;
        }
      } catch {}
    }
    return false;
  }

  async function fetchDilaraOnly(text) {
    const key = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!key) return null;
    const cached = await loadDynFaFromCache(key);
    if (cached) return cached;
    // فقط یک تلاش کوتاه — وابسته به لپ‌تاپ نباشد / تمرین را معطل نکند
    const bases = getTtsApiBases().slice(0, 1);
    for (let i = 0; i < bases.length; i++) {
      try {
        const url = bases[i] + "/tts?t=" + encodeURIComponent(key);
        const res = await fetchWithTimeout(url, 2500);
        if (!res || !res.ok) continue;
        const blob = await res.blob();
        if (!blob || blob.size < 80) continue;
        await saveDynFaToCache(key, blob);
        return blob;
      } catch {}
    }
    return null;
  }

  async function playDilaraFa(text, vol) {
    // دیلارا از طریق تونل کلودفلر — روی گوشی ایران معمولاً بهتر از گوگل جواب می‌دهد
    try {
      const blob = await fetchDilaraOnly(text);
      if (!blob) return false;
      return playBlobFa(blob, vol == null ? 1 : vol);
    } catch {
      return false;
    }
  }

  // آوانویسی ماشینی فارسی → لاتین؛ هر متن بی‌ربط را با صدای انگلیسی گوشی می‌خواند
  const FA_ROMAN = {
    "ا": "aa",
    "آ": "aa",
    "ب": "be",
    "پ": "pe",
    "ت": "te",
    "ث": "se",
    "ج": "je",
    "چ": "che",
    "ح": "he",
    "خ": "khe",
    "د": "de",
    "ذ": "ze",
    "ر": "re",
    "ز": "ze",
    "ژ": "zhe",
    "س": "se",
    "ش": "she",
    "ص": "se",
    "ض": "ze",
    "ط": "ta",
    "ظ": "za",
    "ع": "a",
    "غ": "ghe",
    "ف": "fe",
    "ق": "ghe",
    "ک": "ke",
    "ك": "ke",
    "گ": "ge",
    "ل": "le",
    "م": "me",
    "ن": "ne",
    "و": "o",
    "ه": "he",
    "ی": "i",
    "ي": "i",
    "ء": "",
    "\u0654": "",
    "\u200c": " ",
    " ": " ",
    "۰": "0",
    "۱": "1",
    "۲": "2",
    "۳": "3",
    "۴": "4",
    "۵": "5",
    "۶": "6",
    "۷": "7",
    "۸": "8",
    "۹": "9"
  };

  function romanizeFaMachine(text) {
    const s = String(text || "");
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (FA_ROMAN[ch] != null) out += FA_ROMAN[ch] + " ";
      else if (/[A-Za-z0-9]/.test(ch)) out += ch;
      else if (/\s/.test(ch)) out += " ";
    }
    return out.replace(/\s+/g, " ").trim().slice(0, 180);
  }

  async function speakMachineAny(text, vol) {
    // آخرین لایهٔ قطعی: ماشینی، حتی برای حروف بی‌ربط
    const raw = String(text || "").replace(/\s+/g, " ").trim();
    if (!raw) return false;
    const hasFa = /[\u0600-\u06FF]/.test(raw);
    const spoken = hasFa ? romanizeFaMachine(raw) : raw;
    if (!spoken) return false;
    // اول سیستم انگلیسی (روی تقریباً همه گوشی‌ها هست)
    const ok = await speakSynthLang(spoken, vol == null ? 1 : vol, "en", {
      noCancel: true,
      rate: 0.95,
      pitch: 1.05
    });
    if (ok) return true;
    // بعد گوگل انگلیسی
    return playGoogleFaAudio(spoken, vol == null ? 1 : vol, "en");
  }

  async function speakMoveNameOnly(name, vol) {
    const raw = String(name || "").replace(/\s+/g, " ").trim();
    if (!raw) return false;
    const said = sayForMove(raw);
    const v = vol == null ? 0.98 : vol;
    const hasFa = /[\u0600-\u06FF]/.test(raw);
    const hasLatin = /[A-Za-z]/.test(raw);
    const speakText = raw;
    const isEn = hasLatin && !hasFa;
    const keyLow = raw.toLowerCase();

    const clip =
      MOVE_CLIP[raw] ||
      MOVE_CLIP[keyLow] ||
      (said && MOVE_CLIP[said.text]);
    if (clip) {
      const ok = await playVoiceFile(clip, v);
      if (ok) return true;
    }
    {
      const ok = await playBakedDynClip(speakText, v);
      if (ok) return true;
    }
    {
      const ok = await playCachedFaOnly(speakText, v);
      if (ok) return true;
    }

    // انگلیسی: سریع — سیستم بعد گوگل مستقیم (بدون پروکسی طولانی)
    if (isEn) {
      const okS = await speakSynthLang(speakText, v, "en", { noCancel: true });
      if (okS) return true;
      const okG = await playGoogleDirect(speakText, v, "en");
      if (okG) return true;
      return speakMachineAny(speakText, v);
    }

    // فارسی / مخلوط
    {
      const ok = await speakSynthLang(speakText, v, "fa", { noCancel: true });
      if (ok) return true;
    }
    if (said && said.text && said.text !== speakText) {
      const clip2 = MOVE_CLIP[said.text];
      if (clip2) {
        const ok2 = await playVoiceFile(clip2, v);
        if (ok2) return true;
      }
      const ok = await speakSynthLang(said.text, v, "fa", { noCancel: true });
      if (ok) return true;
    }
    {
      const ok = await playGoogleDirect(speakText, v, "fa");
      if (ok) return true;
    }
    // ماشینی: حروف فارسی → لاتین با صدای انگلیسی گوشی (حتی بی‌ربط)
    {
      const ok = await speakMachineAny(speakText, v);
      if (ok) return true;
    }
    {
      const ok = await playDilaraFa(speakText, v);
      if (ok) return true;
    }
    warmFaTts(speakText);
    return false;
  }

  async function speakMoveName(name, vol) {
    return speakMoveNameOnly(name, vol);
  }

  async function speakNextMoveName(name, seq) {
    const ios = isIOSLike();
    const opts = ios ? { noCancel: true } : {};
    const nm = String(name || "").replace(/\s+/g, " ").trim();
    // استراحت ست/حرکت: اول «حرکت بعد» آفلاین، بعد سیستم/گوگل (بدون وابستگی به لپ‌تاپ)
    let pref = await playVoiceFile("phrase-next.mp3", 1);
    if (!pref) pref = await playBakedDynClip("حرکت بعد", 1);
    if (!pref) pref = await playCachedFaOnly("حرکت بعد", 1);
    if (!pref) {
      loadVoices();
      pref = await speakFaSynthAsync("حرکت بعد", 1, "fa", {
        ...opts,
        rate: 1.28,
        pitch: 1.1
      });
    }
    if (!pref) pref = await playGoogleFaAudio("حرکت بعد", 1, "fa");
    if (!pref) pref = await playDilaraFa("حرکت بعد", 1);
    if (seq != null && !announceAlive(seq)) return !!pref;
    // کمی فاصله تا بعد از mp3، صدای سیستم/گوگل قفل نماند
    await sleep(100);
    if (seq != null && !announceAlive(seq)) return false;
    if (!nm) return !!pref;
    return speakMoveNameOnly(nm, 1);
  }

  async function speakCheerOnly(seq) {
    if (seq != null && !announceAlive(seq)) return;
    buzz([55, 30, 90]);
    let ok = await playVoiceFile("cheer-ali.mp3", 0.98);
    if (seq != null && !announceAlive(seq)) return;
    if (!ok) {
      await speakFaSynthAsync("عالی", 1, "fa", { rate: 1.2, pitch: 1.2, noCancel: true });
    }
  }

  async function speakPhase(step) {
    return queueAnnounce(async (seq) => {
      if (!announceAlive(seq)) return;
      const ios = isIOSLike();
      const isRest = step.kind === "rest-set" || step.kind === "rest-move";
      buzz(step.kind === "work" ? [100, 45, 100, 45, 160] : [70, 35, 70, 35, 90]);
      beepWhite(400, false);
      await sleep(ios ? 500 : 350);
      if (!announceAlive(seq)) return;
      if (step.kind === "work") {
        if (step.name) await speakMoveName(step.name, 1);
        return;
      }
      // استراحت بین ست و بین حرکت: حتماً «حرکت بعد» + اسم
      if (isRest) {
        const next = step.nextName || "";
        await speakNextMoveName(next, seq);
        return;
      }
      if (step.nextName) await speakNextMoveName(step.nextName, seq);
    });
  }

  async function speakDoneAmount(sec, total) {
    const n = Math.round(sec);
    const tot = Math.round(total || (run && run.phaseDur) || 0);
    if (n <= 0) return;
    return queueAnnounce(async (seq) => {
      if (!announceAlive(seq)) return;
      await speakCheerOnly(seq);
      if (!announceAlive(seq)) return;
      await sleep(450);
      if (!announceAlive(seq)) return;
      const ofKey = tot + ":" + n;
      if (VOICE_FILES.wentOf && VOICE_FILES.wentOf[ofKey]) {
        let ok = await playVoiceFile("went-" + n + "-of-" + tot + ".mp3", 0.98);
        if (ok) return;
      }
      if (VOICE_FILES.went[n]) {
        let ok = await playVoiceFile("went-" + n + ".mp3", 0.98);
        if (ok) return;
      }
      const phrase =
        tot > 0
          ? faNum(n) + " ثانیه از " + faNum(tot) + " ثانیه رو رفتی"
          : faNum(n) + " ثانیه رو رفتی";
      await speakFaSynthAsync(phrase, 1, "fa", { rate: 1.22, pitch: 1.2 });
    });
  }

  async function speakDone(rounds) {
    return queueAnnounce(async () => {
      const n = Math.round(rounds);
      buzz([90, 50, 90, 50, 140]);
      beepWhite(300);
      await sleep(180);
      if (VOICE_FILES.done[n]) {
        const ok = await playVoiceFile("done-" + n + ".mp3", 0.88);
        if (ok) return;
      }
      await speakFaSynthAsync(faNum(n) + " ست", 0.95);
    });
  }

  function bumpNumber(input, dir) {
    if (!input) return;
    const step = Number(input.step) || 1;
    const min = input.min === "" ? -Infinity : Number(input.min);
    const max = input.max === "" ? Infinity : Number(input.max);
    let v = Number(input.value);
    if (!Number.isFinite(v)) v = Number.isFinite(min) ? min : 0;
    v = Math.round((v + dir * step) / step) * step;
    if (Number.isFinite(min)) v = Math.max(min, v);
    if (Number.isFinite(max)) v = Math.min(max, v);
    input.value = String(v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function wireNumSteppers() {
    $$(".num-step").forEach((wrap) => {
      const input = wrap.querySelector('input[type="number"]');
      if (!input) return;
      wrap.querySelectorAll(".num-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const dir = Number(btn.getAttribute("data-dir")) || 0;
          bumpNumber(input, dir);
        });
      });
    });
  }

  function show(name) {
    viewIds.forEach((k) => {
      const el = document.getElementById("view-" + k);
      if (!el) return;
      el.classList.toggle("on", k === name);
    });
    $$("#navTabs button").forEach((b) => {
      b.classList.toggle("on", b.getAttribute("data-view") === name);
    });
    const tabEdit = $("#tabEdit");
    if (tabEdit) tabEdit.hidden = name !== "edit";
    const topBar = $("#topBar");
    if (topBar) topBar.style.display = name === "run" ? "none" : "";
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function fmt(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function toFaDigits(s) {
    return String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  }

  function fillMoveSelect() {
    const sel = $("#pickFromLib");
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "انتخاب کن…";
    sel.appendChild(blank);
    state.moves.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.name + " · " + m.work + " ثانیه";
      sel.appendChild(opt);
    });
    // بعد از افزودن گزینه داخل اینپوت متنی نیاید؛ سلکت برمی‌گردد اول
    sel.value = "";
    if (cur && [...sel.options].some((o) => o.value === cur)) {
      /* نگه ندار — عمداً خالی بماند تا کشویی اینپوت باز نشود */
    }
  }

  function renderMoves() {
    const ul = $("#moveLib");
    const empty = $("#moveEmpty");
    if (!ul) return;
    ul.innerHTML = "";
    fillMoveSelect();
    if (!state.moves.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    state.moves.forEach((m) => {
      const li = document.createElement("li");
      li.innerHTML = '<div class="row"><div><div class="title"></div><div class="meta"></div></div></div>';
      li.querySelector(".title").textContent = m.name;
      li.querySelector(".meta").textContent = m.work + " ثانیه";
      const row = document.createElement("div");
      row.className = "row";
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn danger sm";
      del.textContent = "حذف";
      del.addEventListener("click", () => {
        state.moves = state.moves.filter((x) => x.id !== m.id);
        save(state);
        renderMoves();
      });
      row.appendChild(del);
      li.appendChild(row);
      ul.appendChild(li);
    });
  }

  function renderPlans() {
    const ul = $("#planList");
    const empty = $("#planEmpty");
    if (!ul) return;
    ul.innerHTML = "";
    if (!state.plans.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    state.plans.forEach((p) => {
      const li = document.createElement("li");
      li.innerHTML =
        '<div class="row"><div><div class="title"></div><div class="meta"></div></div></div><div class="row"></div>';
      li.querySelector(".title").textContent = p.title || autoTitle(p.circuit);
      li.querySelector(".meta").textContent =
        p.circuit.length + " حرکت · " + p.rounds + " ست · استراحت ست " + p.restSet + "ث";
      const actions = li.children[1];
      actions.className = "row actions-row";
      const start = document.createElement("button");
      start.type = "button";
      start.className = "btn primary sm";
      start.textContent = "شروع";
      start.addEventListener("click", () => { unlockAudio(); startRun(p.id); });
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "btn sm";
      edit.textContent = "ویرایش";
      edit.addEventListener("click", () => openEdit(p.id));
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn danger sm";
      del.textContent = "حذف";
      del.addEventListener("click", () => {
        state.plans = state.plans.filter((x) => x.id !== p.id);
        save(state);
        renderPlans();
      });
      actions.append(start, edit, del);
      ul.appendChild(li);
    });
  }

  function renderCircuit() {
    const ol = $("#circuitList");
    if (!ol) return;
    ol.innerHTML = "";
    circuit.forEach((item, idx) => {
      const li = document.createElement("li");
      li.innerHTML = '<div><div class="nm"></div><div class="mt"></div></div>';
      li.querySelector(".nm").textContent = item.name;
      li.querySelector(".mt").textContent = item.work + " ثانیه";
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "btn danger sm";
      rm.textContent = "حذف";
      rm.addEventListener("click", () => {
        circuit.splice(idx, 1);
        renderCircuit();
      });
      li.appendChild(rm);
      ol.appendChild(li);
    });
  }

  function autoTitle(list) {
    if (!list || !list.length) return "ست";
    if (list.length === 1) return list[0].name;
    if (list.length === 2) return list[0].name + " و " + list[1].name;
    return list[0].name + " و " + (list.length - 1) + " حرکت دیگر";
  }

  function openEdit(id) {
    editId = id || null;
    circuit = [];
    if (id) {
      const p = state.plans.find((x) => x.id === id);
      if (!p) return;
      $("#planRounds").value = String(p.rounds);
      $("#planRestSet").value = String(p.restSet);
      $("#planRestMove").value = String(p.restMove);
      circuit = p.circuit.map((c) => ({ ...c }));
    } else {
      $("#planRounds").value = "4";
      $("#planRestSet").value = "40";
      $("#planRestMove").value = "10";
    }
    renderMoves();
    renderCircuit();
    fillMoveSelect();
    show("edit");
  }

  function buildTimeline(plan) {
    const steps = [];
    for (let r = 1; r <= plan.rounds; r++) {
      plan.circuit.forEach((mv, mi) => {
        steps.push({
          kind: "work",
          round: r,
          rounds: plan.rounds,
          moveIndex: mi + 1,
          moveCount: plan.circuit.length,
          name: mv.name,
          dur: Math.max(5, Number(mv.work) || 40)
        });
        const isLastMove = mi === plan.circuit.length - 1;
        const isLastRound = r === plan.rounds;
        if (!isLastMove && plan.restMove > 0) {
          steps.push({
            kind: "rest-move",
            round: r,
            rounds: plan.rounds,
            moveIndex: mi + 1,
            moveCount: plan.circuit.length,
            name: "استراحت",
            nextName: plan.circuit[mi + 1].name,
            dur: Number(plan.restMove) || 0
          });
        }
        if (isLastMove && !isLastRound && plan.restSet > 0) {
          steps.push({
            kind: "rest-set",
            round: r,
            rounds: plan.rounds,
            moveIndex: plan.circuit.length,
            moveCount: plan.circuit.length,
            name: "استراحت ست",
            nextName: plan.circuit[0].name,
            dur: Number(plan.restSet) || 0
          });
        }
      });
    }
    return steps;
  }

  function startRun(id) {
    const p = state.plans.find((x) => x.id === id);
    if (!p || !p.circuit.length) return;
    // دوبار زدن شروع = زوم صدا؛ قفل کوتاه + قطع قبلی
    if (startLock) return;
    startLock = true;
    setTimeout(() => {
      startLock = false;
    }, 700);
    stopLoop();
    stopAllSound();
    const steps = buildTimeline(p);
    unlockAudio();
    startBgKeepAlive();
    // صدا را در پس‌زمینه گرم کن؛ شروع را معطل نکن
    try {
      p.circuit.forEach((c) => {
        warmMoveVoice(c.name);
      });
    } catch {}
    run = {
      planId: p.id,
      title: p.title,
      steps,
      i: 0,
      left: steps[0].dur,
      phaseDur: steps[0].dur,
      paused: false,
      skipped: 0,
      announced: {},
      prevLeftCeil: Math.ceil(steps[0].dur),
      lastTick: performance.now()
    };
    show("run");
    paintRun(false);
    speakPhase(steps[0]);
    loop();
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (tickIv) clearInterval(tickIv);
    tickIv = 0;
  }

  function loop() {
    stopLoop();
    if (!run || run.paused) return;
    run.lastTick = performance.now();
    // setInterval در پس‌زمینه زنده می‌ماند؛ rAF روی گوشی قطع می‌شود
    const tick = () => {
      if (!run || run.paused) return;
      const now = performance.now();
      const dt = (now - run.lastTick) / 1000;
      run.lastTick = now;
      run.left -= dt;
      maybeAnnounce();
      if (run.left <= 0) {
        advance();
        return;
      }
      paintRun(false);
    };
    tick();
    tickIv = setInterval(tick, 200);
  }

  function maybeAnnounce() {
    if (!run) return;
    const step = run.steps[run.i];
    if (!step) return;
    const cur = Math.ceil(run.left);
    const prev = run.prevLeftCeil;
    run.prevLeftCeil = cur;
    if (prev == null) return;

    // وسط فاز فقط برای کار (نه استراحت)
    if (step.kind === "work") {
      const midKey = run.i + ":twoThirds";
      const total = Math.round(run.phaseDur);
      const done = Math.max(1, Math.round((total * 5) / 8));
      const targetLeft = Math.max(1, total - done);
      const lead = 3;
      const fireLeft = targetLeft + lead;
      if (
        total >= 12 &&
        !run.announced[midKey] &&
        prev > fireLeft &&
        cur <= fireLeft
      ) {
        run.announced[midKey] = true;
        speakDoneAmount(done, total);
      }
    }

    // ۴ ثانیه مانده: کار و استراحت (ست و حرکت)
    const softKey = run.i + ":soft4";
    if (run.phaseDur > 5 && !run.announced[softKey] && prev > 4 && cur <= 4) {
      run.announced[softKey] = true;
      beepSoftDouble();
      buzz([90, 40, 120, 40, 140]);
    }
  }

  function advance() {
    if (!run) return;
    stopAllSound();
    run.i += 1;
    if (run.i >= run.steps.length) {
      finishRun();
      return;
    }
    const step = run.steps[run.i];
    run.left = step.dur;
    run.phaseDur = step.dur;
    run.announced = {};
    run.prevLeftCeil = Math.ceil(step.dur);
    run.lastTick = performance.now();
    paintRun(false);
    speakPhase(step);
    loop();
  }

  function paintRun(announceStart) {
    if (!run) return;
    const step = run.steps[run.i];
    const stage = $("#runStage");
    const moveEl = $("#runMove");
    const isRest = step.kind !== "work";
    stage.classList.toggle("work", !isRest);
    stage.classList.toggle("rest", isRest);
    $("#runFrac").innerHTML = toFaDigits(step.round) + "<span>/</span>" + toFaDigits(step.rounds);
    const mc = $("#runMoveCount");
    const mpi = $("#moveProgressItem");
    if (step.kind === "work") {
      $("#runPhase").textContent = "تمرین";
      moveEl.textContent = step.name;
      moveEl.hidden = false;
      if (mc) {
        mc.innerHTML =
          toFaDigits(step.moveIndex) + "<span>/</span>" + toFaDigits(step.moveCount);
      }
      if (mpi) mpi.hidden = false;
      $("#runSub").textContent = "";
    } else {
      $("#runPhase").textContent = step.kind === "rest-set" ? "استراحت ست" : "استراحت";
      // اسم حرکت بعدی فقط داخل کارت پایین؛ بالا تکرار نشود
      moveEl.textContent = "";
      moveEl.hidden = true;
      $("#runSub").textContent = "";
      if (mc) {
        mc.innerHTML =
          toFaDigits(step.moveIndex) + "<span>/</span>" + toFaDigits(step.moveCount);
      }
      if (mpi) mpi.hidden = false;
    }
    $("#runTimer").textContent = fmt(run.left);
    $("#btnPause").textContent = run.paused ? "ادامه" : "توقف";
    paintNext();
  }

  function paintNext() {
    const card = $("#nextCard");
    const flow1 = $("#flow1");
    const flow2 = $("#flow2");
    const row2 = $("#flowRow2");
    const arrow = $("#flowArrow");
    const arrowLead = $("#flowArrowLead");
    if (!card || !run || !flow1) return;
    const step = run.steps[run.i];

    function showOne(text) {
      card.hidden = false;
      card.classList.remove("is-rest-next");
      flow1.textContent = text;
      if (row2) row2.hidden = true;
      if (arrow) arrow.hidden = true;
      if (arrowLead) arrowLead.hidden = true;
      if (flow2) flow2.textContent = "";
    }

    function showFlow(a, b, lead) {
      card.hidden = false;
      flow1.textContent = a;
      if (flow2) flow2.textContent = b;
      if (row2) row2.hidden = false;
      if (arrow) arrow.hidden = false;
      if (arrowLead) arrowLead.hidden = !lead;
    }

    if (step.kind !== "work") {
      if (!step.nextName) {
        card.hidden = true;
        card.classList.remove("is-rest-next");
        if (arrowLead) arrowLead.hidden = true;
        if (arrow) arrow.hidden = true;
        return;
      }
      card.classList.add("is-rest-next");
      // فقط اسم حرکت بعدی + فلش؛ برچسب «حرکت بعدی» تکراری است
      flow1.textContent = step.nextName;
      if (flow2) flow2.textContent = "";
      if (row2) row2.hidden = true;
      if (arrow) arrow.hidden = true;
      if (arrowLead) arrowLead.hidden = false;
      card.hidden = false;
      return;
    }

    card.classList.remove("is-rest-next");

    const next = run.steps[run.i + 1];
    if (!next) {
      card.hidden = true;
      return;
    }

    if (next.kind === "work") {
      showOne(next.name);
      return;
    }

    if (next.nextName) {
      showFlow("استراحت " + toFaDigits(next.dur) + " ثانیه", next.nextName, true);
      return;
    }

    card.hidden = true;
  }

  function finishRun() {
    stopLoop();
    stopAllSound();
    stopBgKeepAlive();
    const last = run && run.steps.length ? run.steps[run.steps.length - 1] : null;
    const rounds = last ? last.rounds : 0;
    run = null;
    $("#doneFrac").innerHTML = toFaDigits(rounds) + "<span>/</span>" + toFaDigits(rounds);
    const msg = $("#doneMsg");
    if (msg) msg.textContent = "تمام شد · " + toFaDigits(rounds) + " ست";
    speakDone(rounds);
    show("done");
  }

  $("#btnNewPlan").addEventListener("click", () => openEdit(null));
  $("#btnCancelEdit").addEventListener("click", () => {
    editId = null;
    show("home");
  });
  $("#btnDoneHome").addEventListener("click", () => show("home"));

  $("#moveForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = ($("#moveName").value || "").trim();
    if (!name) return;
    const work = Math.max(5, Number($("#moveWork").value) || 40);
    state.moves.unshift({ id: uid(), name, work });
    save(state);
    try {
      await warmMoveVoice(name);
    } catch {}
    $("#moveName").value = "";
    renderMoves();
  });

  $("#addToSetForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = ($("#pickMoveName").value || "").trim();
    if (!name) return;
    let work = Math.max(5, Number($("#pickWork").value) || 40);
    const known = state.moves.find((m) => m.name === name);
    if (known) work = Math.max(5, Number($("#pickWork").value) || known.work);
    if (!known) {
      state.moves.unshift({ id: uid(), name, work });
      save(state);
      renderMoves();
    }
    circuit.push({ id: uid(), name, work });
    try {
      await warmMoveVoice(name);
    } catch {}
    $("#pickMoveName").value = "";
    const sel = $("#pickFromLib");
    if (sel) sel.value = "";
    renderCircuit();
    // فوکوس نکن — وگرنه پیشنهادها دوباره داخل اینپوت باز می‌شود
  });

  $("#pickFromLib").addEventListener("change", () => {
    const sel = $("#pickFromLib");
    if (!sel || !sel.value) return;
    const known = state.moves.find((m) => m.id === sel.value);
    if (!known) return;
    $("#pickMoveName").value = known.name;
    $("#pickWork").value = String(known.work);
    warmMoveVoice(known.name);
    // سلکت را خالی کن تا «گزینه» داخل اینپوت متنی نماند
    sel.value = "";
  });

  $("#btnSavePlan").addEventListener("click", () => {
    const rounds = Math.max(1, Math.min(30, Number($("#planRounds").value) || 4));
    const restSet = Math.max(0, Math.min(600, Number($("#planRestSet").value) || 0));
    const restMove = Math.max(0, Math.min(300, Number($("#planRestMove").value) || 0));
    if (!circuit.length) return;
    const title = autoTitle(circuit);
    const payload = {
      title,
      rounds,
      restSet,
      restMove,
      circuit: circuit.map((c) => ({ id: c.id, name: c.name, work: c.work }))
    };
    if (editId) {
      const p = state.plans.find((x) => x.id === editId);
      if (p) Object.assign(p, payload);
    } else {
      state.plans.unshift({ id: uid(), createdAt: Date.now(), ...payload });
    }
    save(state);
    editId = null;
    renderPlans();
    show("home");
  });

  $("#btnPause").addEventListener("click", () => {
    if (!run) return;
    run.paused = !run.paused;
    if (run.paused) {
      stopLoop();
      stopAllSound();
      stopBgKeepAlive();
    } else {
      unlockAudio();
      startBgKeepAlive();
      run.lastTick = performance.now();
      loop();
    }
    paintRun(false);
  });

  $("#btnSkip").addEventListener("click", () => {
    if (!run) return;
    stopAllSound();
    run.skipped = (run.skipped || 0) + 1;
    advance();
  });

  $("#btnAbort").addEventListener("click", () => {
    stopLoop();
    stopAllSound();
    stopBgKeepAlive();
    run = null;
    show("home");
  });

  $$("#navTabs button").forEach((b) => {
    b.addEventListener("click", () => {
      const v = b.getAttribute("data-view");
      if (v === "home") show("home");
      if (v === "moves") {
        renderMoves();
        show("moves");
      }
      if (v === "edit" && !b.hidden) show("edit");
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      resumeBgIfNeeded();
      if (run && !run.paused) {
        run.lastTick = performance.now();
        if (!tickIv) loop();
      }
    } else if (run && !run.paused) {
      resumeBgIfNeeded();
    }
  });
  window.addEventListener("pagehide", () => {
    if (run && !run.paused) resumeBgIfNeeded();
  });
  window.addEventListener("pageshow", () => resumeBgIfNeeded());

  // Unlock audio on first tap (iOS/Android)
  const unlockOnce = () => unlockAudio();
  document.body.addEventListener("pointerdown", unlockOnce, { once: true });
  document.body.addEventListener("touchstart", unlockOnce, { once: true });
  document.body.addEventListener("click", unlockOnce, { once: true });

  wireNumSteppers();
  const muteBtn = $("#btnMute");
  if (muteBtn) {
    muteBtn.addEventListener("click", () => {
      unlockAudio();
      setSoundMuted(!soundMuted);
      if (!soundMuted) {
        // پیش‌نمایش کوتاه زنگ
        beepWhite(300, false);
        buzz([80, 40, 100]);
      }
    });
  }
  paintMuteBtn();
  const verEl = $("#appVer");
  if (verEl) verEl.textContent = "v" + APP_VER;
  renderMoves();
  renderPlans();
  show("home");
})();
