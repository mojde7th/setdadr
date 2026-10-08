(() => {
  const LS = "setdadr-v2";
  const APP_VER = "123";

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
  let skipLock = false;
  let speechWarmed = false;
  let voicePlayer = null;
  let announceSeq = 0;
  let announceChain = Promise.resolve();
  let soundGen = 0;
  const liveAudios = new Set();
  const liveSources = new Set();
  const activeBeeps = [];
  let primedWorkName = "";
  let primedWorkBlob = null;
  let primedWorkAudioBuffer = null;
  let primedExpectName = "";
  const primedHtmlSpeak = new Map(); // key -> { a, url }
  const primedSpeakAudios = new Set();

  function clearPrimedWork() {
    primedWorkName = "";
    primedWorkBlob = null;
    primedWorkAudioBuffer = null;
    primedExpectName = "";
  }

  function normSpeakKey(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک");
  }
  const MUTE_LS = "setdadr-mute";
  let soundMuted = false;
  try {
    soundMuted = localStorage.getItem(MUTE_LS) === "1";
  } catch {
    soundMuted = false;
  }
  const voiceBuf = new Map();
  const VOICE_BASE = "./voice/";
  const VOICE_Q = "?v=123";
  const dynFaAudio = new Map(); // متن → Audio
  const dynFaBlob = new Map(); // متن → Blob کش‌شده
  const DYN_FA_CACHE = "setdadr-fa-tts-v1";
  let tickIv = 0;
  let bgKeepAudio = null;
  let bgKeepOn = false;
  let stickySpeakAudio = null;
  let bgWatchIv = 0;
  let bgCtxKeep = null;
  let wakeLockSentinel = null;
  // سرور دیلارا ابری دائمی (بدون لپ‌تاپ) + اختیاری تونل محلی
  const TTS_API_LS = "setdadr-tts-api";
  const CLOUD_EDGE_TTS = "https://edge-tts.vercel.app/api/tts";
  function rememberTtsApi(base) {
    const u = String(base || "").replace(/\/$/, "");
    if (!u || /trycloudflare\.com/i.test(u)) return;
    try {
      localStorage.setItem(TTS_API_LS, u);
    } catch {}
  }
  function forgetTtsApi(base) {
    const u = String(base || "").replace(/\/$/, "");
    if (!u) return;
    try {
      if (localStorage.getItem(TTS_API_LS) === u) localStorage.removeItem(TTS_API_LS);
    } catch {}
  }
  function scrubStaleTunnelCache() {
    try {
      const saved = localStorage.getItem(TTS_API_LS);
      if (saved && /trycloudflare\.com/i.test(saved)) localStorage.removeItem(TTS_API_LS);
    } catch {}
  }
  function getTtsApiBases() {
    const out = [];
    if (typeof window !== "undefined" && window.SETDADR_TTS_API) {
      const u = String(window.SETDADR_TTS_API || "").replace(/\/$/, "");
      // تونل موقت لپ‌تاپ را دیگر به‌عنوان مسیر اصلی نگیر
      if (u && !/trycloudflare\.com/i.test(u)) out.push(u);
    }
    try {
      const saved = localStorage.getItem(TTS_API_LS);
      if (saved) {
        const u = saved.replace(/\/$/, "");
        if (u && !/trycloudflare\.com/i.test(u) && out.indexOf(u) === -1) out.push(u);
      }
    } catch {}
    try {
      const h = location.hostname;
      if (h === "localhost" || h === "127.0.0.1") out.push("http://127.0.0.1:8787");
    } catch {}
    return [...new Set(out.filter(Boolean))];
  }
  function cloudEdgeUrl(text, voice) {
    return (
      CLOUD_EDGE_TTS +
      "?text=" +
      encodeURIComponent(String(text || "").trim().slice(0, 400)) +
      "&voice=" +
      encodeURIComponent(voice || EDGE_TTS_VOICE_FA)
    );
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

  function isMobileLike() {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    return isIOSLike() || /Android|Mobile|webOS|BlackBerry/i.test(ua);
  }

  function canVibrateApi() {
    try {
      return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
    } catch {
      return false;
    }
  }

  function fireVibrate(pattern) {
    if (!canVibrateApi()) return false;
    try {
      navigator.vibrate(0);
      return navigator.vibrate(pattern && pattern.length ? pattern : [250, 80, 300]) !== false;
    } catch {
      return false;
    }
  }

  function playHapticThump(level) {
    const amp = Math.max(0.7, level == null ? 1.2 : level);
    try {
      unlockAudio();
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      }
      if (!audioCtx) return;
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      const t0 = audioCtx.currentTime + 0.001;
      const hit = (at, freq, dur, g0) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const lp = audioCtx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 200;
        osc.type = "square";
        osc.frequency.setValueAtTime(freq, t0 + at);
        g.gain.setValueAtTime(0.0001, t0 + at);
        g.gain.exponentialRampToValueAtTime(g0 * amp, t0 + at + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        osc.connect(g);
        g.connect(lp);
        lp.connect(audioCtx.destination);
        osc.start(t0 + at);
        osc.stop(t0 + at + dur + 0.02);
      };
      hit(0, 72, 0.1, 1.35);
      hit(0.11, 52, 0.12, 1.45);
      hit(0.26, 40, 0.15, 1.2);
    } catch {}
  }

  // اجباری — گیر ندهد؛ ویبره API + ضربه اسپیکر
  function forceHaptic(kind) {
    const patterns = {
      start: [220, 70, 280],
      warn: [90, 45, 90, 45, 120, 45, 160],
      mid: [140, 50, 160],
      heavy: [320, 90, 420, 90, 550]
    };
    const p = patterns[kind] || patterns.heavy;
    fireVibrate(p);
    playHapticThump(kind === "heavy" ? 1.45 : 1.2);
    setTimeout(() => {
      fireVibrate(p);
      playHapticThump(1.05);
    }, 360);
  }

  function buzz(pattern) {
    fireVibrate(pattern && pattern.length ? pattern : [220, 70, 280, 70, 360]);
    playHapticThump(1.2);
    setTimeout(() => {
      fireVibrate([260, 60, 360]);
      playHapticThump(1.0);
    }, 380);
  }

  function buzzHeavy() {
    forceHaptic("heavy");
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

  function soundAlive(gen, tok) {
    return gen === soundGen && tok === speakToken;
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
    const now = audioCtx ? audioCtx.currentTime : 0;
    const all = activeBeeps.slice();
    if (activeBeep && all.indexOf(activeBeep) === -1) all.push(activeBeep);
    all.forEach((entry) => {
      try {
        if (entry && entry.gain) {
          entry.gain.gain.cancelScheduledValues(now);
          entry.gain.gain.setValueAtTime(0.0001, now);
          try {
            entry.gain.disconnect();
          } catch {}
        }
        const list =
          (entry && entry.oscs) ||
          (entry ? [entry.osc, entry.osc2, entry.osc3].filter(Boolean) : []);
        list.forEach((o) => {
          try {
            o.stop(now);
            o.disconnect();
          } catch {}
        });
      } catch {}
    });
    activeBeeps.length = 0;
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
        voicePlayer.onplaying = null;
        voicePlayer.pause();
        voicePlayer.removeAttribute("src");
        voicePlayer.load();
      }
    } catch {}
    voicePlayer = null;
  }

  function killAllHtmlAudio() {
    const keep = bgKeepAudio;
    liveAudios.forEach((a) => {
      if (keep && a === keep) return;
      if (stickySpeakAudio && a === stickySpeakAudio) return;
      if (primedSpeakAudios.has(a)) return;
      try {
        a.onended = null;
        a.onerror = null;
        a.onplaying = null;
        try {
          a.volume = 0;
          a.muted = true;
        } catch {}
        a.pause();
        try {
          a.removeAttribute("src");
          a.src = "";
        } catch {}
        a.load();
      } catch {}
    });
    liveAudios.clear();
    if (keep) liveAudios.add(keep);
    if (stickySpeakAudio) liveAudios.add(stickySpeakAudio);
    primedSpeakAudios.forEach((a) => liveAudios.add(a));
  }

  function killAllSources() {
    liveSources.forEach((src) => {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {}
    });
    liveSources.clear();
  }

  function stopAllSound() {
    // نسل صدا را عوض کن تا هر پخش/اعلام قبلی بی‌اثر شود
    soundGen += 1;
    announceSeq += 1;
    speakToken += 1;
    announceChain = Promise.resolve();
    stopBeep();
    stopVoiceFile();
    killAllHtmlAudio();
    killAllSources();
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
        // سیستم‌عامل با pause مدیا جلسه را نکشد
        const reassert = () => {
          if (run && !run.paused && !soundMuted) startBgKeepAlive();
        };
        try {
          navigator.mediaSession.setActionHandler("play", reassert);
        } catch {}
        try {
          navigator.mediaSession.setActionHandler("pause", reassert);
        } catch {}
        try {
          navigator.mediaSession.setActionHandler("stop", reassert);
        } catch {}
      }
    } catch {}
  }

  function startCtxKeepAlive() {
    if (soundMuted || !audioCtx) return;
    try {
      if (audioCtx.state === "suspended") audioCtx.resume();
      if (bgCtxKeep) return;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      // فراصوت خیلی ضعیف — وزوز شنیده نشود
      g.gain.value = 0.00003;
      osc.frequency.value = 18000;
      osc.type = "sine";
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start();
      bgCtxKeep = { osc, g };
    } catch {}
  }

  function stopCtxKeepAlive() {
    if (!bgCtxKeep) return;
    try {
      bgCtxKeep.osc.stop();
      bgCtxKeep.osc.disconnect();
      bgCtxKeep.g.disconnect();
    } catch {}
    bgCtxKeep = null;
  }

  async function requestWakeLock() {
    try {
      if (!("wakeLock" in navigator)) return;
      if (wakeLockSentinel) return;
      wakeLockSentinel = await navigator.wakeLock.request("screen");
      try {
        wakeLockSentinel.addEventListener("release", () => {
          wakeLockSentinel = null;
        });
      } catch {}
    } catch {
      wakeLockSentinel = null;
    }
  }

  async function releaseWakeLock() {
    try {
      if (wakeLockSentinel) await wakeLockSentinel.release();
    } catch {}
    wakeLockSentinel = null;
  }

  function startBgWatch() {
    if (bgWatchIv) return;
    bgWatchIv = setInterval(() => {
      if (!run || run.paused || soundMuted) return;
      resumeBgIfNeeded();
      startCtxKeepAlive();
      requestWakeLock();
    }, 3500);
  }

  function stopBgWatch() {
    if (bgWatchIv) clearInterval(bgWatchIv);
    bgWatchIv = 0;
  }

  function makeBeepUrl() {
    try {
      const sr = 22050;
      const sec = 0.32;
      const n = Math.floor(sr * sec);
      const data = new ArrayBuffer(44 + n * 2);
      const view = new DataView(data);
      const w = (o, s) => {
        for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
      };
      w(0, "RIFF");
      view.setUint32(4, 36 + n * 2, true);
      w(8, "WAVE");
      w(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sr, true);
      view.setUint32(28, sr * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      w(36, "data");
      view.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) {
        const x = i / sr;
        const env = Math.min(1, x * 35) * Math.max(0, 1 - x / sec);
        const f = 587 + Math.min(1, x * 4) * 197;
        const sample = Math.sin(2 * Math.PI * f * x) * 0.55 * env;
        let v = (sample * 32767) | 0;
        if (v > 32767) v = 32767;
        if (v < -32768) v = -32768;
        view.setInt16(44 + i * 2, v, true);
      }
      return URL.createObjectURL(new Blob([data], { type: "audio/wav" }));
    } catch {
      return null;
    }
  }

  let cachedBeepUrl = null;
  let cachedWarnBeepUrl = null;

  function makeWarnBeepUrl() {
    try {
      const sr = 22050;
      const sec = 0.1;
      const n = Math.floor(sr * sec);
      const data = new ArrayBuffer(44 + n * 2);
      const view = new DataView(data);
      const w = (o, s) => {
        for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
      };
      w(0, "RIFF");
      view.setUint32(4, 36 + n * 2, true);
      w(8, "WAVE");
      w(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sr, true);
      view.setUint32(28, sr * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      w(36, "data");
      view.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) {
        const x = i / sr;
        const env = Math.min(1, x * 60) * Math.max(0, 1 - x / sec);
        const sample = Math.sin(2 * Math.PI * 988 * x) * 0.6 * env;
        let v = (sample * 32767) | 0;
        if (v > 32767) v = 32767;
        if (v < -32768) v = -32768;
        view.setInt16(44 + i * 2, v, true);
      }
      return URL.createObjectURL(new Blob([data], { type: "audio/wav" }));
    } catch {
      return null;
    }
  }

  function playHtmlBeep() {
    try {
      if (soundMuted) return;
      if (!cachedBeepUrl) cachedBeepUrl = makeBeepUrl();
      if (!cachedBeepUrl) return;
      const a = makeHtmlAudio(cachedBeepUrl);
      a.volume = 1;
      const p = a.play();
      if (p && typeof p.then === "function") p.catch(() => {});
    } catch {}
  }

  function playHtmlWarnBeep() {
    try {
      if (soundMuted) return;
      if (!cachedWarnBeepUrl) cachedWarnBeepUrl = makeWarnBeepUrl();
      if (!cachedWarnBeepUrl) return;
      const a = makeHtmlAudio(cachedWarnBeepUrl);
      a.volume = 1;
      const p = a.play();
      if (p && typeof p.then === "function") p.catch(() => {});
    } catch {}
  }

  function audioOutputOk() {
    try {
      if (document.hidden) return false;
      if (!audioCtx) return false;
      return audioCtx.state === "running";
    } catch {
      return false;
    }
  }

  function makeQuietKeepUrl() {
    // نویز سفید خیلی ضعیف روی ۴۴٫۱ک — وزوز مورچه‌ای نمی‌آید
    try {
      const sr = 44100;
      const sec = 2;
      const n = sr * sec;
      const data = new ArrayBuffer(44 + n * 2);
      const view = new DataView(data);
      const w = (o, s) => {
        for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
      };
      w(0, "RIFF");
      view.setUint32(4, 36 + n * 2, true);
      w(8, "WAVE");
      w(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sr, true);
      view.setUint32(28, sr * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      w(36, "data");
      view.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) {
        const sample = (Math.random() * 2 - 1) * 0.00035;
        let v = (sample * 32767) | 0;
        view.setInt16(44 + i * 2, v, true);
      }
      return URL.createObjectURL(new Blob([data], { type: "audio/wav" }));
    } catch {
      return VOICE_BASE + "silence.wav" + VOICE_Q;
    }
  }

    function startBgKeepAlive() {
    if (soundMuted) return;
    bgKeepOn = true;
    unlockAudio();
    try {
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    } catch {}
    let dead = false;
    if (bgKeepAudio) {
      try {
        if (!bgKeepAudio.src && !bgKeepAudio.currentSrc) dead = true;
        if (bgKeepAudio.paused) dead = dead || false;
      } catch {
        dead = true;
      }
    }
    if (!bgKeepAudio || dead) {
      try {
        if (bgKeepAudio) {
          liveAudios.delete(bgKeepAudio);
          try {
            bgKeepAudio.pause();
          } catch {}
        }
      } catch {}
      const a = makeHtmlAudio(makeQuietKeepUrl());
      a.loop = true;
      a.volume = 0.004;
      a.muted = false;
      bgKeepAudio = a;
    } else {
      try {
        bgKeepAudio.muted = false;
        bgKeepAudio.volume = 0.004;
        bgKeepAudio.loop = true;
      } catch {}
    }
    const p = bgKeepAudio.play();
    if (p && typeof p.then === "function") {
      p.catch(() => {
        bgKeepAudio = null;
      });
    }
    startCtxKeepAlive();
    setMediaPlaying(true, (run && run.title) || "ست‌یار");
    startBgWatch();
    requestWakeLock();
  }

  function stopBgKeepAlive() {
    bgKeepOn = false;
    stopBgWatch();
    stopCtxKeepAlive();
    releaseWakeLock();
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
    if (!run || run.paused || soundMuted) return;
    bgKeepOn = true;
    unlockAudio();
    try {
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    } catch {}
    if (bgKeepAudio) {
      try {
        bgKeepAudio.muted = false;
        bgKeepAudio.volume = 0.004;
      } catch {}
      const p = bgKeepAudio.play();
      if (p && typeof p.then === "function") {
        p.catch(() => {
          bgKeepAudio = null;
          startBgKeepAlive();
        });
      }
    } else {
      startBgKeepAlive();
    }
    startCtxKeepAlive();
    try {
      if (window.speechSynthesis) speechSynthesis.resume();
    } catch {}
    setMediaPlaying(true, (run && run.title) || "ست‌یار");
    startBgWatch();
    requestWakeLock();
  }

  // زنگ گرم باشگاهی — بم، نرم، بدون تیغ؛ برای ساعت‌ها تکرار آزار ندهد
  function playWarmChime(opts) {
    if (soundMuted) return;
    const o = opts || {};
    const gen = soundGen;
    try {
      unlockAudio();
      if (!audioCtx) return;
      const start = () => {
        if (gen !== soundGen) return;
        if (!o.stack) stopBeep();
        if (gen !== soundGen) return;
        const t0 = audioCtx.currentTime + (o.atMs || 0) / 1000;
        const master = audioCtx.createGain();
        // فیلتر باز — صدای گرفته/مخملی ندهد
        const lp = audioCtx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(o.bright ? 7000 : 4500, t0);
        lp.Q.setValueAtTime(0.4, t0);
        const peak = o.peak != null ? o.peak : 0.95;
        const total = o.total != null ? o.total : 0.55;
        master.gain.setValueAtTime(0.0001, t0);
        master.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
        master.gain.setValueAtTime(peak * 0.75, t0 + total * 0.45);
        master.gain.exponentialRampToValueAtTime(0.0001, t0 + total);
        master.connect(lp);
        lp.connect(audioCtx.destination);
        const notes = o.notes || [
          { f: 523.25, at: 0, dur: 0.28, g: 0.7 },
          { f: 659.25, at: 0.1, dur: 0.32, g: 0.8 }
        ];
        const oscs = [];
        notes.forEach((n) => {
          const gt = t0 + n.at;
          const osc = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(n.f, gt);
          g.gain.setValueAtTime(0.0001, gt);
          g.gain.exponentialRampToValueAtTime(n.g, gt + 0.015);
          g.gain.exponentialRampToValueAtTime(0.0001, gt + n.dur);
          osc.connect(g);
          g.connect(master);
          osc.start(gt);
          osc.stop(gt + n.dur + 0.02);
          oscs.push(osc);
        });
        const entry = { osc: oscs[0], gain: master, oscs };
        activeBeep = entry;
        activeBeeps.push(entry);
      };
      if (audioCtx.state === "suspended") audioCtx.resume().then(start).catch(start);
      else start();
    } catch {}
  }

  function beepSoftRing(atMs) {
    // شروع حرکت: یک زنگ بلند بالارونده — مشخصاً «برو»
    if (document.hidden || !audioOutputOk()) {
      setTimeout(() => playHtmlBeep(), atMs || 0);
    }
    playWarmChime({
      atMs: atMs || 0,
      stack: false,
      bright: true,
      peak: 0.72,
      total: 0.7,
      notes: [
        { f: 523.25, at: 0, dur: 0.22, g: 0.45 },
        { f: 659.25, at: 0.12, dur: 0.28, g: 0.55 },
        { f: 880.0, at: 0.28, dur: 0.4, g: 0.65 }
      ]
    });
    setTimeout(() => forceHaptic("start"), 250);
  }

  function beepMidChime() {
    // دیگر برای عالی صدا نمی‌زند؛ نگه داشته شده اگر جایی لازم شد
  }

  function beepSoftDouble() {
    // ۴ ثانیه مانده: سه ضربه کوتاه بم — با زنگ شروع قاطی نمی‌شود
    const tick = (at) => {
      if (document.hidden || !audioOutputOk()) {
        setTimeout(() => playHtmlWarnBeep(), at);
      }
      playWarmChime({
        atMs: at,
        stack: true,
        bright: false,
        peak: 0.8,
        total: 0.18,
        notes: [{ f: 220.0, at: 0, dur: 0.12, g: 0.75 }]
      });
    };
    tick(0);
    setTimeout(() => tick(0), 240);
    setTimeout(() => tick(0), 480);
    setTimeout(() => forceHaptic("warn"), 300);
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
    a._setdadrGen = soundGen;
    a.playsInline = true;
    a.setAttribute("playsinline", "");
    a.setAttribute("webkit-playsinline", "");
    a.preload = "auto";
    a.muted = false;
    liveAudios.add(a);
    const drop = () => {
      try {
        liveAudios.delete(a);
      } catch {}
    };
    a.addEventListener("ended", drop);
    a.addEventListener("error", drop);
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

  function fetchWithTimeout(url, ms, cacheMode) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => {
      try {
        if (ctrl) ctrl.abort();
      } catch {}
    }, ms || 1800);
    return fetch(url, {
      cache: cacheMode || "no-store",
      credentials: "omit",
      signal: ctrl ? ctrl.signal : undefined
    }).finally(() => clearTimeout(timer));
  }

  // اج‌تی‌تی‌اس مستقیم از گوشی (بدون لپ‌تاپ) — فارسی دیلارا / انگلیسی جنی
  const EDGE_TTS_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
  const EDGE_TTS_VOICE_FA = "fa-IR-DilaraNeural";
  const EDGE_TTS_VOICE_EN = "en-US-JennyNeural";
  const EDGE_TTS_VOICE = EDGE_TTS_VOICE_FA;
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

  function synthesizeEdgeTts(text, voiceName) {
    const key = String(text || "").trim().slice(0, 160);
    if (!key) return Promise.resolve(null);
    const voice = voiceName || EDGE_TTS_VOICE_FA;
    const langXml = /^en/i.test(voice) ? "en-US" : "fa-IR";
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
        }, 5500);

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
              "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='" +
              langXml +
              "'>" +
              "<voice name='" +
              voice +
              "'>" +
              "<prosody pitch='+0Hz' rate='+8%' volume='+0%'>" +
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

  function synthesizeEdgeFa(text) {
    return synthesizeEdgeTts(text, EDGE_TTS_VOICE_FA);
  }

  async function playEdgeTts(text, vol, voiceName) {
    try {
      const blob = await synthesizeEdgeTts(text, voiceName);
      if (!blob || blob.size < 80) return false;
      await saveDynFaToCache(String(text || "").trim(), blob);
      return playBlobFa(blob, vol == null ? 1 : vol);
    } catch {
      return false;
    }
  }

  async function fetchFaTtsBlob(text) {
    const key = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!key) return null;
    const cached = await loadDynFaFromCache(key);
    if (cached) return cached;

    const hasFa = /[\u0600-\u06FF]/.test(key);
    const voice = hasFa ? EDGE_TTS_VOICE_FA : EDGE_TTS_VOICE_EN;

    // ۱) ابر دائمی — تایم‌اوت کوتاه تا گرم‌کردن صف اعلام را نکشد
    try {
      const url = cloudEdgeUrl(key, voice);
      let res = await fetchWithTimeout(url, 4500, "no-store");
      if (!res || !res.ok) {
        res = await fetchWithTimeout(
          "https://corsproxy.io/?" + encodeURIComponent(url),
          4500,
          "no-store"
        );
      }
      if (res && res.ok) {
        const blob = await res.blob();
        if (blob && blob.size > 80) {
          await saveDynFaToCache(key, blob);
          return blob;
        }
      }
    } catch {}

    // ۲) سرور خودی اگر تنظیم شده باشد
    const bases = getTtsApiBases();
    for (let i = 0; i < bases.length; i++) {
      try {
        const url = bases[i] + "/tts?t=" + encodeURIComponent(key);
        const res = await fetchWithTimeout(url, 7000, "no-store");
        if (!res || !res.ok) {
          forgetTtsApi(bases[i]);
          continue;
        }
        const blob = await res.blob();
        if (!blob || blob.size < 80) continue;
        if (blob.type && blob.type.indexOf("audio") === -1 && blob.size < 500) continue;
        rememberTtsApi(bases[i]);
        await saveDynFaToCache(key, blob);
        return blob;
      } catch {
        forgetTtsApi(bases[i]);
      }
    }

    // ۳) اج مستقیم گوشی
    try {
      const edgeBlob = await synthesizeEdgeTts(key.slice(0, 160), voice);
      if (edgeBlob && edgeBlob.size > 80) {
        await saveDynFaToCache(key, edgeBlob);
        return edgeBlob;
      }
    } catch {}

    // ۴) گوگل انگلیسی
    if (!hasFa) {
      const urls = faTtsUrls(key.slice(0, 160), "en").slice(0, 4);
      for (let i = 0; i < urls.length; i++) {
        try {
          const res = await fetchWithTimeout(urls[i], 4000, "no-store");
          if (!res || !res.ok) continue;
          const blob = await res.blob();
          if (!blob || blob.size < 80) continue;
          await saveDynFaToCache(key, blob);
          return blob;
        } catch {}
      }
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
    const gen = soundGen;
    if (a._setdadrGen != null && a._setdadrGen !== gen) return false;
    unlockAudio();
    stopVoiceFile();
    try {
      a.pause();
      a.currentTime = 0;
    } catch {}
    if (gen !== soundGen) return false;
    try {
      a.muted = false;
    } catch {}
    a.volume = Math.max(0.05, Math.min(1, vol == null ? 0.98 : vol));
    voicePlayer = a;
    const waitCap = maxWaitMs != null ? maxWaitMs : 12000;
    const startCap = Math.min(document.hidden ? 8000 : 2800, waitCap);
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
        resolve(!!ok && gen === soundGen);
      };
      a.onplaying = () => {
        if (gen !== soundGen || (a._setdadrGen != null && a._setdadrGen !== soundGen)) {
          try {
            a.volume = 0;
            a.muted = true;
            a.pause();
          } catch {}
          finish(false);
          return;
        }
        heard = true;
      };
      a.onended = () => finish(true);
      a.onerror = () => finish(false);
      if (gen !== soundGen) {
        finish(false);
        return;
      }
      const p = a.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          if (gen !== soundGen) {
            try {
              a.pause();
            } catch {}
            finish(false);
          }
        }).catch(() => finish(false));
      }
      setTimeout(() => {
        if (done) return;
        if (gen !== soundGen) {
          try {
            a.pause();
          } catch {}
          finish(false);
          return;
        }
        if (heard || (a.currentTime || 0) > 0.02) {
          const left = Math.max(
            500,
            Math.min(waitCap, (isFinite(a.duration) ? a.duration * 1000 : 5000) + 800)
          );
          setTimeout(() => {
            if (gen !== soundGen) {
              try {
                a.pause();
              } catch {}
              finish(false);
              return;
            }
            finish(true);
          }, left);
          return;
        }
        try {
          a.pause();
        } catch {}
        finish(false);
      }, startCap);
    });
  }

  async function playBlobFa(blob, vol) {
    if (!blob) return false;
    const gen = soundGen;
    try {
      unlockAudio();
      if (gen !== soundGen) return false;
      // اول HTML Audio — روی گوشی پایدارتر شنیده می‌شود
      try {
        const url = URL.createObjectURL(blob);
        const a = makeHtmlAudio(url);
        dynFaAudio.set(String(url), a);
        const ok = await playHtmlAudioEl(a, vol, 10000);
        setTimeout(() => {
          try {
            URL.revokeObjectURL(url);
          } catch {}
        }, 20000);
        if (ok) return true;
      } catch {}
      if (gen !== soundGen) return false;
      // بکگراند: فقط HTML؛ WebAudio اغلب بدون صدا true برمی‌گرداند
      if (document.hidden) return false;
      if (audioCtx) {
        try {
          if (audioCtx.state === "suspended") await audioCtx.resume();
          if (gen !== soundGen) return false;
          if (audioCtx.state !== "running") return false;
          const raw = await blob.arrayBuffer();
          if (gen !== soundGen) return false;
          const buf = await audioCtx.decodeAudioData(raw.slice(0));
          if (gen !== soundGen) return false;
          stopVoiceFile();
          await new Promise((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              resolve();
            };
            if (gen !== soundGen) {
              finish();
              return;
            }
            const src = audioCtx.createBufferSource();
            const g = audioCtx.createGain();
            g.gain.value = Math.max(0.05, Math.min(1, vol == null ? 0.98 : vol));
            src.buffer = buf;
            src.connect(g);
            g.connect(audioCtx.destination);
            liveSources.add(src);
            voicePlayer = src;
            const drop = () => {
              try {
                liveSources.delete(src);
              } catch {}
              finish();
            };
            src.onended = drop;
            src.start();
            setTimeout(() => {
              if (gen !== soundGen) {
                try {
                  src.stop();
                } catch {}
                try {
                  liveSources.delete(src);
                } catch {}
              }
              finish();
            }, Math.min(8000, (buf.duration + 0.4) * 1000));
          });
          return gen === soundGen;
        } catch {}
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
      const gen = soundGen;
      const tok = speakToken;
      if (!soundAlive(gen, tok)) return false;
      unlockAudio();
      // گوشی: اول HTML Audio (قطعی‌تر از WebAudio روی اندروید/آیفون)
      {
        const htmlOk = await playVoiceFileHtml(rel, vol);
        if (!soundAlive(gen, tok)) return false;
        if (htmlOk) return true;
      }
      if (!audioCtx) return false;
      if (audioCtx.state === "suspended") {
        try {
          await audioCtx.resume();
        } catch {}
      }
      if (!soundAlive(gen, tok)) return false;
      stopVoiceFile();
      const buf = await loadVoiceBuffer(rel);
      if (!buf || !soundAlive(gen, tok)) return false;
      const gain = Math.max(0.05, Math.min(1, vol == null ? 0.98 : vol));
      await new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        if (gen !== soundGen) {
          finish();
          return;
        }
        const src = audioCtx.createBufferSource();
        const g = audioCtx.createGain();
        g.gain.value = gain;
        src.buffer = buf;
        src.connect(g);
        g.connect(audioCtx.destination);
        liveSources.add(src);
        voicePlayer = src;
        src.onended = () => {
          liveSources.delete(src);
          finish();
        };
        src.start();
        setTimeout(() => {
          if (gen !== soundGen) {
            try {
              src.stop();
            } catch {}
            liveSources.delete(src);
          }
          finish();
        }, Math.min(8000, (buf.duration + 0.4) * 1000));
      });
      return gen === soundGen;
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
            // فقط اگر واقعاً شروع شده — speaking خالی روی گوشی را موفق نگیر
            done(!!started);
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
    scout: "اسکوات",
    scaut: "اسکوات",
    sqaut: "اسکوات",
    squatt: "اسکوات",
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
    const key = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
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
    try {
      speechSynthesis.cancel();
    } catch {}
    await sleep(isIOSLike() ? 50 : 25);
    try {
      speechSynthesis.resume();
    } catch {}
    await waitVoices(isIOSLike() ? 280 : 120);
    const o = opts || {};
    return speakFaSynthAsync(text, vol, lang, {
      ...o,
      noCancel: true,
      rate: o.rate != null ? o.rate : lang === "fa" ? 1.32 : 1.38,
      pitch: o.pitch != null ? o.pitch : 1.1
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
    // مثل اسنپ/تپسی: سرور TTS هر جمله را می‌سازد (دیلارا)
    const bases = getTtsApiBases();
    for (let i = 0; i < bases.length; i++) {
      const base = bases[i];
      if (!base) continue;
      try {
        const url = base + "/tts?t=" + encodeURIComponent(key);
        const res = await fetchWithTimeout(url, 8000, "no-store");
        if (!res || !res.ok) {
          forgetTtsApi(base);
          continue;
        }
        const blob = await res.blob();
        if (!blob || blob.size < 80) continue;
        rememberTtsApi(base);
        await saveDynFaToCache(key, blob);
        return blob;
      } catch {
        forgetTtsApi(base);
      }
    }
    return null;
  }

  async function playDilaraFa(text, vol) {
    try {
      unlockAudio();
      const blob = await fetchDilaraOnly(text);
      if (!blob) return false;
      return playBlobFa(blob, vol == null ? 1 : vol);
    } catch {
      return false;
    }
  }

  async function cacheCloudEdgeBlob(text, voiceName) {
    const key = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!key) return null;
    const cached = await loadDynFaFromCache(key);
    if (cached) return cached;
    const hasFa = /[\u0600-\u06FF]/.test(key);
    const voice =
      voiceName || (hasFa ? EDGE_TTS_VOICE_FA : EDGE_TTS_VOICE_EN);
    const url = cloudEdgeUrl(key, voice);
    const tries = [url, "https://corsproxy.io/?" + encodeURIComponent(url)];
    for (let i = 0; i < tries.length; i++) {
      try {
        const res = await fetchWithTimeout(tries[i], 7000, "no-store");
        if (!res || !res.ok) continue;
        const blob = await res.blob();
        if (!blob || blob.size < 80) continue;
        await saveDynFaToCache(key, blob);
        return blob;
      } catch {}
    }
    return null;
  }

  async function ensureSpeakBlob(text, maxMs) {
    const key = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!key) return null;
    try {
      const hit = await loadDynFaFromCache(key);
      if (hit) return hit;
    } catch {}
    const wait = maxMs != null ? maxMs : document.hidden ? 5000 : 3500;
    try {
      return await Promise.race([
        cacheCloudEdgeBlob(key),
        sleep(wait).then(() => null)
      ]);
    } catch {
      return null;
    }
  }

  function dropPrimedHtml(key) {
    const slot = primedHtmlSpeak.get(key);
    if (!slot) return;
    try {
      primedSpeakAudios.delete(slot.a);
      liveAudios.delete(slot.a);
      slot.a.pause();
      slot.a.removeAttribute("src");
      slot.a.load();
    } catch {}
    try {
      URL.revokeObjectURL(slot.url);
    } catch {}
    primedHtmlSpeak.delete(key);
  }

  async function primeHtmlSpeak(text) {
    const key = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!key || soundMuted) return false;
    try {
      let blob = await loadDynFaFromCache(key);
      if (!blob) blob = await ensureSpeakBlob(key, document.hidden ? 7000 : 5000);
      if (!blob) return false;
      dropPrimedHtml(key);
      const url = URL.createObjectURL(blob);
      const a = makeHtmlAudio(url);
      a.preload = "auto";
      try {
        a.load();
      } catch {}
      primedSpeakAudios.add(a);
      primedHtmlSpeak.set(key, { a, url, key, blob });
      return true;
    } catch {
      return false;
    }
  }

  async function playPrimedHtmlSpeak(text, vol) {
    const key = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!key || soundMuted) return false;
    const gen = soundGen;
    const tok = speakToken;
    if (!soundAlive(gen, tok)) return false;
    let slot = primedHtmlSpeak.get(key);
    if (!slot) {
      const okPrime = await primeHtmlSpeak(key);
      if (!okPrime || !soundAlive(gen, tok)) return false;
      slot = primedHtmlSpeak.get(key);
    }
    if (!slot) return false;
    startBgKeepAlive();
    unlockAudio();
    const a = slot.a;
    const v = vol == null ? 1 : vol;
    try {
      a.muted = false;
      a.volume = Math.max(0.2, Math.min(1, v));
      a.pause();
      a.currentTime = 0;
    } catch {}
    // پخش همان عنصر از قبل بافرشده — در بکگراند پایدارتر از Audio جدید
    return await new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        try {
          a.onplaying = null;
          a.onended = null;
          a.onerror = null;
        } catch {}
        startBgKeepAlive();
        resolve(!!ok && soundAlive(gen, tok));
      };
      a.onplaying = () => {};
      a.onended = () => finish(true);
      a.onerror = () => finish(false);
      const p = a.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          if (!soundAlive(gen, tok)) {
            try {
              a.pause();
            } catch {}
            finish(false);
          }
        }).catch(() => finish(false));
      }
      setTimeout(() => {
        if (done) return;
        if (!soundAlive(gen, tok)) {
          finish(false);
          return;
        }
        if (!a.paused || (a.currentTime || 0) > 0.01) {
          const left = Math.max(
            600,
            Math.min(12000, (isFinite(a.duration) ? a.duration * 1000 : 4000) + 500)
          );
          setTimeout(() => finish(true), left);
          return;
        }
        finish(false);
      }, document.hidden ? 4000 : 2500);
    });
  }

  // پخش قطعی اسم: کلیپ ثابت → بلاب تازه → ابر
  function ensureStickySpeakAudio() {
    if (stickySpeakAudio) return stickySpeakAudio;
    const a = new Audio();
    a.playsInline = true;
    a.setAttribute("playsinline", "");
    a.setAttribute("webkit-playsinline", "");
    a.preload = "auto";
    stickySpeakAudio = a;
    liveAudios.add(a);
    return a;
  }

  async function unlockStickySpeakAudio() {
    try {
      const a = ensureStickySpeakAudio();
      // یک پخش بی‌صدای کوتاه روی ژست کاربر تا در بکگراند قفل نماند
      a.src = VOICE_BASE + "silence.wav" + VOICE_Q;
      a.volume = 0.001;
      a.muted = true;
      const p = a.play();
      if (p && typeof p.then === "function") await p.catch(() => {});
      a.pause();
      try {
        a.currentTime = 0;
      } catch {}
      a.muted = false;
      a.volume = 1;
      return true;
    } catch {
      return false;
    }
  }

  async function playBlobSticky(blob, vol) {
    if (!blob || soundMuted) return false;
    const gen = soundGen;
    const tok = speakToken;
    if (!soundAlive(gen, tok)) return false;
    startBgKeepAlive();
    unlockAudio();
    const a = ensureStickySpeakAudio();
    const url = URL.createObjectURL(blob);
    try {
      a.onended = null;
      a.onerror = null;
      a.onplaying = null;
      a.muted = false;
      a.volume = Math.max(0.3, Math.min(1, vol == null ? 1 : vol));
      a.src = url;
      try {
        a.load();
      } catch {}
    } catch {}
    return await new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        setTimeout(() => {
          try {
            URL.revokeObjectURL(url);
          } catch {}
        }, 20000);
        startBgKeepAlive();
        resolve(!!ok && soundAlive(gen, tok));
      };
      a.onended = () => finish(true);
      a.onerror = () => finish(false);
      const p = a.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          if (!soundAlive(gen, tok)) {
            try {
              a.pause();
            } catch {}
            finish(false);
          }
        }).catch(() => finish(false));
      }
      const startCap = document.hidden ? 6000 : 3000;
      setTimeout(() => {
        if (done) return;
        if (!soundAlive(gen, tok)) {
          finish(false);
          return;
        }
        if (!a.paused || (a.currentTime || 0) > 0.02) {
          const left = Math.max(
            700,
            Math.min(14000, (isFinite(a.duration) ? a.duration * 1000 : 5000) + 600)
          );
          setTimeout(() => finish(true), left);
          return;
        }
        finish(false);
      }, startCap);
    });
  }

  async function speakNameNow(text, vol) {
    const key = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!key || soundMuted) return false;
    const gen = soundGen;
    const tok = speakToken;
    if (!soundAlive(gen, tok)) return false;
    const v = vol == null ? 1 : vol;
    startBgKeepAlive();
    unlockAudio();

    // کلیپ آماده
    try {
      const keyLow = key.toLowerCase();
      const said = sayForMove(key);
      const clip =
        (typeof MOVE_CLIP !== "undefined" &&
          (MOVE_CLIP[key] || MOVE_CLIP[keyLow] || (said && MOVE_CLIP[said.text]))) ||
        null;
      if (clip) {
        const ok = await playVoiceFile(clip, v);
        if (!soundAlive(gen, tok)) return false;
        if (ok) return true;
      }
    } catch {}

    // بلاب از کش / پرایم / شبکه
    let blob = null;
    const slot = primedHtmlSpeak.get(key);
    if (slot && slot.blob) blob = slot.blob;
    if (!blob) {
      try {
        blob = await loadDynFaFromCache(key);
      } catch {}
    }
    if (!blob) {
      blob = await ensureSpeakBlob(key, document.hidden ? 7000 : 5000);
    }
    if (!soundAlive(gen, tok)) return false;

    if (blob) {
      // عنصر چسبان — در بکگراند خیلی مطمئن‌تر از Audio جدید
      {
        const ok = await playBlobSticky(blob, v);
        if (ok) return true;
      }
      if (!soundAlive(gen, tok)) return false;
      if (!document.hidden) {
        try {
          const ok2 = await playBlobFa(blob, v);
          startBgKeepAlive();
          if (ok2) return true;
        } catch {}
      }
    }

    if (!soundAlive(gen, tok)) return false;
    if (document.hidden) {
      try {
        blob = await cacheCloudEdgeBlob(key);
      } catch {}
      if (blob && soundAlive(gen, tok)) {
        const ok = await playBlobSticky(blob, v);
        if (ok) return true;
      }
      return false;
    }
    const ok3 = await speakFaAny(key, v);
    startBgKeepAlive();
    return !!ok3;
  }

  // در بکگراند فقط بلاب محلی با HTML — URL مستقیم اغلب پخش نمی‌شود
  async function playTextBgSafe(text, vol) {
    const key = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!key || soundMuted) return false;
    const gen = soundGen;
    const tok = speakToken;
    if (!soundAlive(gen, tok)) return false;
    startBgKeepAlive();
    unlockAudio();
    {
      const ok = await playPrimedHtmlSpeak(key, vol);
      if (ok) return true;
    }
    let blob = null;
    try {
      blob = await loadDynFaFromCache(key);
    } catch {}
    if (!blob) {
      blob = await ensureSpeakBlob(key, document.hidden ? 6000 : 4000);
    }
    if (!soundAlive(gen, tok)) return false;
    if (blob) {
      const ok = await playBlobFa(blob, vol == null ? 1 : vol);
      startBgKeepAlive();
      if (ok) return true;
    }
    if (document.hidden) {
      // یک تلاش نهایی fetch حتی در بکگراند
      try {
        blob = await cacheCloudEdgeBlob(key);
      } catch {}
      if (!soundAlive(gen, tok)) return false;
      if (blob) {
        const ok = await playBlobFa(blob, vol == null ? 1 : vol);
        startBgKeepAlive();
        if (ok) return true;
      }
      return false;
    }
    // پیش‌زمینه: مسیر ابری معمولی
    const ok2 = await playCloudEdgeTts(key, vol == null ? 1 : vol);
    startBgKeepAlive();
    return !!ok2;
  }

  // دیلارای ابری دائمی — بدون لپ‌تاپ (Vercel Edge TTS)
  async function playCloudEdgeTts(text, vol, voiceName) {
    const key = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!key || soundMuted) return false;
    const gen = soundGen;
    const tok = speakToken;
    if (!soundAlive(gen, tok)) return false;
    const hasFa = /[\u0600-\u06FF]/.test(key);
    const voice =
      voiceName || (hasFa ? EDGE_TTS_VOICE_FA : EDGE_TTS_VOICE_EN);
    const url = cloudEdgeUrl(key, voice);
    unlockAudio();

    const tryOnce = async () => {
      if (!soundAlive(gen, tok)) return false;
      // اول کش — در بکگراند شبکه ممکن است دیر باشد
      try {
        const cached = await loadDynFaFromCache(key);
        if (!soundAlive(gen, tok)) return false;
        if (cached) {
          const ok = await playBlobFa(cached, vol == null ? 1 : vol);
          if (ok && soundAlive(gen, tok)) return true;
        }
      } catch {}
      if (!soundAlive(gen, tok)) return false;
      // بکگراند: URL مستقیم را رد کن — فقط بلاب
      if (!document.hidden) {
        try {
          const a = makeHtmlAudio(url);
          if (!soundAlive(gen, tok)) {
            try {
              a.pause();
            } catch {}
            return false;
          }
          const ok = await playHtmlAudioEl(a, vol == null ? 1 : vol, 10000);
          if (ok && soundAlive(gen, tok)) {
            cacheCloudEdgeBlob(key, voice).catch(() => {});
            return true;
          }
        } catch {}
      }
      if (!soundAlive(gen, tok)) return false;
      try {
        const blob = await cacheCloudEdgeBlob(key, voice);
        if (!soundAlive(gen, tok)) return false;
        if (blob) {
          const ok = await playBlobFa(blob, vol == null ? 1 : vol);
          if (ok && soundAlive(gen, tok)) return true;
        }
      } catch {}
      return false;
    };

    if (await tryOnce()) return true;
    if (!soundAlive(gen, tok)) return false;
    await sleep(100);
    if (!soundAlive(gen, tok)) return false;
    return tryOnce();
  }

  async function playGoogleQuick(text, vol, lang) {
    // گوگل‌فا اغلب ۴۰۰ است — برای فارسی وقت تلف نکن
    if (lang === "fa") return false;
    const key = String(text || "").trim().slice(0, 160);
    if (!key || soundMuted) return false;
    const urls = faTtsUrls(key, lang).slice(0, 3);
    for (let i = 0; i < urls.length; i++) {
      try {
        const a = makeHtmlAudio(urls[i]);
        const ok = await playHtmlAudioEl(a, vol, 4500);
        if (ok) {
          warmFaTts(key);
          return true;
        }
      } catch {}
    }
    return false;
  }

  // هر متن فارسی رندوم: ابر دائمی اول (بدون لپ‌تاپ)
  async function speakFaAny(text, vol) {
    const key = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!key || soundMuted) return false;
    const gen = soundGen;
    const tok = speakToken;
    const v = vol == null ? 0.98 : vol;
    unlockAudio();
    startBgKeepAlive();
    const alive = () => soundAlive(gen, tok);
    if (!alive()) return false;
    {
      const ok = await playCachedFaOnly(key, v);
      if (!alive()) return false;
      if (ok) return true;
    }
    {
      const ok = await playBakedDynClip(key, v);
      if (!alive()) return false;
      if (ok) return true;
    }
    if (document.hidden) {
      const ok = await playTextBgSafe(key, v);
      if (!alive()) return false;
      if (ok) return true;
    }
    {
      const ok = await playCloudEdgeTts(key, v, EDGE_TTS_VOICE_FA);
      if (!alive()) return false;
      if (ok) return true;
    }
    {
      const ok = await playEdgeTts(key, v, EDGE_TTS_VOICE_FA);
      if (!alive()) return false;
      if (ok) return true;
    }
    {
      const ok = await playDilaraFa(key, v);
      if (!alive()) return false;
      if (ok) return true;
    }
    {
      const roman = romanizeFaMachine(key);
      if (roman) {
        const ok = await playGoogleQuick(roman, v, "en");
        if (!alive()) return false;
        if (ok) return true;
      }
    }
    return false;
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

  function hashUnit(s) {
    let h = 2166136261;
    const t = String(s || "");
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  function playSyllableTone(unit, vol) {
    return new Promise((resolve) => {
      try {
        if (soundMuted) {
          resolve(false);
          return;
        }
        unlockAudio();
        if (!audioCtx) {
          resolve(false);
          return;
        }
        const run = () => {
          const t0 = audioCtx.currentTime;
          const h = hashUnit(unit);
          const f0 = 240 + (h % 320);
          const dur = 0.1 + Math.min(0.07, String(unit).length * 0.015);
          const peak = Math.max(0.25, Math.min(0.95, (vol == null ? 0.85 : vol) * 0.85));
          const master = audioCtx.createGain();
          const lp = audioCtx.createBiquadFilter();
          lp.type = "lowpass";
          lp.frequency.setValueAtTime(1700, t0);
          master.gain.setValueAtTime(0.0001, t0);
          master.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
          master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
          master.connect(lp);
          lp.connect(audioCtx.destination);
          const o1 = audioCtx.createOscillator();
          const o2 = audioCtx.createOscillator();
          const g1 = audioCtx.createGain();
          const g2 = audioCtx.createGain();
          o1.type = "sine";
          o2.type = "sine";
          o1.frequency.setValueAtTime(f0, t0);
          o2.frequency.setValueAtTime(f0 * 1.5, t0);
          g1.gain.value = 0.75;
          g2.gain.value = 0.22;
          o1.connect(g1);
          o2.connect(g2);
          g1.connect(master);
          g2.connect(master);
          o1.start(t0);
          o2.start(t0);
          o1.stop(t0 + dur + 0.02);
          o2.stop(t0 + dur + 0.02);
          setTimeout(() => resolve(true), dur * 1000 + 25);
        };
        if (audioCtx.state === "suspended") audioCtx.resume().then(run).catch(run);
        else run();
      } catch {
        resolve(false);
      }
    });
  }

  async function speakAppSpell(text, vol) {
    // صدای خود اپ با Web Audio — روی گوشی سکوت مطلق نمی‌ماند
    if (soundMuted) return false;
    const raw = String(text || "").replace(/\s+/g, " ").trim();
    if (!raw) return false;
    const hasFa = /[\u0600-\u06FF]/.test(raw);
    let spoken = hasFa
      ? romanizeFaMachine(raw)
      : raw.toLowerCase().replace(/[^a-z0-9\s]/gi, " ");
    spoken = String(spoken || "").replace(/\s+/g, " ").trim();
    if (!spoken) spoken = "x";
    let units = spoken.split(" ").filter(Boolean);
    if (units.length === 1 && units[0].length > 4) {
      units = units[0].match(/.{1,2}/g) || units;
    }
    units = units.slice(0, 28);
    unlockAudio();
    buzz([18]);
    for (let i = 0; i < units.length; i++) {
      const ok = await playSyllableTone(units[i], vol);
      if (!ok) return false;
      if (i < units.length - 1) await sleep(28);
    }
    return true;
  }

  async function speakMachineAny(text, vol) {
    // صدای واقعی: هجی لاتین با TTS — بوق آهنگین فقط اگر TTS نبود
    const raw = String(text || "").replace(/\s+/g, " ").trim();
    if (!raw) return false;
    const hasFa = /[\u0600-\u06FF]/.test(raw);
    const spoken = hasFa ? romanizeFaMachine(raw) : raw;
    if (!spoken) return false;
    const ok = await speakSynthLang(spoken, vol == null ? 1 : vol, "en", {
      noCancel: true,
      rate: 1.35,
      pitch: 1.08
    });
    if (ok) return true;
    const okG = await playGoogleDirect(spoken, vol == null ? 1 : vol, "en");
    if (okG) return true;
    return false;
  }

  async function speakMoveNameOnly(name, vol) {
    const raw = String(name || "").replace(/\s+/g, " ").trim();
    if (!raw) return false;
    const gen = soundGen;
    const tok = speakToken;
    const alive = () => soundAlive(gen, tok);
    if (!alive()) return false;
    const said = sayForMove(raw);
    const v = vol == null ? 0.98 : vol;
    const hasFa = /[\u0600-\u06FF]/.test(raw);
    const hasLatin = /[A-Za-z]/.test(raw);
    const speakText = raw;
    const isEn = hasLatin && !hasFa;
    const keyLow = raw.toLowerCase();

    if (isEn) {
      {
        const ok = await playCachedFaOnly(speakText, v);
        if (!alive()) return false;
        if (ok) return true;
      }
      {
        const ok = await playBakedDynClip(speakText, v);
        if (!alive()) return false;
        if (ok) return true;
      }
      {
        const ok = await playCloudEdgeTts(speakText, v, EDGE_TTS_VOICE_EN);
        if (!alive()) return false;
        if (ok) return true;
      }
      {
        const ok = await playGoogleQuick(speakText, v, "en");
        if (!alive()) return false;
        if (ok) return true;
      }
      {
        const ok = await playEdgeTts(speakText, v, EDGE_TTS_VOICE_EN);
        if (!alive()) return false;
        if (ok) return true;
      }
      return false;
    }

    const clip =
      MOVE_CLIP[raw] ||
      MOVE_CLIP[keyLow] ||
      (said && MOVE_CLIP[said.text]);
    if (clip) {
      const ok = await playVoiceFile(clip, v);
      if (!alive()) return false;
      if (ok) return true;
    }
    {
      const ok = await speakFaAny(speakText, v);
      if (!alive()) return false;
      if (ok) return true;
    }
    if (alive()) warmFaTts(speakText);
    return false;
  }

  async function speakMoveName(name, vol) {
    return speakMoveNameOnly(name, vol);
  }

  async function primeMoveAudio(name, blob) {
    const nm = normSpeakKey(name);
    if (!nm || !blob) return false;
    // اگر حرکت عوض شده، پرایم قدیمی را ننشان
    if (primedExpectName && primedExpectName !== nm) return false;
    try {
      unlockAudio();
      if (!audioCtx) return false;
      if (audioCtx.state === "suspended") await audioCtx.resume();
      const raw = await blob.arrayBuffer();
      const buf = await audioCtx.decodeAudioData(raw.slice(0));
      if (primedExpectName && primedExpectName !== nm) return false;
      primedWorkName = nm;
      primedWorkBlob = blob;
      primedWorkAudioBuffer = buf;
      try {
        await saveDynFaToCache(nm, blob);
      } catch {}
      return true;
    } catch {
      return false;
    }
  }

  async function ensurePrimedFor(name) {
    const nm = normSpeakKey(name);
    if (!nm) return false;
    if (primedWorkName === nm && primedWorkAudioBuffer) return true;
    primedExpectName = nm;
    let blob = null;
    if (primedWorkName === nm && primedWorkBlob) blob = primedWorkBlob;
    if (!blob) blob = await loadDynFaFromCache(nm);
    if (!blob) blob = await cacheCloudEdgeBlob(nm);
    if (!blob) return false;
    return primeMoveAudio(nm, blob);
  }

  async function playPrimedWorkName(name, vol) {
    const nm = normSpeakKey(name);
    if (!nm || primedWorkName !== nm) return false;
    const gen = soundGen;
    // در بکگراند WebAudio غالباً ساکت است — از بلاب HTML بگو
    if (document.hidden || !audioCtx || !primedWorkAudioBuffer) {
      if (primedWorkName === nm && primedWorkBlob) {
        return playBlobFa(primedWorkBlob, vol == null ? 1 : vol);
      }
      return false;
    }
    try {
      unlockAudio();
      if (audioCtx.state === "suspended") await audioCtx.resume();
      if (gen !== soundGen) return false;
      if (audioCtx.state !== "running") {
        if (primedWorkBlob) return playBlobFa(primedWorkBlob, vol == null ? 1 : vol);
        return false;
      }
      stopVoiceFile();
      await new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        if (gen !== soundGen) {
          finish();
          return;
        }
        const src = audioCtx.createBufferSource();
        const g = audioCtx.createGain();
        g.gain.value = Math.max(0.05, Math.min(1, vol == null ? 0.98 : vol));
        src.buffer = primedWorkAudioBuffer;
        src.connect(g);
        g.connect(audioCtx.destination);
        liveSources.add(src);
        voicePlayer = src;
        src.onended = () => {
          liveSources.delete(src);
          finish();
        };
        src.start();
        setTimeout(() => {
          if (gen !== soundGen) {
            try {
              src.stop();
            } catch {}
            liveSources.delete(src);
          }
          finish();
        }, Math.min(8000, (primedWorkAudioBuffer.duration + 0.4) * 1000));
      });
      return gen === soundGen;
    } catch {
      return false;
    }
  }

  async function speakNextMoveName(name, seq) {
    const raw = String(name || "").replace(/\s+/g, " ").trim();
    const nm = normSpeakKey(raw);
    const gen = soundGen;
    const tok = speakToken;
    const alive = () =>
      soundAlive(gen, tok) && (seq == null || announceAlive(seq));
    if (!alive()) return false;
    startBgKeepAlive();
    // گرم‌کردن کش بدون مسدود کردن اعلام
    if (nm) {
      primedExpectName = nm;
      cacheCloudEdgeBlob(nm).catch(() => {});
    }
    let pref = await playVoiceFile("phrase-next.mp3", 1);
    if (!alive()) return false;
    if (!pref) pref = await speakFaAny("حرکت بعد", 1);
    if (!alive()) return false;
    if (!nm) return !!pref;
    await sleep(90);
    if (!alive()) return false;
    let said = false;
    if (document.hidden) {
      // بکگراند: اول بلاب چسبان
      said = await speakNameNow(nm, 1);
    }
    if (!said && alive()) said = await speakMoveNameOnly(nm, 1);
    if (!said && alive()) said = await speakFaAny(nm, 1);
    if (!said && alive()) said = await playCloudEdgeTts(nm, 1);
    if (!said && alive()) said = await speakNameNow(nm, 1);
    if (alive() && nm) {
      cacheCloudEdgeBlob(nm).catch(() => {});
      ensurePrimedFor(nm).catch(() => {});
    }
    return !!said;
  }

  async function speakCheerOnly(seq) {
    if (seq != null && !announceAlive(seq)) return;
    // بدون بوق — فقط صدای عالی
    let ok = await playVoiceFile("cheer-ali.mp3", 0.98);
    if (seq != null && !announceAlive(seq)) return;
    if (!ok) await speakFaAny("عالی", 1);
  }

  async function speakPhase(step) {
    return queueAnnounce(async (seq) => {
      if (!announceAlive(seq)) return;
      const isRest = step.kind === "rest-set" || step.kind === "rest-move";
      // برای کار: اسم را زود گرم کن
      const warmWork =
        step.kind === "work" && step.name ? warmFaTts(step.name) : Promise.resolve();
      if (step.kind === "work") {
        // بوق تمیز اول؛ ویبره با تأخیر داخل خود بوق
        startBgKeepAlive();
        beepSoftRing(0);
        const nm = normSpeakKey(step.name);
        const gen = soundGen;
        const tok = speakToken;
        if (nm) {
          primedExpectName = nm;
          warmWork.catch(() => {});
          ensurePrimedFor(nm).catch(() => {});
        }
        // آخرین حرکت ست: اسم حرکت اول ست بعد را از قبل گرم کن
        try {
          if (
            run &&
            step.moveIndex === step.moveCount &&
            step.round < step.rounds
          ) {
            const nxt = run.steps[run.i + 1];
            if (nxt && nxt.kind === "rest-set" && nxt.nextName) {
              warmFaTts(nxt.nextName).catch(() => {});
              ensurePrimedFor(nxt.nextName).catch(() => {});
            }
          }
        } catch {}
        // در ۲ث کش را گرم کن؛ اعلام با مسیر قبلی
        if (nm) cacheCloudEdgeBlob(nm).catch(() => {});
        const t0 = Date.now();
        while (Date.now() - t0 < 2000) {
          if (!announceAlive(seq) || !soundAlive(gen, tok)) return;
          unlockAudio();
          startBgKeepAlive();
          try {
            if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume();
          } catch {}
          await sleep(250);
        }
        if (!announceAlive(seq) || !soundAlive(gen, tok)) return;
        unlockAudio();
        startBgKeepAlive();
        try {
          if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume();
        } catch {}
        if (!nm) return;
        let ok = false;
        if (document.hidden) {
          ok = await speakNameNow(nm, 1);
        }
        if (!ok && announceAlive(seq) && soundAlive(gen, tok)) {
          ok = await speakMoveNameOnly(nm, 1);
        }
        if (!ok && announceAlive(seq) && soundAlive(gen, tok)) {
          ok = await speakFaAny(nm, 1);
        }
        if (!ok && announceAlive(seq) && soundAlive(gen, tok)) {
          ok = await playCloudEdgeTts(nm, 1);
        }
        if (!ok && announceAlive(seq) && soundAlive(gen, tok)) {
          ok = await speakNameNow(nm, 1);
        }
        if (primedExpectName === nm) clearPrimedWork();
        return;
      }
      startBgKeepAlive();
      const nextEarly = isRest ? step.nextName || "" : "";
      if (nextEarly) {
        cacheCloudEdgeBlob(normSpeakKey(nextEarly)).catch(() => {});
        warmFaTts(nextEarly).catch(() => {});
      }
      beepSoftRing(0);
      const restGap = step.kind === "rest-set" ? 200 : 120;
      await sleep(restGap);
      if (!announceAlive(seq)) return;
      if (isRest) {
        const next = step.nextName || "";
        if (next) warmFaTts(next).catch(() => {});
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
      await sleep(120);
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
      await speakFaAny(phrase, 1);
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
      await speakFaAny(faNum(n) + " ست", 0.95);
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
    unlockStickySpeakAudio().catch(() => {});
    forceHaptic("heavy");
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
        // بدون بوق وسط — فقط عالی + ثانیه
        speakDoneAmount(done, total);
      }
    }

    // ۴ ثانیه مانده: کار و استراحت (ست و حرکت)
    const softKey = run.i + ":soft4";
    if (run.phaseDur > 5 && !run.announced[softKey] && prev > 4 && cur <= 4) {
      run.announced[softKey] = true;
      beepSoftDouble();
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
    // یک تیک صبر تا قطع صدای قبلی کامل بنشیند، بعد اعلام جدید
    const myGen = soundGen;
    const mySeq = announceSeq;
    setTimeout(() => {
      if (!run || soundGen !== myGen || announceSeq !== mySeq) return;
      // قطع دوباره قبل از اعلام — صدای دیررس فاز قبل وارد نشود
      stopBeep();
      killAllHtmlAudio();
      killAllSources();
      stopVoiceFile();
      unlockAudio();
      startBgKeepAlive();
      if (!run || soundGen !== myGen || announceSeq !== mySeq) return;
      speakPhase(step);
    }, 380);
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
    if (!run || skipLock) return;
    skipLock = true;
    setTimeout(() => {
      skipLock = false;
    }, 450);
    unlockAudio();
    stopAllSound();
    killAllHtmlAudio();
    killAllSources();
    stopBeep();
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
        requestWakeLock();
      }
    } else if (run && !run.paused) {
      // رفت تو اپ دیگر — صدا و تایمر و ویبره باید زنده بمانند
      unlockAudio();
      startBgKeepAlive();
      resumeBgIfNeeded();
      if (!tickIv) loop();
      requestWakeLock();
      try {
        unlockStickySpeakAudio().catch(() => {});
        const warm = (n) => {
          if (!n) return;
          const k = normSpeakKey(n);
          cacheCloudEdgeBlob(k).catch(() => {});
          ensureSpeakBlob(k, 6000).catch(() => {});
        };
        const st = run.steps[run.i];
        if (st) {
          warm(st.name);
          warm(st.nextName);
        }
        const nxt = run.steps[run.i + 1];
        if (nxt) {
          warm(nxt.name);
          warm(nxt.nextName);
        }
      } catch {}
    }
  });
  window.addEventListener("pagehide", () => {
    if (run && !run.paused) {
      startBgKeepAlive();
      resumeBgIfNeeded();
    }
  });
  window.addEventListener("pageshow", () => resumeBgIfNeeded());
  document.addEventListener("freeze", () => {
    if (run && !run.paused) startBgKeepAlive();
  });
  document.addEventListener("resume", () => resumeBgIfNeeded());

  // Unlock audio on first tap (iOS/Android)
  const unlockOnce = () => {
    unlockAudio();
    fireVibrate([40]);
  };
  document.body.addEventListener("pointerdown", unlockOnce, { once: true });
  document.body.addEventListener("touchstart", unlockOnce, { once: true });
  document.body.addEventListener("click", unlockOnce, { once: true });
  document.body.addEventListener("pointerdown", () => {
    if (run && !run.paused) {
      unlockAudio();
      fireVibrate([30]);
    }
  });

  wireNumSteppers();
  const muteBtn = $("#btnMute");
  if (muteBtn) {
    muteBtn.addEventListener("click", () => {
      unlockAudio();
      setSoundMuted(!soundMuted);
      if (!soundMuted) {
        // پیش‌نمایش کوتاه زنگ
        beepWhite(300, false);
        buzzHeavy();
      }
    });
  }
  paintMuteBtn();
  const verEl = $("#appVer");
  if (verEl) verEl.textContent = "v" + APP_VER;
  scrubStaleTunnelCache();
  try {
    if (window.SETDADR_TTS_API && !/trycloudflare\.com/i.test(String(window.SETDADR_TTS_API))) {
      rememberTtsApi(window.SETDADR_TTS_API);
    }
  } catch {}
  renderMoves();
  renderPlans();
  show("home");
})();
