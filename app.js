(() => {
  const LS = "setdadr-v2";
  const APP_VER = "249";
  // باشگاه: بلند؛ پخش اسم اول HTML تا بعد از await شبکه ساکت نماند
  const VOICE_LOUD = 14;
  const VOICE_STAT_LOUD = 7;

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
  let lastPlanId = null;
  let lastDoneStats = null;
  let run = null;
  let raf = 0;
  let voiceReady = false;
  let faVoice = null;
  let enVoice = null;
  let speakToken = 0;
  let nameSpeechGuard = false;
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
  const VOICE_Q = "?v=249";
  const dynFaAudio = new Map(); // متن → Audio
  const dynFaBlob = new Map(); // متن → Blob کش‌شده
  const DYN_FA_CACHE = "setdadr-fa-tts-v200";
  let tickIv = 0;
  let bgKeepAudio = null;
  let voiceKeepAudio = null;
  let stickySpeakAudio = null;
  let bgKeepOn = false;
  let silentCtxKeep = null;
  let silentCtxGain = null;
  let bgHeartbeatIv = 0;
  let bgWatchIv = 0;
  let bgTickWired = false;
  let lastBgAudioT = 0;
  let wakeLockSentinel = null;
  let quietKeepUrl = "";
  const BG_KEEP_VOL = 0.004;
  const FG_KEEP_VOL = 0.004;
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
  function prefersEdgeWs() {
    // فقط مرورگر اج توکن وب‌سوکت را می‌پذیرد؛ کروم/سافاری گوشی ۴۰۳ می‌گیرند
    try {
      return /Edg\/|EdgA\/|EdgiOS\//.test(navigator.userAgent || "");
    } catch {
      return false;
    }
  }
  let cloudTtsDeadUntil = 0;
  function cloudTtsDead() {
    return Date.now() < cloudTtsDeadUntil;
  }
  function markCloudTtsDead() {
    // ورکر/کلود پشت فیلتر: چند دقیقه نرو تا تمرین گیر نکند
    cloudTtsDeadUntil = Date.now() + 15 * 60 * 1000;
  }
  function getTtsApiBases() {
    const out = [];
    // همیشه ورکر دائمی — حتی اگر tts-endpoint.js از کش قدیمی جا بماند
    out.push("https://setdadr-tts.minasi24100.workers.dev");
    if (typeof window !== "undefined" && window.SETDADR_TTS_API) {
      const u = String(window.SETDADR_TTS_API || "").replace(/\/$/, "");
      // آدرس صریح در tts-endpoint.js — حتی تونل موقت — برای متن زنده روی گوشی
      if (u && out.indexOf(u) === -1) out.push(u);
    }
    try {
      const saved = localStorage.getItem(TTS_API_LS);
      if (saved) {
        const u = saved.replace(/\/$/, "");
        // کش محلی تونل مرده را نگه ندار
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

  const viewIds = ["home", "edit", "run", "done"];

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

  function buzz(pattern) {
    try {
      // ویبره جدا از قطع‌صدا — در باشگاه حس شود
      if (!navigator.vibrate) return;
      const p = pattern && pattern.length ? pattern : [90, 45, 110];
      navigator.vibrate(0);
      navigator.vibrate(p);
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

  function soundAlive(gen, tok) {
    return gen === soundGen && tok === speakToken;
  }

  // بعد از هر await: اگر فاز عوض شده، صدای کهنه را در فاز تازه پخش نکن
  function aliveNow() {
    const gen = soundGen;
    const tok = speakToken;
    return () => gen === soundGen && tok === speakToken && !soundMuted;
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
    // همیشه کیپر را دوباره play کن — بعد از stopAllSound آنلاک اول می‌میرد
    try {
      const a = ensureKeeper();
      a.muted = false;
      a.volume = 0.001;
      a.loop = true;
      try {
        if (!a.src || !keeperOnSilence(a)) a.src = KEEP_SILENCE;
      } catch {
        try {
          a.src = KEEP_SILENCE;
        } catch {}
      }
      const p = a.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
    // پیش‌گرم بوق‌ها تا قبل از مینیمایز در کش/آنلاک باشند
    try {
      ["beep-rest.wav", "beep-soft.wav", "beep-mid.wav", "beep-tick.wav", "beep-start.wav", "cue-pct-30.mp3", "cue-pct-80.mp3"].forEach((rel) => {
        const u = VOICE_BASE + rel + VOICE_Q;
        const pre = new Audio(u);
        pre.preload = "auto";
        pre.load();
      });
      ensureStickySpeakAudio();
      ensureBgCueRail();
    } catch {}
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

  async function playBlobHtmlFirst(blob, vol) {
    if (!blob || soundMuted) return false;
    const gen = soundGen;
    try {
      unlockAudio();
      startBgKeepAlive();
      startSilentCtxKeep();
      try {
        if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume();
      } catch {}
      if (gen !== soundGen) return false;
      const url = URL.createObjectURL(blob);
      const a = makeHtmlAudio(url);
      dynFaAudio.set(String(url), a);
      const ok = await playHtmlAudioEl(a, vol == null ? 1 : Math.min(1, Number(vol) || 1), 12000);
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 20000);
      if (ok && gen === soundGen) return true;
    } catch {}
    if (gen !== soundGen) return false;
    return playBlobFa(blob, vol == null ? 1 : vol, "name");
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
    cutKeeperVoice();
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
    const voice = voiceKeepAudio;
    const sticky = stickySpeakAudio;
    const cue = bgCueRail;
    liveAudios.forEach((a) => {
      if (keep && a === keep) return;
      if (voice && a === voice) return;
      if (sticky && a === sticky) return;
      if (cue && a === cue) return;
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
    if (voiceKeepAudio) liveAudios.add(voiceKeepAudio);
    if (stickySpeakAudio) liveAudios.add(stickySpeakAudio);
    if (bgCueRail) liveAudios.add(bgCueRail);
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
    // silentCtxKeep را نکش — عبور خودکار به AudioContext زنده نیاز دارد
  }

  function startSilentCtxKeep() {
    // عمداً خاموش — اسیلاتور ۱۸ک مور/خش می‌دهد؛ مسیر تازه HTML است
    return false;
  }

  function stopSilentCtxKeep() {
    silentCtxKeep = null;
    silentCtxGain = null;
  }

  // عبور خودکار: HTML آنلاک را نکش
  function softCutForAdvance() {
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
    try {
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    } catch {}
    startBgKeepAlive();
    hushKeeperToSilence();
  }

  function hushKeeperToSilence() {
    try {
      cutKeeperVoice(false);
    } catch {}
    try {
      const a = voiceKeepAudio || ensureKeeper();
      if (!a) return;
      try {
        a.onended = null;
        a.onerror = null;
        a.onplaying = null;
      } catch {}
      try {
        a.loop = true;
        a.muted = false;
        a.volume = 0.001;
        a.src = KEEP_SILENCE;
        const p = a.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {}
    } catch {}
    try {
      if (bgKeepOn && !soundMuted) startBgKeepAlive();
    } catch {}
  }

  function stopAllSound() {
    // نسل صدا را عوض کن تا هر پخش/اعلام قبلی بی‌اثر شود
    soundGen += 1;
    announceSeq += 1;
    speakToken += 1;
    announceChain = Promise.resolve();
    stopBeep();
    stopVoiceFile();
    hushKeeperToSilence();
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
      }
    } catch {}
  }

  // یک عنصر صوتی که با لمس شروع/بعدی آنلاک می‌شود و دیگر عوض نمی‌شود.
  // آیفون عنصر صوتی تازه را بدون لمس پخش نمی‌کند؛ این یکی را چرا.
  const KEEP_SILENCE = VOICE_BASE + "silence.wav" + VOICE_Q;
  let keeperVoice = null;

  function keeperOnSilence(a) {
    try {
      return /silence\.wav/.test(String(a.currentSrc || a.src || ""));
    } catch {
      return false;
    }
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

  function makeQuietKeepUrl() {
    // دیگر نویز dither ساخته نمی‌شود (مور پس‌زمینه)
    return KEEP_SILENCE;
  }

  function startBgWatch() {
    if (bgWatchIv) return;
    bgWatchIv = setInterval(() => {
      if (!run || run.paused || soundMuted) return;
      resumeBgIfNeeded();
      startSilentCtxKeep();
      requestWakeLock();
    }, 3500);
  }

  function stopBgWatch() {
    if (bgWatchIv) clearInterval(bgWatchIv);
    bgWatchIv = 0;
  }

  function keepSilenceAlive() {
    if (soundMuted) return;
    try {
      const bg = ensureBgLoop();
      bg.muted = false;
      bg.loop = true;
      bg.volume = 0.001;
      if (!/silence\.wav/.test(String(bg.currentSrc || bg.src || ""))) {
        bg.src = KEEP_SILENCE;
      }
      if (bg.paused) bg.play().catch(() => {});
    } catch {}
    try {
      if (!keeperVoice) {
        const k = ensureKeeper();
        k.muted = false;
        k.loop = true;
        k.volume = 0.001;
        if (!keeperOnSilence(k)) k.src = KEEP_SILENCE;
        if (k.paused) k.play().catch(() => {});
      }
    } catch {}
  }

  function ensureBgLoop() {
    // مسیر تازه: فقط silence.wav بی‌صدا برای سشن مدیا + تیک تایمر — بدون نویز
    if (bgKeepAudio) return bgKeepAudio;
    const a = makeHtmlAudio(KEEP_SILENCE);
    a.loop = true;
    a.volume = 0.001;
    a.muted = false;
    a.setAttribute("data-setdadr-keep", "1");
    try {
      a.playsInline = true;
      a.setAttribute("playsinline", "");
    } catch {}
    bgKeepAudio = a;
    liveAudios.add(a);
    wireBgAudioTick(a);
    return a;
  }

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



  let bgCueRail = null;
  function ensureBgCueRail() {
    if (bgCueRail) return bgCueRail;
    const a = makeHtmlAudio(KEEP_SILENCE);
    a.loop = false;
    a.volume = 0;
    a.muted = false;
    a.setAttribute("data-setdadr-cue", "1");
    try {
      a.playsInline = true;
      a.setAttribute("playsinline", "");
    } catch {}
    bgCueRail = a;
    liveAudios.add(a);
    try {
      const p = a.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          try {
            a.pause();
            a.currentTime = 0;
            a.volume = 0;
          } catch {}
        }).catch(() => {});
      }
    } catch {}
    return a;
  }

  function stopCueRail() {
    try {
      beepFourSecWarning._on = false;
    } catch {}
    try {
      beepMidExact._on = false;
    } catch {}
    try {
      const a = bgCueRail;
      if (!a) return;
      a.onended = null;
      a.onerror = null;
      a.pause();
      a.volume = 0;
      a.src = KEEP_SILENCE;
    } catch {}
  }

  function playBgCueFile(rel, vol, opts) {
    if (soundMuted || !rel) return Promise.resolve(false);
    const o = opts || {};
    const src = VOICE_BASE + rel + VOICE_Q;
    const v = Math.max(0.85, Math.min(1, vol == null ? 1 : Number(vol) || 1));
    const waitMs = Math.max(3000, Math.min(10000, o.waitMs || 8000));
    unlockAudio();
    startBgKeepAlive();
    const a = ensureBgCueRail();
    try {
      a.pause();
    } catch {}
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok, cut) => {
        if (done) return;
        done = true;
        try {
          a.onended = null;
          a.onerror = null;
        } catch {}
        if (cut !== false) {
          try {
            a.pause();
            a.volume = 0;
            a.src = KEEP_SILENCE;
          } catch {}
        }
        resolve(!!ok);
      };
      try {
        a.loop = false;
        a.muted = false;
        a.volume = v;
        a.onended = () => finish(true);
        a.onerror = () => finish(false);
        a.src = src;
        const p = a.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => finish(false));
        }
        // فقط اگر هنوز شروع نشده؛ وسط بوق بلند را قطع نکن
        setTimeout(() => {
          if (done) return;
          if (!a.paused && (a.currentTime || 0) > 0.05) {
            // هنوز دارد پخش می‌شود — صبر تا onended یا سقف
            setTimeout(() => {
              if (!done) finish(true);
            }, Math.max(500, waitMs - 2800));
            return;
          }
          finish(false);
        }, 2800);
      } catch {
        finish(false);
      }
    });
  }

  function ensureKeeper() {
    // عنصر جدا برای تلفظ — حلقهٔ پس‌زمینه را قطع نکند
    if (voiceKeepAudio) return voiceKeepAudio;
    const a = makeHtmlAudio(KEEP_SILENCE);
    a.loop = true;
    a.volume = 0.001;
    a.setAttribute("data-setdadr-voice", "1");
    voiceKeepAudio = a;
    liveAudios.add(a);
    return a;
  }

  function wireBgAudioTick(a) {
    if (bgTickWired || !a) return;
    bgTickWired = true;
    lastBgAudioT = 0;
    const onTu = () => {
      if (!run || run.paused || soundMuted) return;
      if (!isAppHidden()) return;
      // با مینیمایز setInterval می‌میرد؛ تیک را از پخش صدا بران
      try {
        const t = Number(a.currentTime) || 0;
        let dt = t - lastBgAudioT;
        if (dt < 0) dt = 0.05;
        if (dt > 1.2) dt = 0.25;
        lastBgAudioT = t;
        if (dt > 0.02) {
          run.left -= dt;
          maybeAnnounce();
          if (run.left <= 0) {
            advance();
            return;
          }
          paintRun(false);
        }
      } catch {}
    };
    try {
      a.addEventListener("timeupdate", onTu);
      a.addEventListener("playing", () => {
        lastBgAudioT = Number(a.currentTime) || 0;
      });
    } catch {}
  }


  function wireMediaSessionKeep() {
    try {
      if (!navigator.mediaSession) return;
      const kick = () => {
        if (soundMuted || !run || run.paused) return;
        startBgKeepAlive();
        startSilentCtxKeep();
      };
      // سیستم‌عامل با زدن مکث نتواند سشن تمرین را بکشد
      navigator.mediaSession.setActionHandler("pause", kick);
      navigator.mediaSession.setActionHandler("play", kick);
      navigator.mediaSession.setActionHandler("stop", kick);
    } catch {}
  }

  function startBgHeartbeat() {
    if (bgHeartbeatIv) return;
    bgHeartbeatIv = setInterval(() => {
      if (!run || run.paused || soundMuted) return;
      if (!isAppHidden()) return;
      try {
        if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      } catch {}
      keepSilenceAlive();
      try {
        ensureBgCueRail();
      } catch {}
      setMediaPlaying(true, (run && (run.title || "تمرین")) || "ست‌یار");
      requestWakeLock();
    }, 1200);
  }

  function stopBgHeartbeat() {
    if (!bgHeartbeatIv) return;
    clearInterval(bgHeartbeatIv);
    bgHeartbeatIv = 0;
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
      bgKeepAudio = null;
      bgTickWired = false;
      ensureBgLoop();
    }
    keepSilenceAlive();
    try {
      ensureBgCueRail();
    } catch {}
    startSilentCtxKeep();
    setMediaPlaying(true, (run && (run.title || "تمرین")) || "ست‌یار");
    wireMediaSessionKeep();
    startBgWatch();
    requestWakeLock();
    if (isAppHidden()) startBgHeartbeat();
  }

  function stopBgKeepAlive() {
    bgKeepOn = false;
    stopBgHeartbeat();
    stopBgWatch();
    cutKeeperVoice();
    setMediaPlaying(false);
    stopSilentCtxKeep();
    releaseWakeLock();
    const a = bgKeepAudio;
    if (!a) return;
    try {
      a.onended = null;
      a.onerror = null;
      a.pause();
      a.removeAttribute("src");
      a.load();
    } catch {}
    bgKeepAudio = null;
    bgTickWired = false;
  }

  function resumeBgIfNeeded() {
    if (!run || run.paused || soundMuted) return;
    bgKeepOn = true;
    unlockAudio();
    try {
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    } catch {}
    keepSilenceAlive();
    startSilentCtxKeep();
    try {
      if (window.speechSynthesis) speechSynthesis.resume();
    } catch {}
    setMediaPlaying(true, (run && (run.title || "تمرین")) || "ست‌یار");
    startBgWatch();
    requestWakeLock();
    if (isAppHidden()) startBgHeartbeat();
    else stopBgHeartbeat();
  }

  function cutKeeperVoice(handover, force) {
    if (nameSpeechGuard && !handover && !force) return;
    const kv = keeperVoice;
    if (kv) kv.finish(false, handover);
  }

  // پخش روی همان عنصر آنلاک‌شده؛ موفق فقط وقتی واقعاً شروع به پخش کند
  function playOnKeeper(src, vol, opts) {
    const o = opts || {};
    if (!src || soundMuted) return Promise.resolve(false);
    if (o.gen != null && o.gen !== soundGen) return Promise.resolve(false);
    const gen = soundGen;
    cutKeeperVoice(true, true);
    unlockAudio();
    startBgKeepAlive();
    const a = ensureKeeper();
    if (gen !== soundGen) return Promise.resolve(false);
    const hidden = isAppHidden();
    const startCap = o.protect
      ? Math.min(Math.max(o.startCap || 3000, 2200), 4500)
      : hidden
        ? Math.min(Math.max(o.startCap || 2800, 2200), 4500)
        : Math.min(o.startCap || 1600, 2200);
    const maxMs = o.protect
      ? Math.min(Math.max(o.maxMs || 12000, 8000), 16000)
      : hidden
        ? Math.min(Math.max(o.maxMs || 12000, 8000), 16000)
        : Math.min(o.maxMs || 9000, 12000);
    return new Promise((resolve) => {
      let done = false;
      let started = false;
      let t1 = 0;
      let t2 = 0;
      const handle = {};
      const onPlaying = () => {
        if (!keeperOnSilence(a)) started = true;
      };
      const onTime = () => {
        if (!keeperOnSilence(a) && (a.currentTime || 0) > 0.02) started = true;
      };
      const onEnded = () => finish(started);
      const onError = () => finish(false);
      function armSilenceKeep() {
        try {
          a.loop = true;
          a.muted = false;
          a.volume = 0.001;
          a.src = KEEP_SILENCE;
          const p = a.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
        } catch {}
        try {
          keepSilenceAlive();
        } catch {}
      }
      function finish(ok, handover) {
        if (done) return;
        done = true;
        clearTimeout(t1);
        clearTimeout(t2);
        if (keeperVoice === handle) keeperVoice = null;
        try {
          a.removeEventListener("playing", onPlaying);
          a.removeEventListener("timeupdate", onTime);
          a.removeEventListener("ended", onEnded);
          a.removeEventListener("error", onError);
        } catch {}
        if (!handover && voiceKeepAudio === a) armSilenceKeep();
        try {
          if (bgKeepOn && !soundMuted) startBgKeepAlive();
        } catch {}
        resolve(!!ok && gen === soundGen && !soundMuted);
      }
      handle.finish = finish;
      keeperVoice = handle;
      try {
        a.addEventListener("playing", onPlaying);
        a.addEventListener("timeupdate", onTime);
        a.addEventListener("ended", onEnded);
        a.addEventListener("error", onError);
        a.loop = false;
        a.muted = false;
        a.volume = Math.max(0.9, Math.min(1, vol == null ? 1 : vol));
        a.src = src;
        const p = a.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            if (!keeperOnSilence(a)) started = true;
          }).catch((err) => {
            if (err && err.name === "AbortError") return;
            finish(false);
          });
        }
      } catch {
        finish(false);
        return;
      }
      t1 = setTimeout(() => {
        // اگر شروع شده وسط حرف را قطع نکن
        if (!started) finish(false);
      }, startCap);
      t2 = setTimeout(() => finish(started), maxMs);
    });
  }

  // متن دلخواه: اول بلاب کش‌شده، بعد لینک مستقیم ابر (بدون CORS فقط با عنصر صوتی پخش می‌شود)
  async function playTextOnKeeper(key, vol, voice) {
    const gen = soundGen;
    let blob = null;
    try {
      blob = await loadDynFaFromCache(key);
    } catch {}
    if (blob) {
      const url = URL.createObjectURL(blob);
      const ok = await playOnKeeper(url, vol, { startCap: 2500, gen });
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 30000);
      if (ok) return true;
    }
    return playOnKeeper(cloudEdgeUrl(key, voice), vol, { startCap: 2500, maxMs: 25000, gen });
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
        // همیشه بوق‌های قبلی را بکش تا قاطی نشود
        stopBeep();
        if (gen !== soundGen) return;
        const t0 = audioCtx.currentTime + (o.atMs || 0) / 1000;
        const master = audioCtx.createGain();
        const lp = audioCtx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(o.bright ? 1600 : 1200, t0);
        lp.Q.setValueAtTime(0.55, t0);
        const peak = o.peak != null ? o.peak : 3.2;
        const total = o.total != null ? o.total : 0.7;
        master.gain.setValueAtTime(0.0001, t0);
        master.gain.exponentialRampToValueAtTime(peak, t0 + 0.04);
        if (o.flat) {
          // یکنواخت تا نزدیک ته؛ فقط رهاسازی خیلی کوتاه
          master.gain.setValueAtTime(peak, t0 + Math.max(0.08, total - 0.12));
          master.gain.exponentialRampToValueAtTime(0.0001, t0 + total);
        } else {
          master.gain.setValueAtTime(peak * 0.85, t0 + total * 0.55);
          master.gain.exponentialRampToValueAtTime(0.0001, t0 + total);
        }
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
          g1.gain.exponentialRampToValueAtTime(n.g * (o.flat ? 0.95 : 0.7), gt + 0.05);
          if (o.flat) {
            g1.gain.setValueAtTime(n.g * 0.9, gt + Math.max(0.08, n.dur - 0.08));
            g1.gain.exponentialRampToValueAtTime(0.0001, gt + n.dur);
          } else {
            g1.gain.exponentialRampToValueAtTime(0.0001, gt + n.dur);
          }
          g2.gain.setValueAtTime(0.0001, gt);
          g2.gain.exponentialRampToValueAtTime(n.g * (o.flat ? 0.2 : 0.12), gt + 0.06);
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
        const entry = { osc: oscs[0], gain: master, oscs };
        activeBeep = entry;
        activeBeeps.push(entry);
      };
      if (audioCtx.state === "suspended") audioCtx.resume().then(start).catch(start);
      else start();
    } catch {}
  }

  // پس‌زمینه: اول روی حلقهٔ زندهٔ bgKeep (سشن مدیا)، بعد کیپر آنلاک‌شده
  function restoreBgKeepAfterCue() {
    try {
      if (!bgKeepOn || soundMuted || !run || run.paused) return;
      const a = ensureBgLoop();
      a.loop = true;
      a.muted = false;
      a.volume = 0.001;
      try {
        if (!/silence\.wav/.test(String(a.currentSrc || a.src || ""))) a.src = KEEP_SILENCE;
      } catch {}
      a.play().catch(() => {});
      startBgKeepAlive();
    } catch {}
  }

  function playUnlockedHtmlCue(rel, vol) {
    return playBgCueFile(rel, vol);
  }

  function beepSoftRing(atMs) {
    if (soundMuted) return;
    const fire = () => {
      if (isAppHidden()) {
        playUnlockedHtmlCue("beep-soft.wav", 0.85);
        return;
      }
      playWarmChime({
        atMs: 0,
        stack: false,
        peak: 0.14,
        total: 0.26,
        notes: [
          { f: 329.63, at: 0, dur: 0.18, g: 0.55 },
          { f: 392.0, at: 0.05, dur: 0.2, g: 0.4 }
        ]
      });
    };
    // در پس‌زمینه setTimeout اغلب نمی‌آید — فوری بزن
    if (isAppHidden() || !atMs) fire();
    else setTimeout(fire, atMs);
  }

  function beepCalmLong() {
    if (soundMuted) return;
    unlockAudio();
    startBgKeepAlive();
    if (isAppHidden()) {
      playUnlockedHtmlCue("beep-rest.wav", 1);
      return;
    }
    playWarmChime({
      stack: false,
      peak: 0.95,
      total: 5.0,
      notes: [
        { f: 349.23, at: 0, dur: 1.4, g: 0.95 },
        { f: 392.0, at: 1.1, dur: 1.5, g: 0.9 },
        { f: 329.63, at: 2.3, dur: 1.6, g: 0.85 },
        { f: 261.63, at: 3.5, dur: 1.45, g: 0.75 }
      ]
    });
  }

  function beepSoftDouble() {
    beepSoftRing(0);
    if (isAppHidden()) {
      // بدون setTimeout دوم: همان مسیر آنلاک، دوباره بعد از تمام‌شدن کوتاه
      playUnlockedHtmlCue("beep-soft.wav", 0.85);
      return;
    }
    setTimeout(() => beepSoftRing(0), 520);
  }

  // ۴ ثانیه آخر: بوق استراحت — پس‌زمینه همان مسیر unlocked HTML (نه آماده)
  function beepLastSecond(secLeft) {
    beepClockTick(secLeft);
  }

  function beepClockTick(secLeft) {
    if (soundMuted) return;
    unlockAudio();
    startBgKeepAlive();
    const src = VOICE_BASE + "beep-tick.wav" + VOICE_Q;
    const a = ensureBgCueRail();
    try {
      a.pause();
    } catch {}
    try {
      a.onended = null;
      a.onerror = null;
      a.loop = false;
      a.muted = false;
      a.volume = 1;
      a.src = src;
      const p = a.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          try {
            a.src = src;
            a.volume = 1;
            a.play().catch(() => {});
          } catch {}
        });
      }
    } catch {}
  }

  function beepFourSecWarning() {
    // سازگاری: شروع شمارش ساعت از ۴
    beepClockTick(4);
  }

  function beepMidExact() {
    if (soundMuted) return;
    if (beepMidExact._on) return;
    if (nameSpeechGuard) return;
    beepMidExact._on = true;
    unlockAudio();
    startBgKeepAlive();
    try {
      stopCueRail();
    } catch {}
    const src = VOICE_BASE + "beep-mid.wav" + VOICE_Q;
    const a = ensureBgCueRail();
    try {
      a.pause();
    } catch {}
    try {
      a.onended = () => {
        beepMidExact._on = false;
        try {
          a.volume = 0;
          a.src = KEEP_SILENCE;
        } catch {}
      };
      a.onerror = () => {
        beepMidExact._on = false;
      };
      a.loop = false;
      a.muted = false;
      a.volume = 1;
      a.src = src;
      const p = a.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          beepMidExact._on = false;
        });
      }
      setTimeout(() => {
        beepMidExact._on = false;
      }, 2500);
    } catch {
      beepMidExact._on = false;
    }
  }

  function beepPhaseStart() {
    if (soundMuted) return Promise.resolve(false);
    unlockAudio();
    startBgKeepAlive();
    const src = VOICE_BASE + "beep-start.wav" + VOICE_Q;
    const a = ensureBgCueRail();
    try {
      a.pause();
    } catch {}
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        try {
          a.onended = null;
          a.onerror = null;
        } catch {}
        resolve(!!ok);
      };
      try {
        a.loop = false;
        a.muted = false;
        a.volume = 1;
        a.onended = () => finish(true);
        a.onerror = () => finish(false);
        a.src = src;
        const p = a.play();
        if (p && typeof p.catch === "function") p.catch(() => finish(false));
        setTimeout(() => finish(true), 450);
      } catch {
        finish(false);
      }
    });
  }

  function beepReadyLikeRest() {
    beepLastSecond(4);
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
  // ابر/سوکت گاهی می‌میرد؛ فقط برای ۶۰ ثانیه کنار بگذار، نه برای همیشه
  let cloudBlobDeadUntil = 0;
  let edgeWsDeadUntil = 0;
  function cloudBlobDead() {
    return Date.now() < cloudBlobDeadUntil;
  }
  function markCloudBlobDead() {
    cloudBlobDeadUntil = Date.now() + 60000;
  }
  function edgeWsDead() {
    return Date.now() < edgeWsDeadUntil;
  }
  function markEdgeWsDead() {
    edgeWsDeadUntil = Date.now() + 60000;
  }
  function loudVol(vol, kind) {
    const base = vol == null ? 1 : Number(vol);
    const mult = kind === "stat" ? VOICE_STAT_LOUD : VOICE_LOUD;
    let v = Math.max(0.08, Math.min(10, base * mult));
    // پس‌زمینه: کمی آرام‌تر ولی قابل شنیدن
    try {
      if (document.visibilityState === "hidden") v *= 0.78;
    } catch {}
    return v;
  }

  function isAppHidden() {
    try {
      return document.visibilityState === "hidden";
    } catch {
      return false;
    }
  }

  function htmlVol(vol) {
    // باشگاه: بلند؛ پس‌زمینه کمی کمتر ولی قابل شنیدن
    let v = Math.max(0.55, Math.min(1, vol == null ? 1 : Number(vol) || 1));
    try {
      if (document.visibilityState === "hidden") v = Math.min(v, 0.95);
    } catch {}
    return v;
  }

  function connectLoudOut(srcNode, gainVal) {
    const g = audioCtx.createGain();
    const hp = audioCtx.createBiquadFilter();
    const lp = audioCtx.createBiquadFilter();
    // نرم‌تر: خش و دیستورت کمتر روی گوشی
    hp.type = "highpass";
    hp.frequency.value = 120;
    hp.Q.value = 0.6;
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    lp.Q.value = 0.35;
    const peak = Math.min(Number(gainVal) || 1, 10);
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.05);
    srcNode.connect(hp);
    hp.connect(g);
    g.connect(lp);
    lp.connect(audioCtx.destination);
    return g;
  }


  function edgeUuid() {
    if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
    return (
      Date.now().toString(16) +
      Math.random().toString(16).slice(2) +
      Math.random().toString(16).slice(2)
    ).slice(0, 32);
  }

  function edgeSecMsGec() {
    // GEC v2 (CS64+SHA) — بدون این، وب‌سوکت اج روی گوشی برای متن دلخواه قطع است
    const gecApi =
      typeof globalThis !== "undefined" && globalThis.SetdadrEdgeGec
        ? globalThis.SetdadrEdgeGec
        : typeof window !== "undefined" && window.SetdadrEdgeGec
          ? window.SetdadrEdgeGec
          : null;
    if (!gecApi || typeof gecApi.generateSecMsGecV2 !== "function") return null;
    try {
      return gecApi.generateSecMsGecV2(Date.now() / 1000 + edgeTtsSkew);
    } catch {
      return null;
    }
  }

  function edgeSecMsGecVersion() {
    const gecApi =
      typeof globalThis !== "undefined" && globalThis.SetdadrEdgeGec
        ? globalThis.SetdadrEdgeGec
        : typeof window !== "undefined" && window.SetdadrEdgeGec
          ? window.SetdadrEdgeGec
          : null;
    if (gecApi && gecApi.SEC_MS_GEC_VERSION) return String(gecApi.SEC_MS_GEC_VERSION);
    return "2-" + EDGE_TTS_CHROME;
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
    if (!key || edgeWsDead()) return Promise.resolve(null);
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
        const gec = edgeSecMsGec();
        if (!gec) {
          done(null);
          return;
        }
        const connId = edgeUuid();
        const url =
          "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1" +
          "?TrustedClientToken=" +
          EDGE_TTS_TOKEN +
          "&ConnectionId=" +
          connId +
          "&Sec-MS-GEC=" +
          encodeURIComponent(gec) +
          "&Sec-MS-GEC-Version=" +
          encodeURIComponent(edgeSecMsGecVersion());
        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        const chunks = [];
        let opened = false;
        const killer = setTimeout(() => {
          try {
            ws.close();
          } catch {}
          done(chunks.length ? new Blob(chunks, { type: "audio/mpeg" }) : null);
        }, 5500);

        ws.onopen = () => {
          opened = true;
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
          if (!opened) markEdgeWsDead();
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
    const alive = aliveNow();
    try {
      const blob = await synthesizeEdgeTts(text, voiceName);
      if (!blob || blob.size < 80) return false;
      await saveDynFaToCache(String(text || "").trim(), blob);
      if (!alive()) return false;
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

    const tryEdgeWs = async () => {
      try {
        const edgeBlob = await synthesizeEdgeTts(key.slice(0, 160), voice);
        if (edgeBlob && edgeBlob.size > 80) {
          await saveDynFaToCache(key, edgeBlob);
          return edgeBlob;
        }
      } catch {}
      return null;
    };

    // اج فقط روی مرورگر اج؛ بقیهٔ گوشی‌ها از ای‌پی‌آی دیلارا (تونل/ابر)
    if (prefersEdgeWs()) {
      const edgeFirst = await tryEdgeWs();
      if (edgeFirst) return edgeFirst;
    }

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

    if (!prefersEdgeWs()) {
      const edgeLate = await tryEdgeWs();
      if (edgeLate) return edgeLate;
    }

    // ابر عمومی (ممکن است قطع باشد)
    if (!cloudBlobDead()) {
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
      } catch (err) {
        if (err && err.name === "TypeError") markCloudBlobDead();
      }
    }

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
    a.volume = htmlVol(vol);
    voicePlayer = a;
    const waitCap = maxWaitMs != null ? maxWaitMs : 12000;
    const startCap = Math.min(2800, waitCap);
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

  async function playBlobFa(blob, vol, kind) {
    if (!blob) return false;
    const gen = soundGen;
    const gainVal = loudVol(vol, kind || "name");
    const htmlV = vol == null ? 1 : Math.min(1, Number(vol) || 1);
    try {
      unlockAudio();
      startBgKeepAlive();
      if (gen !== soundGen) return false;
      const url = URL.createObjectURL(blob);
      const revoke = () => {
        setTimeout(() => {
          try {
            URL.revokeObjectURL(url);
          } catch {}
        }, 20000);
      };
      // آیفون / پس‌زمینه: اول کیپر آنلاک — WebAudio و Audio تازه اغلب ساکت‌اند
      if (isIOSLike() || isAppHidden()) {
        try {
          const ok = await playOnKeeper(url, htmlV, { startCap: 2200, maxMs: 12000, gen });
          if (ok && gen === soundGen) {
            revoke();
            return true;
          }
        } catch {}
      }
      // WebAudio بلند (فقط پیش‌زمینه غیرآیفون یا اگر کیپر شکست)
      if (audioCtx && !isAppHidden()) {
        try {
          if (audioCtx.state === "suspended") await audioCtx.resume();
          if (gen !== soundGen) {
            revoke();
            return false;
          }
          const raw = await blob.arrayBuffer();
          if (gen !== soundGen) {
            revoke();
            return false;
          }
          const buf = await audioCtx.decodeAudioData(raw.slice(0));
          if (gen !== soundGen) {
            revoke();
            return false;
          }
          stopVoiceFile();
          let heard = false;
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
            src.buffer = buf;
            connectLoudOut(src, gainVal);
            liveSources.add(src);
            voicePlayer = src;
            src.onended = () => {
              try {
                liveSources.delete(src);
              } catch {}
              heard = true;
              finish();
            };
            try {
              src.start();
              heard = true;
            } catch {
              finish();
              return;
            }
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
            }, Math.min(12000, (buf.duration + 0.4) * 1000));
          });
          if (heard && gen === soundGen) {
            revoke();
            return true;
          }
        } catch {}
      }
      // پشتیبان کیپر / HTML
      try {
        let ok = await playOnKeeper(url, htmlV, { startCap: 3500, maxMs: 10000, gen });
        if (!ok) {
          const a = makeHtmlAudio(url);
          dynFaAudio.set(String(url), a);
          ok = await playHtmlAudioEl(a, htmlV, 10000);
        }
        revoke();
        if (ok) return true;
      } catch {
        revoke();
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
      const v = vol == null ? 1 : vol;
      // پس‌زمینه/آیفون: اول کیپر آنلاک
      if (isAppHidden() || isIOSLike()) {
        const ok = await playOnKeeper(VOICE_BASE + rel + VOICE_Q, v, {
          startCap: 2000,
          maxMs: 10000
        });
        if (!soundAlive(gen, tok)) return false;
        if (ok) return true;
      }
      if (audioCtx) {
        try {
          if (audioCtx.state === "suspended") await audioCtx.resume();
        } catch {}
      }
      if (audioCtx && soundAlive(gen, tok) && !isAppHidden()) {
        stopVoiceFile();
        const buf = await loadVoiceBuffer(rel);
        if (buf && soundAlive(gen, tok)) {
          const gain = loudVol(v, "name");
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
            src.buffer = buf;
            connectLoudOut(src, gain);
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
            }, Math.min(12000, (buf.duration + 0.4) * 1000));
          });
          if (gen === soundGen) return true;
        }
      }
      {
        const ok = await playOnKeeper(VOICE_BASE + rel + VOICE_Q, v, {
          startCap: 2000,
          maxMs: 10000
        });
        if (!soundAlive(gen, tok)) return false;
        if (ok) return true;
      }
      return false;
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
      // noCancel: توکن را بالا نبر — وگرنه speakFaAny بعد از synth زنده نمی‌ماند
      if (!o.noCancel) {
        speakToken += 1;
        if (!ios) {
          try {
            speechSynthesis.cancel();
          } catch {}
        }
      }
      const tok = speakToken;
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
    const key = String(text || "").trim().slice(0, 160);
    if (!key) return false;
    const gen = soundGen;
    const tok = speakToken;
    try {
      const blob = await loadDynFaFromCache(key);
      if (!blob || !soundAlive(gen, tok)) return false;
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
  const bakedHas = new Map();
  // مسیر ثابت وسط حرکت — بدون وابستگی به توکن/صف
  const MID_HALF_CLIP = "dyn/5b47ffb16507f9a1.mp3";
  async function playBakedDynClip(text, vol) {
    const key = String(text || "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (!key || !window.crypto || !crypto.subtle) return false;
    const gen = soundGen;
    try {
      const h = await sha1Short(key);
      const rel = "dyn/" + h + ".mp3";
      if (!bakedHas.has(h)) {
        try {
          const res = await fetchWithTimeout(VOICE_BASE + rel + VOICE_Q, 450, "force-cache");
          bakedHas.set(h, !!(res && res.ok));
        } catch {
          bakedHas.set(h, false);
        }
      }
      if (!bakedHas.get(h)) return false;
      if (gen !== soundGen) return false;
      return playVoiceFile(rel, vol);
    } catch {
      return false;
    }
  }

  async function playMidHalfClipDirect() {
    if (soundMuted) return false;
    const gen = soundGen;
    try {
      unlockAudio();
      startBgKeepAlive();
      try {
        stopBeep();
      } catch {}
      const ok = !!(await playOnKeeper(VOICE_BASE + MID_HALF_CLIP + VOICE_Q, 1, {
        startCap: 2000,
        maxMs: 5000,
        gen
      }));
      return !!(ok && gen === soundGen);
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
    // آیفون: cancel قبل از speak اغلب کل سینث را می‌کشد
    if (!isIOSLike()) {
      try {
        speechSynthesis.cancel();
      } catch {}
      await sleep(25);
    } else {
      await sleep(15);
    }
    try {
      speechSynthesis.resume();
    } catch {}
    await waitVoices(isIOSLike() ? 80 : 40);
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
    // اینترنت معمولی ایران: اگر کلود مرده، سریع برو سراغ صدای محلی گوشی
    if (cloudTtsDead()) return null;
    const bases = getTtsApiBases();
    let anyTried = false;
    for (let i = 0; i < bases.length; i++) {
      const base = bases[i];
      if (!base) continue;
      anyTried = true;
      try {
        const url = base + "/tts?t=" + encodeURIComponent(key);
        const res = await fetchWithTimeout(url, 600, "no-store");
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
    if (anyTried) markCloudTtsDead();
    return null;
  }

  async function playDilaraFa(text, vol) {
    const alive = aliveNow();
    const gen = soundGen;
    try {
      unlockAudio();
      startBgKeepAlive();
      startSilentCtxKeep();
      try {
        if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume();
      } catch {}
      const blob = await fetchDilaraOnly(text);
      if (!blob || !alive() || gen !== soundGen) return false;
      // مسیر پایدار ۱۸۱: WebAudio بلند
      let ok = false;
      try {
        ok = !!(await playBlobFa(blob, vol == null ? 1 : vol));
      } catch {}
      if (ok) return true;
      if (!alive() || gen !== soundGen) return false;
      // پشتیبان: کیپر آنلاک‌شده
      const url = URL.createObjectURL(blob);
      try {
        ok = !!(await playOnKeeper(url, 1, { startCap: 2500, maxMs: 20000, gen }));
      } finally {
        setTimeout(() => {
          try {
            URL.revokeObjectURL(url);
          } catch {}
        }, 30000);
      }
      return !!ok;
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
    if (cloudBlobDead()) return null;
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
      } catch (err) {
        if (i === 0 && err && err.name === "TypeError") {
          markCloudBlobDead();
          return null;
        }
      }
    }
    return null;
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
      try {
        const cached = await loadDynFaFromCache(key);
        if (!soundAlive(gen, tok)) return false;
        if (cached) {
          const ok = await playBlobFa(cached, vol == null ? 1 : vol);
          if (ok && soundAlive(gen, tok)) return true;
        }
      } catch {}
      if (!soundAlive(gen, tok)) return false;
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
    const key = String(text || "").trim().slice(0, 160);
    if (!key || soundMuted) return false;
    const urls = faTtsUrls(key, lang || "fa").slice(0, 3);
    const alive = aliveNow();
    for (let i = 0; i < urls.length; i++) {
      if (!alive()) return false;
      try {
        const a = makeHtmlAudio(urls[i]);
        const ok = await playHtmlAudioEl(a, vol, 16000);
        if (ok) {
          warmFaTts(key);
          return true;
        }
      } catch {}
    }
    return false;
  }

  // هر متن دلخواه فارسی: کلیپ/کش → دیلارا ابری دائمی → اج → سینث فارسی
  // عمداً هیچ مسیر رومن/انگلیسی برای متن فارسی نیست
  async function speakTextChain(key, v, voice, alive) {
    const en = /^en/i.test(voice);
    const hasFa = /[\u0600-\u06FF]/.test(key);
    // کش حافظه — فوری
    {
      const ok = await playCachedFaOnly(key, v);
      if (!alive()) return false;
      if (ok) return true;
    }
    // کلیپ پخته — پروب کوتاه؛ اگر نبود سریع رد شو (بدون فیلترشکن)
    {
      const ok = await playBakedDynClip(key, v);
      if (!alive()) return false;
      if (ok) return true;
    }
    if (en) {
      const ok = await speakSynthLang(key, v, "en", { noCancel: true, rate: 1.2, pitch: 1.05 });
      return !!(ok && alive());
    }
    // صدای فارسی گوشی — بدون انتظار کلود/فیلتر
    {
      const ok = await speakSynthLang(key, v * 0.95, "fa", { noCancel: true, rate: 0.95, pitch: 1.0 });
      if (ok) return true;
      if (!alive()) return false;
    }
    // دیلارا فقط اگر قبلاً زنده بوده؛ تایم‌اوت کوتاه، بلاک نکن
    if (!cloudTtsDead()) {
      const ok = await playDilaraFa(key, v);
      if (ok) return true;
      if (!alive()) return false;
    }
    return false;
  }

  async function speakFaAny(text, vol) {
    const key = String(text || "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!key || soundMuted) return false;
    const gen = soundGen;
    const tok = speakToken;
    const v = vol == null ? 0.98 : vol;
    unlockAudio();
    const alive = () => soundAlive(gen, tok);
    if (!alive()) return false;
    return speakTextChain(key, v, EDGE_TTS_VOICE_FA, alive);
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
    const speakText = (said && said.text) || raw;
    const v = vol == null ? 1 : vol;
    const keyLow = raw.toLowerCase();
    unlockAudio();
    const clip =
      MOVE_CLIP[speakText] ||
      MOVE_CLIP[raw] ||
      MOVE_CLIP[keyLow] ||
      (said && MOVE_CLIP[said.text]);
    if (clip) {
      try {
        const ok = !!(await playOnKeeper(VOICE_BASE + clip + VOICE_Q, v, {
          startCap: 4000,
          maxMs: 20000,
          gen,
          protect: true
        }));
        if (!alive()) return false;
        if (ok) return true;
      } catch {}
    }
    try {
      const ok = !!(await speakFaAny(speakText, v));
      if (!alive()) return false;
      if (ok) return true;
    } catch {}
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
    if (
      !nm ||
      primedWorkName !== nm ||
      !primedWorkAudioBuffer ||
      !audioCtx
    ) {
      return false;
    }
    const gen = soundGen;
    try {
      unlockAudio();
      if (audioCtx.state === "suspended") await audioCtx.resume();
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
        src.buffer = primedWorkAudioBuffer;
        connectLoudOut(src, loudVol(vol == null ? 1 : vol, "name"));
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

  async function speakNextMoveName(name, seq, bare) {
    const raw = String(name || "").replace(/\s+/g, " ").trim();
    const nm = normSpeakKey(raw);
    const gen = soundGen;
    const tok = speakToken;
    const alive = () => soundAlive(gen, tok) && (seq == null || announceAlive(seq));
    if (!alive() || !nm) return false;
    unlockAudio();
    startBgKeepAlive();
    // بوق استراحت را ببند تا با «حرکت بعد» قاطی نشود
    try {
      stopCueRail();
    } catch {}
    try {
      const k = ensureKeeper();
      k.muted = false;
      if (k.paused) {
        k.loop = true;
        k.volume = 0.001;
        k.src = KEEP_SILENCE;
        k.play().catch(() => {});
      }
    } catch {}
    if (!bare) {
      try {
        await playOnKeeper(VOICE_BASE + "phrase-next.mp3" + VOICE_Q, 1, {
          startCap: 2000,
          maxMs: 5000,
          gen
        });
      } catch {}
      if (!alive()) return false;
      await sleep(180);
      if (!alive()) return false;
    }
    let ok = false;
    try {
      ok = await speakMoveNameOnly(nm, 1);
    } catch {}
    if (!alive()) return false;
    if (!ok) {
      try {
        ok = !!(await speakFaAny(nm, 1));
      } catch {}
    }
    return !!(ok && alive());
  }

  async function speakCheerOnly(seq) {
    if (seq != null && !announceAlive(seq)) return;
    buzz([55, 30, 90]);
    let ok = await playVoiceFile("cheer-ali.mp3", 0.98);
    if (seq != null && !announceAlive(seq)) return;
    if (!ok) await speakFaAny("عالی", 1);
  }

  async function speakPhase(step) {
    return queueAnnounce(async (seq) => {
      if (!announceAlive(seq)) return;
      const gen = soundGen;
      const tok = speakToken;
      const alive = () => announceAlive(seq) && soundAlive(gen, tok) && run && run.steps[run.i] === step;
      try {
        buzz(step.kind === "work" ? [50, 20, 60] : [40, 20, 50]);
      } catch {}
      unlockAudio();
      startBgKeepAlive();
      try {
        const k = ensureKeeper();
        k.muted = false;
        k.loop = true;
        k.volume = 0.001;
        if (!k.src) k.src = KEEP_SILENCE;
        k.play().catch(() => {});
      } catch {}
      if (step.kind === "work") {
        const nm = normSpeakKey(step.name);
        if (!nm || !alive()) return;
        // بوق سنگین شروع؛ منتظر شبکه نشو تا هنگ نشود
        try {
          beepPhaseStart();
        } catch {}
        await sleep(360);
        if (!alive()) return;
        nameSpeechGuard = true;
        try {
          let ok = false;
          try {
            ok = !!(await withTimeout(speakMoveNameOnly(nm, 1), 7000, false));
          } catch {}
          if (!alive()) return;
          if (!ok) {
            try {
              ok = !!(await withTimeout(speakFaAny(nm, 1), 5000, false));
            } catch {}
          }
        } finally {
          nameSpeechGuard = false;
        }
        return;
      }
      try {
        stopCueRail();
      } catch {}
      await sleep(200);
      if (!alive()) return;
      nameSpeechGuard = true;
      try {
        await withTimeout(speakNextMoveName(step.nextName || "", seq), 10000, false);
      } finally {
        nameSpeechGuard = false;
      }
    });
  }

  const MUSCLE_META = {
    chest: {
      fa: "سینه",
      tips: [
        "سینه‌ای بزرگ اصلی‌ترین جلوبرندهٔ پرس افقی است؛ کتف‌ها را روی نیمکت/زمین ثابت نگه دار.",
        "فیبرهای میانی سینه با آرنج حدود ۴۵ تا ۷۰ درجه بیشترین تنش مکانیکی را می‌گیرند.",
        "دم در پایین و بازدم در فشار، پایداری قفسه و کنترل اسکاپولا را بهتر می‌کند.",
        "کمی مکث کوتاه در کشش پایین، زمان زیر تنش را بدون تاب اضافه بالا می‌برد."
      ]
    },
    back: {
      fa: "پشت",
      tips: [
        "کشیدن کتف‌ها به هم (رترکشن) قبل از پول، لات و رومبوئید را هدفمندتر درگیر می‌کند.",
        "ستون فقرات خنثی یعنی دیسک کمتر فشرده می‌شود؛ سینه را جلو نگه دار نه گودی افراطی.",
        "شروع حرکت از لگن/کتف، نه از آرنج، بار را از جلوبازو به پشت منتقل می‌کند.",
        "در انتهای دامنه، ۱ ثانیه جمع‌کردن کتف‌ها فعال‌سازی عصبی–عضلانی را بیشتر می‌کند."
      ]
    },
    shoulders: {
      fa: "شانه",
      tips: [
        "دلتوئید میانی با آرنج کمی جلوتر از بدن فشار کمتری به تاندون سوپرااسپیناتوس می‌آورد.",
        "شانه را به گوش نزدیک نکن؛ بالا‌بردن کتف کار ذوزنقه فوقانی را می‌دزدد.",
        "چرخش خارجی ملایم بازو در پرس بالای سر فضای ساب‌آکرومیال را بازتر نگه می‌دارد.",
        "دامنه کنترل‌شده بهتر از وزنهٔ سنگین با قوس کمری جبرانی است."
      ]
    },
    biceps: {
      fa: "جلو بازو",
      tips: [
        "آرنج ثابت نزدیک تنه، تمرکز را روی دوسر بازویی می‌گذارد نه روی تاب تنه.",
        "سوپیناسیون کامل مچ در بالا، سر کوتاه دوسر را بیشتر فعال می‌کند.",
        "فاز پایین ۲ ثانیه‌ای آسیب‌زا نیست؛ تنش اکسنتریک محرک رشد خوبی است.",
        "قفل کامل آرنج در پایین فقط اگر بدون درد باشد؛ کمی خم ملایم مفاصل را حفظ می‌کند."
      ]
    },
    triceps: {
      fa: "پشت بازو",
      tips: [
        "سر بلند سه‌سر در حرکات بالای سر بیشتر کشیده و فعال می‌شود.",
        "آرنج را قفل انفجاری نکن؛ انتهای کنترل‌شده فشار را روی سه‌سر نگه می‌دارد.",
        "بازوها نزدیک بدن در پرس/دیپ، سهم سینه را کم و سهم سه‌سر را زیاد می‌کند.",
        "مکث کوتاه نزدیک قفل، واحدهای حرکتی دیررس سه‌سر را بهتر بیدار می‌کند."
      ]
    },
    core: {
      fa: "میان‌تنه",
      tips: [
        "بریس شکم مثل باد کردن کمربند، فشار داخل‌شکمی و پایداری لومبار را بالا می‌برد.",
        "نفس را کامل حبس نکن؛ الگوی دم–بریس–بازدم کنترل‌شده ایمن‌تر است.",
        "لگن خنثی (نه تیلت جلو افراطی) گودی کمر را از فشارهای تکراری حفظ می‌کند.",
        "فعال‌سازی عرضی شکم قبل از حرکت اندام، نشت نیرو از میان‌تنه را کم می‌کند."
      ]
    },
    quads: {
      fa: "چهارسر ران",
      tips: [
        "زانو هم‌مسیر پنجه بماند تا گشتاور والگوس روی رباط‌ها کمتر شود.",
        "پاشنه روی زمین یعنی گشتاور بهتر روی چهارسر و پایداری مچ.",
        "عمق اسکوات تا جایی که لگن و کمر کنترل دارند؛ عمق بی‌فرم فایده ندارد.",
        "فاز بالا آمدن را عجله نکن؛ شتاب کنترل‌شده واحدهای حرکتی بیشتری را درگیر می‌کند."
      ]
    },
    hamstrings: {
      fa: "پشت ران",
      tips: [
        "لگن را عقب بده (hinge)؛ خم کردن از کمر بار را به دیسک منتقل می‌کند.",
        "کشش اکسنتریک پشت ران در پایین RDL محرک قوی انطباق تاندون–عضله است.",
        "زانوی نرم ثابت، نه قفل خشک، تنش را روی همسترینگ نگه می‌دارد.",
        "احساس کشش پشت ران مهم‌تر از لمس زمین با وزنه است."
      ]
    },
    glutes: {
      fa: "سرینی",
      tips: [
        "در بالای پل/تراست، انقباض کامل سرینی را حس کن نه قوس زیاد کمر.",
        "چرخش خارجی ملایم ران اغلب گلوت مدیوس را برای پایداری لگن بیدار می‌کند.",
        "مکث ۱ ثانیه‌ای در اوج انقباض، ارتباط ذهن–عضله سرینی را قوی‌تر می‌کند.",
        "اگر کمردرد جای باسن می‌سوزد، دامنه را کم کن و بریس میان‌تنه را سفت‌تر بگیر."
      ]
    },
    calves: {
      fa: "ساق",
      tips: [
        "بالا روی پنجه با مکث کوتاه، واحدهای دیررس دوقلو را بهتر خسته می‌کند.",
        "زانوی صاف بیشتر دوقلو؛ زانوی خم بیشتر نعلی را هدف می‌گیرد.",
        "فاز پایین آهسته کشش آپونوروز و ظرفیت نیرو را بهتر می‌سازد.",
        "دامنه کامل بدون جهش، اصطکاک تاندون آشیل را کنترل‌شده‌تر نگه می‌دارد."
      ]
    }
  };

  const MOVE_SCIENCE_TIPS = {
    squat: [
      "اسکوات یک الگوی زنجیرهٔ بسته است؛ چهارسر، سرینی و میان‌تنه هم‌زمان پایداری تولید می‌کنند.",
      "نگاه ثابت جلو به حفظ راستای گردن و تنش تنه کمک می‌کند.",
      "فشار یکنواخت روی هر دو پا از شیفت لگن و بار نامتقارن جلوگیری می‌کند."
    ],
    lunge: [
      "لانگز تعادل تک‌پا را می‌سازد؛ گلوت مدیوس سمت ایستاده پایداری لگن را نگه می‌دارد.",
      "گام نه خیلی بلند نه کوتاه؛ زانوی جلو حدود بالای مچ بماند.",
      "تنه کمی جلوتر از عمود، بار را طبیعی‌تر روی سرینی و چهارسر پخش می‌کند."
    ],
    deadlift: [
      "ددلیفت/آر‌دی‌ال الگوی hinge است؛ قدرت از لگن می‌آید نه از گرد کردن کمر.",
      "میله/وزن نزدیک ساق بماند تا بازوی گشتاور روی کمر کوتاه شود.",
      "قفل لگن در بالا با سرینی؛ هیپرگست کمر جای آن را نگیرد."
    ],
    push: [
      "شنا/پرس سینه زنجیرهٔ سینه‌ای–سه‌سر–دلتوئید قدامی را هم‌زمان بار می‌دهد.",
      "بدن مثل تخته سفت؛ باسن و میان‌تنه نباید شل شوند.",
      "آرنج‌ها را کامل به طرفین باز نکن تا شانه امن‌تر بماند."
    ],
    pull: [
      "بارفیکس/روئینگ عرض پشت و پایداری کتف را هم‌زمان تقویت می‌کند.",
      "شروع با پایین آوردن کتف‌ها، نه فقط خم کردن آرنج.",
      "در پایین دامنه شانه را از گوش دور نگه دار."
    ],
    plank: [
      "پلانک بیشتر پایداری ایزومتریک است تا حرکت؛ نفس را منظم نگه دار.",
      "لگن نه بالا نه پایین؛ خط سر تا پاشنه یکپارچه باشد.",
      "فشار ملایم به کف دست/ساعد، دنده‌ها را پایین و هسته را فعال نگه می‌دارد."
    ],
    glute: [
      "هیپ‌تراست/بریج یکی از مستقیم‌ترین محرک‌های سرینی بزرگ است.",
      "چانه کمی جمع؛ نگاه به جلو از قوس گردن کم می‌کند.",
      "پاها را خیلی دور نگذار؛ زاویه زانو حدود ۹۰ در اوج معمولاً بهینه است."
    ],
    cardio: [
      "برپی و جک‌ها هزینهٔ متابولیک بالا دارند؛ فرم را فدای سرعت نکن.",
      "فرود نرم روی میانی‌پا ضربهٔ مفاصل را کم می‌کند.",
      "بین تکرارها یک بازدم سریع، ریتم قلبی–تنفسی را پایدارتر می‌کند."
    ]
  };

  function moveTipBucket(name) {
    const k = normMuscleKey(name);
    if (/اسکوات|squat|گبلت|سومو/.test(k)) return "squat";
    if (/لانگ|lunge/.test(k)) return "lunge";
    if (/ددلیفت|deadlift|rdl|رومانیایی/.test(k)) return "deadlift";
    if (/شنا|bench|push|پرس سینه|پوش/.test(k)) return "push";
    if (/بارفیکس|pull|row|روئینگ|زیربغل|قایقی/.test(k)) return "pull";
    if (/پلانک|plank|کرانچ|sit\s*up|hollow|روسی|russian/.test(k)) return "plank";
    if (/هیپ|thrust|بریج|bridge|گلوت|باسن/.test(k)) return "glute";
    if (/برپی|burpee|جک|jack|mountain|زانو بلند|high knee|طناب/.test(k)) return "cardio";
    return "";
  }

  function tipSeed(extra) {
    let s = String(extra || "");
    try {
      s += "|" + String((lastDoneStats && lastDoneStats.finishedAt) || Date.now());
    } catch {
      s += "|" + String(Date.now());
    }
    try {
      const day = new Date().toISOString().slice(0, 10);
      s += "|" + day;
    } catch {}
    return s;
  }

  function pickRotatingTip(list, seed) {
    const arr = Array.isArray(list) ? list.filter(Boolean) : [];
    if (!arr.length) return "";
    const i = Math.abs(hashUnit(String(seed || "x"))) % arr.length;
    return arr[i];
  }

  function muscleTipFor(id, seed) {
    const meta = MUSCLE_META[id];
    if (!meta) return "";
    const tips = meta.tips || (meta.tip ? [meta.tip] : []);
    return pickRotatingTip(tips, String(seed || "") + "|" + id);
  }

  function moveScienceTip(name, seed) {
    const bucket = moveTipBucket(name);
    const list = (bucket && MOVE_SCIENCE_TIPS[bucket]) || [];
    if (list.length) return pickRotatingTip(list, String(seed || "") + "|mv|" + bucket);
    const ms = musclesForMove(name);
    return muscleTipFor(ms[0] || "core", seed);
  }

  const MOVE_MUSCLE_RULES = [
    { keys: ["اسکوات", "squat", "گبلت", "سومو", "air squat"], muscles: ["quads", "glutes", "core"] },
    { keys: ["لانگز", "lunge", "لانگ"], muscles: ["quads", "glutes", "hamstrings"] },
    { keys: ["ددلیفت", "deadlift", "rdl", "رومانیایی"], muscles: ["hamstrings", "glutes", "back", "core"] },
    { keys: ["پرس سینه", "bench", "شنا", "push up", "pushup", "پوشاپ"], muscles: ["chest", "triceps", "shoulders"] },
    { keys: ["بارفیکس", "pull up", "pullup", "زیربغل", "row", "قایقی", "bent over"], muscles: ["back", "biceps", "core"] },
    { keys: ["پرس شانه", "shoulder press", "میلیتاری", "lateral raise", "نشر جانب"], muscles: ["shoulders", "triceps", "core"] },
    { keys: ["جلو بازو", "curl", "بایسپس", "bicep"], muscles: ["biceps"] },
    { keys: ["پشت بازو", "tricep", "دیپ", "dip", "kickback"], muscles: ["triceps", "chest"] },
    { keys: ["پلانک", "plank", "کرانچ", "crunch", "sit up", "situp", "روسی", "russian", "hollow"], muscles: ["core"] },
    { keys: ["هیپ تراست", "hip thrust", "پل باسن", "glute bridge", "گلوت"], muscles: ["glutes", "hamstrings", "core"] },
    { keys: ["ساق", "calf"], muscles: ["calves"] },
    { keys: ["برپی", "burpee", "جک", "jumping jack", "mountain", "زانو بلند", "high knee"], muscles: ["quads", "glutes", "core", "shoulders"] },
    { keys: ["کettle", "کتل", "swing", "تاب"], muscles: ["glutes", "hamstrings", "core", "back"] },
    { keys: ["وال سیت", "wall sit", "نشیمن دیوار"], muscles: ["quads", "glutes", "core"] },
    { keys: ["فارمر", "farmer"], muscles: ["core", "back", "shoulders"] }
  ];

  function normMuscleKey(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function musclesForMove(name) {
    const key = normMuscleKey(name);
    if (!key) return ["core"];
    for (let i = 0; i < MOVE_MUSCLE_RULES.length; i++) {
      const rule = MOVE_MUSCLE_RULES[i];
      if (rule.keys.some((k) => key.indexOf(String(k).toLowerCase()) >= 0)) {
        return rule.muscles.slice();
      }
    }
    return ["core", "quads"];
  }

  function muscleLoadFromStats(stats) {
    const load = {};
    Object.keys(MUSCLE_META).forEach((k) => {
      load[k] = 0;
    });
    const byMove = (stats && stats.byMove) || [];
    byMove.forEach((m) => {
      const sec = Math.max(0, Number(m.sec) || 0);
      const ms = musclesForMove(m.name);
      const share = sec / Math.max(1, ms.length);
      ms.forEach((id) => {
        load[id] = (load[id] || 0) + share;
      });
    });
    return load;
  }

  function topMuscles(load, n) {
    return Object.keys(load)
      .map((id) => ({ id, sec: load[id] || 0, fa: (MUSCLE_META[id] && MUSCLE_META[id].fa) || id }))
      .filter((x) => x.sec > 0)
      .sort((a, b) => b.sec - a.sec)
      .slice(0, n || 4);
  }

  function muscleInsightText(stats, load) {
    const tops = topMuscles(load, 3);
    if (!tops.length) return "برای تحلیل عضله، حداقل یک حرکت کاری لازم است.";
    const names = tops.map((t) => t.fa).join("، ");
    const moves = ((stats && stats.byMove) || []).slice(0, 3).map((m) => m.name).join("، ");
    const tip = muscleTipFor(tops[0].id, tipSeed("insight"));
    return (
      "بیشترین درگیری: " +
      names +
      (moves ? " · بر پایه " + moves : "") +
      (tip ? " · نکته: " + tip : "")
    );
  }

  function anatomySvg(load) {
    const max = Math.max(1, ...Object.keys(MUSCLE_META).map((k) => load[k] || 0));
    const ranked = Object.keys(MUSCLE_META)
      .map((id) => ({ id, sec: load[id] || 0 }))
      .filter((x) => x.sec > 0)
      .sort((a, b) => b.sec - a.sec);
    const rankOf = {};
    ranked.forEach((x, i) => {
      rankOf[x.id] = i;
    });
    function lvl(id) {
      const v = (load[id] || 0) / max;
      if (v <= 0.02) return 0;
      if (v < 0.34) return 1;
      if (v < 0.67) return 2;
      return 3;
    }
    function heat(id) {
      const v = (load[id] || 0) / max;
      if (v <= 0.02) return "rgba(58,52,44,0.95)";
      const a = (0.28 + v * 0.72).toFixed(2);
      return "rgba(232,165,75," + a + ")";
    }
    function zone(tag, attrs, id) {
      const level = lvl(id);
      const delay = rankOf[id] != null ? (0.15 + rankOf[id] * 0.22).toFixed(2) : "0";
      const cls =
        "mus-zone" +
        (level > 0 ? " mus-hot mus-lvl-" + level : " mus-idle");
      const anim =
        level > 0
          ? '<animate attributeName="opacity" values="0.25;1;0.7;1" dur="1.15s" begin="' +
            delay +
            's" repeatCount="indefinite"/>' +
            '<animate attributeName="fill" values="' +
            heat(id) +
            ';rgba(255,210,120,1);' +
            heat(id) +
            '" dur="1.15s" begin="' +
            delay +
            's" repeatCount="indefinite"/>'
          : "";
      return (
        "<" +
        tag +
        " " +
        attrs +
        ' data-muscle="' +
        id +
        '" data-lvl="' +
        level +
        '" class="' +
        cls +
        '" style="--d:' +
        delay +
        's" fill="' +
        heat(id) +
        '" opacity="' +
        (level > 0 ? "0.35" : "0.55") +
        '">' +
        anim +
        "</" +
        tag +
        ">"
      );
    }
    return (
      '<svg viewBox="0 0 200 360" xmlns="http://www.w3.org/2000/svg" class="anatomy-svg anatomy-live" aria-hidden="true">' +
      '<rect x="0" y="0" width="200" height="360" rx="18" fill="#100e0a"/>' +
      '<ellipse cx="100" cy="36" rx="22" ry="26" fill="#2a241c" stroke="#3a342c"/>' +
      '<rect x="78" y="58" width="44" height="18" rx="6" fill="#2a241c"/>' +
      zone("ellipse", 'cx="58" cy="88" rx="18" ry="14"', "shoulders") +
      zone("ellipse", 'cx="142" cy="88" rx="18" ry="14"', "shoulders") +
      zone("ellipse", 'cx="100" cy="110" rx="36" ry="22"', "chest") +
      zone("ellipse", 'cx="100" cy="132" rx="30" ry="16" opacity="0.9"', "back") +
      zone("rect", 'x="34" y="100" width="18" height="56" rx="9"', "biceps") +
      zone("rect", 'x="148" y="100" width="18" height="56" rx="9"', "triceps") +
      zone("rect", 'x="78" y="128" width="44" height="52" rx="12"', "core") +
      zone("ellipse", 'cx="100" cy="188" rx="28" ry="16"', "glutes") +
      zone("rect", 'x="72" y="200" width="22" height="70" rx="11"', "quads") +
      zone("rect", 'x="106" y="200" width="22" height="70" rx="11"', "hamstrings") +
      zone("rect", 'x="74" y="274" width="18" height="50" rx="9"', "calves") +
      zone("rect", 'x="108" y="274" width="18" height="50" rx="9"', "calves") +
      '<text x="100" y="348" text-anchor="middle" fill="#9a9080" font-size="11" font-family="Vazirmatn,sans-serif">نقشه درگیری عضله</text>' +
      "</svg>"
    );
  }

  async function speakCueLine(line, clipRel) {
    if (soundMuted || !line) return false;
    const gen = soundGen;
    unlockAudio();
    startBgKeepAlive();
    try {
      if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume();
    } catch {}
    let ok = false;
    if (clipRel) {
      try {
        ok = !!(await playVoiceFile(clipRel, 1));
      } catch {}
      if (ok && gen === soundGen) return true;
      try {
        ok = !!(await playVoiceFileHtml(clipRel, 1));
      } catch {}
      if (ok && gen === soundGen) return true;
    }
    try {
      ok = !!(await playBakedDynClip(line, 1));
    } catch {}
    if (ok && gen === soundGen) return true;
    // اگر کلود قبلاً مرده بود، یک شانس تازه برای کیوهای کوتاه
    try {
      cloudTtsDeadUntil = 0;
    } catch {}
    try {
      ok = !!(await speakFaAny(line, 1));
    } catch {}
    if (ok && gen === soundGen) return true;
    try {
      ok = !!(await speakSynthLang(line, 1, "fa", {
        noCancel: true,
        rate: 0.95,
        pitch: 1.0
      }));
    } catch {}
    return !!(ok && gen === soundGen);
  }

  const CUE_CLIPS = {
    half: "dyn/5b47ffb16507f9a1.mp3"
  };

  async function speakMidHalf() {
    // فقط درصد ۲۰ و ۶۰
    return false;
  }

  async function speakPercentGone(pct) {
    const p = Math.max(5, Math.min(95, Math.round(Number(pct) || 0)));
    const gen = soundGen;
    unlockAudio();
    startBgKeepAlive();
    const clip = p >= 70 ? "cue-pct-80.mp3" : "cue-pct-30.mp3";
    // فایل محلی فوری — تا بعد از نصف دیر شنیده نشود
    try {
      const ok = !!(await playOnKeeper(VOICE_BASE + clip + VOICE_Q, 1, {
        startCap: 2500,
        maxMs: 8000,
        gen,
        protect: true
      }));
      if (ok && gen === soundGen) return true;
    } catch {}
    try {
      const ok = !!(await playBgCueFile(clip, 1, { waitMs: 5000 }));
      if (ok && gen === soundGen) return true;
    } catch {}
    const line = faNum(p) + " درصد رفتی";
    try {
      cloudTtsDeadUntil = 0;
    } catch {}
    try {
      return !!(await speakFaAny(line, 1));
    } catch {
      return false;
    }
  }

  async function speakDoneAmount(sec, total) {
    const n = Math.round(sec);
    const tot = Math.round(total || (run && run.phaseDur) || 0);
    if (n <= 0) return;
    return queueAnnounce(async (seq) => {
      if (!announceAlive(seq)) return;
      const alive = aliveNow();
      const live = () => announceAlive(seq) && alive();
      const pct =
        tot > 0 ? Math.max(1, Math.min(99, Math.round((n / tot) * 100))) : 0;
      try {
        if (run) run.progressLabel = "";
        const sub = $("#runSub");
        if (sub) sub.textContent = "";
      } catch {}
      const phrase =
        faNum(pct) + " درصد رفتی";
      await speakFaAny(phrase, 1);
      if (!live()) return;
    });
  }
  function setCountPhrase(n) {
    const k = Math.max(0, Math.round(Number(n) || 0));
    return faNum(k) + " تا ست کامل";
  }

  function moveCountPhrase(n) {
    const k = Math.max(0, Math.round(Number(n) || 0));
    return faNum(k) + " تا حرکت کامل";
  }

  function estimateCalories(workSec) {
    const sec = Math.max(0, Math.round(Number(workSec) || 0));
    return Math.max(0, Math.round((sec / 60) * 7.5));
  }

  function estimateWalkMinutes(kcal) {
    return Math.max(0, Math.round((Number(kcal) || 0) / 4));
  }

  function workStatsFromSteps(steps, upToIndex) {
    const list = Array.isArray(steps) ? steps : [];
    const slice =
      upToIndex == null
        ? list
        : list.slice(0, Math.max(0, Math.round(Number(upToIndex) || 0) + 1));
    const works = slice.filter((s) => s && s.kind === "work");
    const allWorks = list.filter((s) => s && s.kind === "work");
    const rounds = allWorks.length
      ? Math.round(Number(allWorks[0].rounds) || 0)
      : 0;
    const perSet = allWorks.length
      ? Math.round(Number(allWorks[0].moveCount) || 0)
      : 0;
    const totalMoves = works.length;
    const workSec = works.reduce(
      (a, s) => a + Math.max(0, Math.round(Number(s.dur) || 0)),
      0
    );
    const byMoveMap = new Map();
    works.forEach((s) => {
      const name = String(s.name || "").trim() || "حرکت";
      const sec = Math.max(0, Math.round(Number(s.dur) || 0));
      const prev = byMoveMap.get(name) || { name, sec: 0, count: 0 };
      prev.sec += sec;
      prev.count += 1;
      byMoveMap.set(name, prev);
    });
    const byMove = [...byMoveMap.values()].sort((a, b) => b.sec - a.sec);
    const restSec = slice
      .filter((s) => s && (s.kind === "rest-set" || s.kind === "rest-move"))
      .reduce((a, s) => a + Math.max(0, Math.round(Number(s.dur) || 0)), 0);
    const calories = estimateCalories(workSec);
    const walkMin = estimateWalkMinutes(calories);
    return {
      rounds,
      perSet,
      totalMoves,
      moveCount: totalMoves,
      workSec,
      restSec,
      calories,
      walkMin,
      byMove,
      finishedAt: new Date().toISOString()
    };
  }

  async function speakStatLine(text, seq) {
    const key = String(text || "").replace(/\s+/g, " ").trim();
    if (!key) return false;
    if (seq != null && !announceAlive(seq)) return false;
    // آمار آرام‌تر از اسم حرکت (حدود یک‌پنجم بلندی نام)
    return !!(await speakFaAny(key, 0.2));
  }

  function setDoneLine(completed, totalSets) {
    const n = Math.max(1, Math.round(Number(completed) || 0));
    const total = Math.max(n, Math.round(Number(totalSets) || n));
    return faNum(n) + " ست از " + faNum(total) + " ست رو رفتی، استراحت بین ست";
  }

  function statNumbers(stats) {
    const s = stats || {};
    const moves = Math.max(
      0,
      Math.round(Number(s.totalMoves != null ? s.totalMoves : s.moveCount) || 0)
    );
    const workSec = Math.max(0, Math.round(Number(s.workSec) || 0));
    const calories = Math.max(
      0,
      Math.round(
        Number(s.calories != null ? s.calories : estimateCalories(workSec)) || 0
      )
    );
    const walkMin = Math.max(
      0,
      Math.round(
        Number(s.walkMin != null ? s.walkMin : estimateWalkMinutes(calories)) ||
          0
      )
    );
    return { moves, workSec, calories, walkMin };
  }

  function midStatsLine(stats) {
    if (!stats) return "";
    const { moves, workSec, calories, walkMin } = statNumbers(stats);
    const parts = [];
    if (moves > 0) parts.push("تا اینجا " + moveCountPhrase(moves));
    if (workSec > 0) parts.push("جمع تمرین " + timePhrase(workSec));
    if (calories > 0) parts.push("حدود " + faNum(calories) + " کالری");
    if (walkMin > 0) parts.push("معادل حدود " + faNum(walkMin) + " دقیقه پیاده‌روی");
    return parts.join("، ");
  }

  function nextDashSayIdx() {
    let i = 0;
    try {
      i = Math.max(0, Math.round(Number(localStorage.getItem("setdadr-dash-say-i")) || 0));
    } catch {}
    try {
      localStorage.setItem("setdadr-dash-say-i", String(i + 1));
    } catch {}
    return i;
  }

  async function speakDone(stats) {
    const s = stats || {};
    const n = Math.max(1, Math.round(Number(s.rounds) || 0));
    const { moves, workSec, calories, walkMin } = statNumbers(s);
    const myGen = soundGen;
    const sayi = nextDashSayIdx();
    const alive = () => {
      const on = $("#view-done") && $("#view-done").classList.contains("on");
      return myGen === soundGen && !soundMuted && !!on;
    };
    unlockAudio();
    startBgKeepAlive();
    startSilentCtxKeep();
    buzz([90, 50, 120]);
    if (!alive()) return;
    const opens = [
      "آفرین، تمرین تمام شد",
      "عالی بود، ست تموم شد",
      "دمت گرم، تمرین جمع شد",
      "خوب اومدی، کار تموم"
    ];
    await speakStatLine(opens[sayi % opens.length], null);
    if (!alive()) return;
    const bits = [];
    if (n > 0) bits.push(faNum(n) + " ست");
    if (moves > 0) bits.push(faNum(moves) + " حرکت");
    if (workSec > 0) bits.push(timePhrase(workSec));
    if (calories > 0) bits.push(faNum(calories) + " کالری");
    if (walkMin > 0) bits.push(faNum(walkMin) + " دقیقه پیاده‌روی");
    if (bits.length) await speakStatLine(bits.join("، "), null);
    if (!alive()) return;
    const byMove = Array.isArray(s.byMove) ? s.byMove : [];
    if (byMove.length) {
      const top = byMove[sayi % byMove.length];
      const variants = [
        "بیشترین کار روی " + top.name,
        "این‌بار روی " + top.name + " خوب فشار آوردی",
        "تمرکز بعدی را روی فرم " + top.name + " بگذار",
        top.name + " را کنترل‌شده‌تر تکرار کن"
      ];
      await speakStatLine(variants[sayi % variants.length], null);
    }
    if (!alive()) return;
    const load = muscleLoadFromStats(s);
    const tops = topMuscles(load, 1);
    if (tops.length) {
      const tip = muscleTipFor(tops[0].id, tipSeed("speak-" + tops[0].id));
      const tipLines = [
        tip ? "نکته: " + tip : "",
        "نکته: روی " + tops[0].fa + " نفس را منظم نگه دار",
        "نکته: " + tops[0].fa + " را بدون عجله جمع کن",
        "نکته: دامنه کامل " + tops[0].fa + " را حفظ کن"
      ].filter(Boolean);
      if (tipLines.length) {
        await speakStatLine(tipLines[sayi % tipLines.length], null);
      }
    }
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
        const clearPress = () => {
          btn.classList.remove("is-press");
          try {
            btn.blur();
          } catch {}
        };
        btn.addEventListener("pointerdown", () => {
          wrap.querySelectorAll(".num-btn").forEach((b) => b.classList.remove("is-press"));
          btn.classList.add("is-press");
        });
        btn.addEventListener("pointerup", clearPress);
        btn.addEventListener("pointercancel", clearPress);
        btn.addEventListener("pointerleave", clearPress);
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const dir = Number(btn.getAttribute("data-dir")) || 0;
          bumpNumber(input, dir);
          clearPress();
        });
      });
    });
  }

  function show(name) {
    if (name === "moves") name = "home";
    const wasDone = $("#view-done") && $("#view-done").classList.contains("on");
    if (wasDone && name !== "done") {
      stopAllSound();
      hushKeeperToSilence();
    }
    viewIds.forEach((k) => {
      const el = document.getElementById("view-" + k);
      if (!el) return;
      el.classList.toggle("on", k === name);
    });
    $$("#navTabs button").forEach((b) => {
      b.classList.toggle("on", b.getAttribute("data-view") === name);
    });
    const tabHome = $("#tabHome");
    if (tabHome) tabHome.hidden = true; // روی صفحه ست‌ها دکمه ست‌ها معنی ندارد
    const tabEdit = $("#tabEdit");
    if (tabEdit) tabEdit.hidden = name !== "edit";
    const topBar = $("#topBar");
    if (topBar) topBar.style.display = name === "run" ? "none" : "";
    const dashBtn = $("#btnHomeDash");
    if (dashBtn) dashBtn.hidden = name !== "home";
    if (name === "edit") {
      updatePlanSummary();
      renderMoveSuggest();
    }
  }

  function updatePlanSummary() {
    // خلاصه عددی در تنظیمات لازم نیست
  }

  function rememberedMoves() {
    const map = new Map();
    (state.moves || []).forEach((m) => {
      const name = String((m && m.name) || "").trim();
      if (!name) return;
      map.set(name, {
        id: m.id || uid(),
        name,
        work: Math.max(5, Number(m.work) || 40)
      });
    });
    return [...map.values()];
  }

  function toEnDigits(s) {
    return String(s || "")
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  }

  function parseMoveInput(raw) {
    let name = String(raw || "").replace(/\s+/g, " ").trim();
    let work = null;
    if (!name) return { name: "", work: null };
    // اسکوات ۴۰ / اسکوات 40ث / اسکوات 40 ثانیه
    const m = name.match(
      /^(.*?)(?:\s+|-)([0-9۰-۹٠-٩]{1,3})\s*(?:ث(?:انیه)?)?$/i
    );
    if (m && String(m[1] || "").trim()) {
      name = String(m[1]).trim();
      const n = Math.round(Number(toEnDigits(m[2])));
      if (Number.isFinite(n) && n >= 5 && n <= 600) work = n;
    }
    return { name, work };
  }

  function flashAutoSave() {
    // جملهٔ ذخیره خودکار حذف شد — بی‌صدا ذخیره می‌شود
  }

  function autoSavePlan() {
    const rounds = Math.max(1, Math.min(30, Number($("#planRounds").value) || 4));
    const restSet = Math.max(0, Math.min(600, Number($("#planRestSet").value) || 0));
    const restMove = Math.max(0, Math.min(300, Number($("#planRestMove").value) || 0));
    if (!circuit.length) {
      if (editId) {
        state.plans = state.plans.filter((x) => x.id !== editId);
        save(state);
        renderPlans();
        flashAutoSave();
      }
      return;
    }
    const title = autoTitle(circuit);
    const payload = {
      title,
      rounds,
      restSet,
      restMove,
      circuit: circuit.map((c) => ({ id: c.id, name: c.name, work: c.work }))
    };
    if (editId) {
      let p = state.plans.find((x) => x.id === editId);
      if (p) Object.assign(p, payload);
      else {
        state.plans.unshift({ id: editId, createdAt: Date.now(), ...payload });
      }
    } else {
      editId = uid();
      state.plans.unshift({ id: editId, createdAt: Date.now(), ...payload });
    }
    save(state);
    renderPlans();
    flashAutoSave();
  }

  function addMoveToCircuit(name, workSec) {
    const parsed = parseMoveInput(name);
    const nm = parsed.name;
    if (!nm) return false;
    let work =
      parsed.work != null
        ? parsed.work
        : Math.max(5, Number(workSec) || Number($("#pickWork").value) || 40);
    work = Math.max(5, Math.min(600, work));
    const known = state.moves.find((m) => m.name === nm);
    if (!known) {
      state.moves.unshift({ id: uid(), name: nm, work });
      save(state);
      renderMoves();
    } else if (parsed.work != null) {
      known.work = work;
      save(state);
    }
    circuit.push({ id: uid(), name: nm, work });
    try {
      warmMoveVoice(nm);
    } catch {}
    const nameEl = $("#pickMoveName");
    if (nameEl) nameEl.value = "";
    const workEl = $("#pickWork");
    if (workEl && parsed.work != null) workEl.value = String(work);
    renderCircuit();
    updatePlanSummary();
    renderMoveSuggest();
    autoSavePlan();
    return true;
  }

  function renderMoveSuggest() {
    const box = $("#moveSuggest");
    if (!box) return;
    box.innerHTML = "";
    const list = rememberedMoves().slice(0, 24);
    if (!list.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    list.forEach((m) => {
      const wrap = document.createElement("div");
      wrap.className = "move-chip";
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "move-chip-pick";
      pick.textContent = m.name;
      pick.addEventListener("click", () => {
        addMoveToCircuit(m.name, m.work);
      });
      const del = document.createElement("button");
      del.type = "button";
      del.className = "move-chip-x";
      del.setAttribute("aria-label", "حذف از حافظه");
      del.textContent = "×";
      del.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.moves = (state.moves || []).filter(
          (x) => String((x && x.name) || "").trim() !== m.name
        );
        save(state);
        renderMoveSuggest();
      });
      wrap.appendChild(pick);
      wrap.appendChild(del);
      box.appendChild(wrap);
    });
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function fmt(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return toFaDigits(m) + ":" + toFaDigits(String(s).padStart(2, "0"));
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
        p.circuit.length +
        " حرکت · " +
        p.rounds +
        " ست · استراحت ست " +
        p.restSet +
        " ثانیه";
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
        updatePlanSummary();
        autoSavePlan();
      });
      li.appendChild(rm);
      ol.appendChild(li);
    });
    updatePlanSummary();
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
    try {
      cloudTtsDeadUntil = 0;
    } catch {}

    const p = state.plans.find((x) => x.id === id);
    if (!p || !p.circuit.length) return;
    lastPlanId = id;
    // دوبار زدن شروع = زوم صدا؛ قفل کوتاه + قطع قبلی
    if (startLock) return;
    startLock = true;
    setTimeout(() => {
      startLock = false;
    }, 700);
    stopLoop();
    stopAllSound();
    const steps = buildTimeline(p);
    // بلافاصله بعد از stop دوباره آنلاک — وگرنه حرکت اول ساکت می‌ماند
    unlockAudio();
    startBgKeepAlive();
    startSilentCtxKeep();
    try {
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
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
    unlockAudio();
    speakPhase(steps[0]);
    loop();
    // گرم‌کردن بقیه بعد از شروع تلفظ اول
    setTimeout(() => {
      try {
        p.circuit.forEach((c) => {
          warmMoveVoice(c.name);
        });
      } catch {}
    }, 900);
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

    if (step.kind === "work") {
      const total = Math.max(1, Number(run.phaseDur) || 0);
      const elapsed = Math.max(0, total - (Number(run.left) || 0));
      // درصد پرشده؛ ۱ث زودتر برای ۳۰٪ (مثلاً ۳۰ث → ثانیه ۸)
      // اگر از پنجره رد شد دیگر نگو تا بعد از نصف دیر نیاید
      function fireAtFilled(pct, keySuffix, speakFn, leadSec) {
        if (total < 12) return;
        const key = run.i + ":" + keySuffix;
        if (run.announced[key]) return;
        const lead = leadSec == null ? 1 : leadSec;
        const target = total * (pct / 100);
        const fireAt = Math.max(0, target - lead);
        const expireAt = Math.min(target + 1.0, total * 0.48);
        if (elapsed > expireAt) {
          run.announced[key] = true;
          return;
        }
        if (elapsed < fireAt) return;
        if (nameSpeechGuard) return;
        run.announced[key] = true;
        try {
          stopCueRail();
        } catch {}
        try {
          speakFn();
        } catch {}
      }
      fireAtFilled(30, "pct30", () => speakPercentGone(30), 1);
      fireAtFilled(80, "pct80", () => speakPercentGone(80), 3);

      if (total >= 10 && !nameSpeechGuard) {
        const midKey = run.i + ":midBeep";
        const midMark = Math.ceil(total / 2);
        if (!run.announced[midKey] && prev > midMark && cur <= midMark) {
          run.announced[midKey] = true;
          beepMidExact();
        }
      }
    }

    if (run.phaseDur > 5 && !nameSpeechGuard) {
      for (let s = 4; s >= 1; s--) {
        const k = run.i + ":tick" + s;
        if (!run.announced[k] && prev > s && cur <= s) {
          run.announced[k] = true;
          beepClockTick(s);
        }
      }
    }
  }

  function advance(fromSkip) {
    if (!run) return;
    const skip = !!fromSkip;
    if (skip) {
      stopAllSound();
      hushKeeperToSilence();
      try {
        if (window.speechSynthesis) speechSynthesis.cancel();
      } catch {}
    } else {
      softCutForAdvance();
    }
    unlockAudio();
    startBgKeepAlive();
    hushKeeperToSilence();
    run.i += 1;
    if (run.i >= run.steps.length) {
      finishRun();
      return;
    }
    const step = run.steps[run.i];
    run.left = step.dur;
    run.phaseDur = step.dur;
    run.announced = {};
    run.progressLabel = "";
    run.prevLeftCeil = Math.ceil(step.dur);
    run.lastTick = performance.now();
    paintRun(false);
    unlockAudio();
    startBgKeepAlive();
    try {
      const k = ensureKeeper();
      k.loop = true;
      k.muted = false;
      k.volume = 0.001;
      k.src = KEEP_SILENCE;
      k.play().catch(() => {});
    } catch {}
    const myGen = soundGen;
    const mySeq = announceSeq;
    const phaseIndex = run.i;
    const kick = () => {
      if (!run || run.i !== phaseIndex) return;
      if (soundGen !== myGen || announceSeq !== mySeq) return;
      try {
        stopBeep();
      } catch {}
      unlockAudio();
      startBgKeepAlive();
      try {
        ensureKeeper().play().catch(() => {});
      } catch {}
      speakPhase(run.steps[run.i] || step);
    };
    // هرگز kick فوری — روی آیفون هنگ می‌آورد
    setTimeout(kick, skip ? 80 : 50);
    loop();
  }

  function overallProgressPct() {
    if (!run || !Array.isArray(run.steps) || !run.steps.length) return 0;
    let total = 0;
    let done = 0;
    run.steps.forEach((s, i) => {
      const dur = Math.max(0, Number(s && s.dur) || 0);
      total += dur;
      if (i < run.i) done += dur;
      else if (i === run.i) {
        done += Math.max(0, dur - Math.max(0, Number(run.left) || 0));
      }
    });
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }

  function paintOverallProgress() {
    const el = $("#runOverall");
    if (!el) return;
    const pct = overallProgressPct();
    el.textContent = toFaDigits(pct) + "٪";
  }

  function paintFracPair(el, a, b) {
    if (!el) return;
    el.innerHTML =
      toFaDigits(a) + "<span>/</span>" + toFaDigits(b);
  }

  function paintRun(announceStart) {
    if (!run) return;
    const step = run.steps[run.i];
    const stage = $("#runStage");
    const moveEl = $("#runMove");
    const isRest = step.kind !== "work";
    stage.classList.toggle("work", !isRest);
    stage.classList.toggle("rest", isRest);
    paintOverallProgress();
    paintFracPair($("#runFrac"), step.round, step.rounds);
    const mc = $("#runMoveCount");
    const mpi = $("#moveProgressItem");
    if (step.kind === "work") {
      $("#runPhase").textContent = "تمرین";
      moveEl.textContent = step.name;
      moveEl.hidden = false;
      if (mc) paintFracPair(mc, step.moveIndex, step.moveCount);
      if (mpi) mpi.hidden = false;
      $("#runSub").textContent = (run && run.progressLabel) || "";
    } else {
      $("#runPhase").textContent = step.kind === "rest-set" ? "استراحت ست" : "استراحت";
      // اسم حرکت بعدی فقط داخل کارت پایین؛ بالا تکرار نشود
      moveEl.textContent = "";
      moveEl.hidden = true;
      $("#runSub").textContent = "";
      if (mc) paintFracPair(mc, step.moveIndex, step.moveCount);
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
    const nextLbl = $("#nextLabel");
    if (!card || !run || !flow1) return;
    const step = run.steps[run.i];

    function hideNext() {
      card.hidden = true;
      card.classList.remove("is-rest-next", "is-next-only", "is-finale");
      if (arrowLead) arrowLead.hidden = true;
      if (arrow) arrow.hidden = true;
      if (row2) row2.hidden = true;
      if (nextLbl) nextLbl.hidden = true;
      if (flow2) flow2.textContent = "";
    }

    // همیشه فلش و برچسب «حرکت بعدی» را برای اسم حرکت بعدی نگه دار
    function showNextMoveOnly(name) {
      const nm = String(name || "").trim();
      if (!nm) {
        hideNext();
        return;
      }
      card.hidden = false;
      card.classList.add("is-rest-next", "is-next-only");
      if (nextLbl) {
        nextLbl.hidden = false;
        nextLbl.textContent = "حرکت بعدی";
      }
      if (arrowLead) {
        arrowLead.hidden = false;
        arrowLead.textContent = "↓";
      }
      flow1.textContent = nm;
      if (flow2) flow2.textContent = "";
      if (row2) row2.hidden = true;
      if (arrow) arrow.hidden = true;
    }

    function showRestThenNext(restText, nextName) {
      const nm = String(nextName || "").trim();
      if (!nm) {
        hideNext();
        return;
      }
      card.hidden = false;
      card.classList.add("is-rest-next");
      card.classList.remove("is-next-only");
      if (nextLbl) nextLbl.hidden = true;
      if (arrowLead) arrowLead.hidden = true;
      flow1.textContent = restText;
      if (flow2) flow2.textContent = nm;
      if (row2) row2.hidden = false;
      if (arrow) {
        arrow.hidden = false;
        arrow.textContent = "↓ حرکت بعدی";
      }
    }

    if (step.kind !== "work") {
      if (!step.nextName) {
        hideNext();
        return;
      }
      showNextMoveOnly(step.nextName);
      return;
    }

    card.classList.remove("is-rest-next");
    const next = run.steps[run.i + 1];
    if (!next) {
      card.hidden = false;
      card.classList.add("is-rest-next", "is-next-only", "is-finale");
      if (nextLbl) {
        nextLbl.hidden = false;
        nextLbl.textContent = "حرکت بعدی";
      }
      if (arrowLead) {
        arrowLead.hidden = false;
        arrowLead.textContent = "↓";
      }
      flow1.textContent = "حرکتی نیست (پایان تمرین)";
      if (flow2) flow2.textContent = "";
      if (row2) row2.hidden = true;
      if (arrow) arrow.hidden = true;
      return;
    }

    card.classList.remove("is-finale");
    if (next.kind === "work") {
      showNextMoveOnly(next.name);
      return;
    }

    if (next.nextName) {
      showRestThenNext(
        "استراحت " + toFaDigits(next.dur) + "ث",
        next.nextName
      );
      return;
    }

    hideNext();
  }

  function formatDoneWhen(iso) {
    try {
      const d = new Date(iso);
      if (!isFinite(d.getTime())) return "";
      const date = new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long"
      }).format(d);
      const time = new Intl.DateTimeFormat("fa-IR", {
        hour: "2-digit",
        minute: "2-digit"
      }).format(d);
      return date + " — ساعت " + time;
    } catch {
      return "";
    }
  }

  function renderDoneStats(stats) {
    const tiles = $("#doneTiles");
    const chart = $("#doneChart");
    const movesEl = $("#doneMoves");
    const anatomy = $("#doneAnatomy");
    const insight = $("#doneInsight");
    const musclesEl = $("#doneMuscles");
    const whenEl = $("#doneWhen");
    if (tiles) tiles.innerHTML = "";
    if (chart) chart.innerHTML = "";
    if (movesEl) movesEl.innerHTML = "";
    if (anatomy) anatomy.innerHTML = "";
    if (insight) {
      insight.textContent = "";
      insight.hidden = true;
    }
    if (musclesEl) musclesEl.innerHTML = "";
    if (whenEl) whenEl.textContent = "";
    if (!stats) return;
    const whenEl2 = $("#doneWhen");
    if (whenEl2) {
      const stamp = formatDoneWhen(stats.finishedAt);
      whenEl2.textContent = stamp
        ? "برای تمرین " + stamp
        : "زمان این تمرین ثبت نشده";
    }
    const rounds = Math.max(0, Math.round(Number(stats.rounds) || 0));
    const workSec = Math.max(0, Math.round(Number(stats.workSec) || 0));
    const restSec = Math.max(0, Math.round(Number(stats.restSec) || 0));
    const calories = Math.max(0, Math.round(Number(stats.calories) || 0));
    const walkMin = Math.max(0, Math.round(Number(stats.walkMin) || 0));
    const byMove = Array.isArray(stats.byMove) ? stats.byMove : [];
    const load = muscleLoadFromStats(stats);
    const tops = topMuscles(load, 5);
    const movesN = Math.max(
      0,
      Math.round(Number(stats.totalMoves != null ? stats.totalMoves : stats.moveCount) || 0)
    );
    const tileData = [
      ["زمان تمرین", timePhrase(workSec)],
      ["استراحت", timePhrase(restSec)],
      ["کالری", toFaDigits(calories)],
      ["پیاده‌روی", toFaDigits(walkMin) + " دقیقه"],
      ["حرکت‌ها", toFaDigits(movesN)],
      ["دورها", toFaDigits(rounds)]
    ];
    if (tiles) {
      tileData.forEach(([k, v]) => {
        const d = document.createElement("div");
        d.className = "done-tile";
        d.innerHTML = '<div class="done-tile-v"></div><div class="done-tile-k"></div>';
        d.querySelector(".done-tile-v").textContent = v;
        d.querySelector(".done-tile-k").textContent = k;
        tiles.appendChild(d);
      });
    }
    if (anatomy) {
      anatomy.innerHTML = anatomySvg(load);
      try {
        const hot = anatomy.querySelectorAll(".mus-hot");
        hot.forEach((el, i) => {
          el.classList.add("mus-pop");
          el.style.setProperty("--d", (0.08 + i * 0.16).toFixed(2) + "s");
        });
      } catch {}
    }
    // نکته فقط زیر میله؛ پاراگراف جدا نه
    if (insight) {
      insight.textContent = "";
      insight.hidden = true;
    }
    if (musclesEl && tops.length) {
      const max = Math.max(1, tops[0].sec);
      tops.forEach((m) => {
        const li = document.createElement("li");
        const pct = Math.round((m.sec / max) * 100);
        li.innerHTML =
          '<div class="mus-row"><span class="mus-name"></span><span class="mus-pct"></span></div><div class="mus-track"><div class="mus-fill"></div></div>';
        li.querySelector(".mus-name").textContent = m.fa;
        li.querySelector(".mus-pct").textContent = toFaDigits(pct) + "٪ بار نسبی";
        li.querySelector(".mus-fill").style.width = "0%";
        requestAnimationFrame(() => {
          try {
            li.querySelector(".mus-fill").style.width = Math.max(8, pct) + "%";
          } catch {}
        });
        const tip =
          muscleTipFor(m.id, tipSeed(m.id)) ||
          ("روی " + m.fa + " کنترل و فرم را حفظ کن.");
        const p = document.createElement("div");
        p.className = "mus-tip";
        p.textContent = tip;
        li.appendChild(p);
        musclesEl.appendChild(li);
      });
    }
    // نکته علمی تازه برای هر حرکت این ست
    if (movesEl) {
      movesEl.innerHTML = "";
      movesEl.hidden = false;
      byMove.slice(0, 6).forEach((mv, idx) => {
        const name = String(mv.name || "حرکت");
        const tip = moveScienceTip(name, tipSeed("move-" + idx + "-" + name));
        if (!tip) return;
        const li = document.createElement("li");
        li.className = "done-move-science";
        const title = document.createElement("div");
        title.className = "done-move-science-name";
        title.textContent = name;
        const body = document.createElement("div");
        body.className = "done-move-science-tip";
        body.textContent = tip;
        li.appendChild(title);
        li.appendChild(body);
        movesEl.appendChild(li);
      });
      if (!movesEl.children.length) movesEl.hidden = true;
    }
    if (chart) {
      chart.innerHTML = "";
      const wrap = chart.closest(".done-chart-wrap");
      if (wrap) wrap.hidden = true;
    }
  }

  function finishRun() {
    stopLoop();
    const steps = run && run.steps ? run.steps.slice() : [];
    const stats = workStatsFromSteps(steps);
    const rounds = stats.rounds || 0;
    stopBeep();
    killAllSources();
    stopVoiceFile();
    unlockAudio();
    startBgKeepAlive();
    startSilentCtxKeep();
    run = null;
    $("#doneFrac").innerHTML =
      toFaDigits(rounds) + "<span>/</span>" + toFaDigits(rounds);
    const msg = $("#doneMsg");
    if (msg) {
      msg.textContent = "🎉 آفرین، تمرین تمام شد 🏆";
    }
    const kick = document.querySelector(".done-kicker");
    if (kick) kick.textContent = "✨ داشبورد پایان تمرین ✨";
    if (!stats.finishedAt) stats.finishedAt = new Date().toISOString();
    lastDoneStats = stats;
    try {
      localStorage.setItem("setdadr-last-done", JSON.stringify(stats));
    } catch {}
    renderDoneStats(stats);
    show("done");
    Promise.resolve()
      .then(() => speakDone(stats))
      .catch(() => {})
      .finally(() => {
        setTimeout(() => {
          if (!run) stopBgKeepAlive();
        }, 14000);
      });
  }

  $("#btnNewPlan").addEventListener("click", () => openEdit(null));
  $("#btnCancelEdit").addEventListener("click", () => {
    autoSavePlan();
    editId = null;
    show("home");
  });
  const btnStartFromEdit = $("#btnStartFromEdit");
  if (btnStartFromEdit) {
    btnStartFromEdit.addEventListener("click", () => {
      unlockAudio();
      autoSavePlan();
      if (!circuit.length) {
        try {
          $("#pickMoveName").focus();
        } catch {}
        return;
      }
      if (!editId) autoSavePlan();
      const id = editId;
      if (!id) return;
      startRun(id);
    });
  }
  const btnDoneHome = $("#btnDoneHome");
  if (btnDoneHome) btnDoneHome.addEventListener("click", () => show("home"));
  const btnDoneAgain = $("#btnDoneAgain");
  if (btnDoneAgain) {
    btnDoneAgain.addEventListener("click", () => {
      stopAllSound();
      hushKeeperToSilence();
      show("home");
    });
  }

  function openDashboard() {
    let stats = lastDoneStats;
    if (!stats) {
      try {
        const raw = localStorage.getItem("setdadr-last-done");
        if (raw) stats = JSON.parse(raw);
      } catch {}
    }
    if (!stats) {
      alert("هنوز تمرینی تمام نشده تا داشبورد داشته باشد.");
      return;
    }
    lastDoneStats = stats;
    const rounds = Math.max(0, Math.round(Number(stats.rounds) || 0));
    const frac = $("#doneFrac");
    if (frac) {
      frac.innerHTML =
        toFaDigits(rounds) + "<span>/</span>" + toFaDigits(rounds);
    }
    const msg = $("#doneMsg");
    if (msg) msg.textContent = "داشبورد آخرین تمرین";
    const kick = document.querySelector(".done-kicker");
    if (kick) kick.textContent = "✨ داشبورد تمرین ✨";
    renderDoneStats(stats);
    show("done");
    Promise.resolve()
      .then(() => speakDone(stats))
      .catch(() => {});
  }

  const btnTopDash = $("#btnTopDash");
  if (btnTopDash) {
    btnTopDash.addEventListener("click", openDashboard);
  }
  const btnHomeDash = $("#btnHomeDash");
  if (btnHomeDash) {
    btnHomeDash.addEventListener("click", openDashboard);
  }

  const moveFormEl = $("#moveForm");
  if (moveFormEl) {
    moveFormEl.addEventListener("submit", async (e) => {
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
  }

  $("#addToSetForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = ($("#pickMoveName").value || "").trim();
    if (!name) {
      try {
        $("#pickMoveName").focus();
      } catch {}
      return;
    }
    addMoveToCircuit(name, Number($("#pickWork").value) || 40);
    try {
      $("#pickMoveName").focus();
    } catch {}
  });

  ["planRounds", "planRestSet", "planRestMove"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const bump = () => {
      updatePlanSummary();
      autoSavePlan();
    };
    el.addEventListener("input", bump);
    el.addEventListener("change", bump);
  });

  const btnSavePlan = $("#btnSavePlan");
  if (btnSavePlan) {
    btnSavePlan.addEventListener("click", () => {
      autoSavePlan();
      editId = null;
      show("home");
    });
  }

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
    }, 280);
    try {
      lastGestureAt = Date.now();
    } catch {}
    // اول قطع کامل جمله‌های قبلی، بعد آنلاک
    stopAllSound();
    hushKeeperToSilence();
    unlockAudio();
    startBgKeepAlive();
    try {
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    } catch {}
    run.skipped = (run.skipped || 0) + 1;
    advance(true);
  });

  $("#btnAbort").addEventListener("click", () => {
    stopLoop();
    stopAllSound();
    stopSilentCtxKeep();
    stopBgKeepAlive();
    run = null;
    show("home");
  });

  $$("#navTabs button").forEach((b) => {
    b.addEventListener("click", () => {
      const v = b.getAttribute("data-view");
      if (v === "home") show("home");
      if (v === "edit" && !b.hidden) show("edit");
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      stopBgHeartbeat();
      resumeBgIfNeeded();
      if (run && !run.paused) {
        run.lastTick = performance.now();
        loop();
      }
    } else if (run && !run.paused && !soundMuted) {
      bgKeepOn = true;
      unlockAudio();
      startBgKeepAlive();
      resumeBgIfNeeded();
      keepSilenceAlive();
      startBgHeartbeat();
      startBgWatch();
      requestWakeLock();
      setMediaPlaying(true, (run && (run.title || "تمرین")) || "ست‌یار");
    }
  });
  window.addEventListener("pagehide", () => {
    if (run && !run.paused && !soundMuted) {
      bgKeepOn = true;
      resumeBgIfNeeded();
      startBgHeartbeat();
      startBgWatch();
      requestWakeLock();
    }
  });
  window.addEventListener("pageshow", () => {
    stopBgHeartbeat();
    resumeBgIfNeeded();
  });
  window.addEventListener("freeze", () => {
    if (run && !run.paused && !soundMuted) resumeBgIfNeeded();
  }, true);
  window.addEventListener("resume", () => resumeBgIfNeeded(), true);

  // Unlock audio on first tap (iOS/Android)
  const unlockOnce = () => unlockAudio();
  document.body.addEventListener("pointerdown", unlockOnce, { once: true });
  document.body.addEventListener("touchstart", unlockOnce, { once: true });
  document.body.addEventListener("click", unlockOnce, { once: true });
  // هر لمس، بلندگوی ثابت را آنلاک نگه می‌دارد تا عبور خودکار بدون لمس هم بخواند
  const touchKeeper = () => {
    if (soundMuted) return;
    try {
      if (run && !run.paused) {
        startBgKeepAlive();
        return;
      }
      const a = ensureKeeper();
      if (!keeperVoice && a.paused) a.load();
    } catch {}
  };
  document.addEventListener("touchend", touchKeeper, { capture: true, passive: true });
  document.addEventListener("click", touchKeeper, { capture: true });

  wireNumSteppers();
  // جلوگیری از زوم نیشگون؛ دبل‌تپ را قطع نکن (صدا/ژست iOS می‌شکند)
  try {
    document.addEventListener(
      "gesturestart",
      (e) => {
        e.preventDefault();
      },
      { passive: false }
    );
    document.addEventListener(
      "gesturechange",
      (e) => {
        e.preventDefault();
      },
      { passive: false }
    );
  } catch {}

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
