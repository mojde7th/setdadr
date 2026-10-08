(() => {
  const LS = "setdadr-v2";
  const APP_VER = "33";

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
  const VOICE_Q = "?v=33";
  const VOICE_FILES = {
    count: { 10: true, 20: true, 30: true, 60: true },
    phase: {},
    done: {}
  };
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
      const n = (v.name || "") + " " + (v.lang || "");
      if (preferLang.test(v.lang || "")) s += 5;
      if (/female|zira|samantha|aria|jenny|susan|hazel|neural|google/i.test(n)) s += 4;
      if (/male|david|mark|george|james/i.test(n)) s -= 3;
      if (/compact|eloquence/i.test(n)) s -= 1;
      return s;
    };
    faVoice =
      [...voices]
        .filter((v) => /^fa(-|_|$)/i.test(v.lang) || /persian|farsi|فارسی/i.test(v.name))
        .sort((a, b) => scoreVoice(b, /^fa/) - scoreVoice(a, /^fa/))[0] ||
      voices.find((v) => /fa-IR|fa_IR|fa-AF/i.test(v.lang)) ||
      null;
    enVoice =
      [...voices]
        .filter((v) => /^en(-|_|$)/i.test(v.lang))
        .sort((a, b) => scoreVoice(b, /^en/) - scoreVoice(a, /^en/))[0] ||
      null;
    voiceReady = !!voices.length;
  }
  if (window.speechSynthesis) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
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
    btn.textContent = soundMuted ? "صدا قطع" : "صدا روشن";
  }

  function setSoundMuted(on) {
    soundMuted = !!on;
    try {
      localStorage.setItem(MUTE_LS, soundMuted ? "1" : "0");
    } catch {}
    if (soundMuted) stopAllSound();
    paintMuteBtn();
  }

  function queueAnnounce(task) {
    announceChain = announceChain.then(() => task()).catch(() => {});
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
    stopBeep();
    stopVoiceFile();
    if (window.speechSynthesis) {
      try {
        speechSynthesis.cancel();
      } catch {}
    }
  }

  function beepWhite(ms, soft) {
    if (soundMuted) return;
    try {
      unlockAudio();
      if (!audioCtx) return;
      const play = () => {
        stopBeep();
        const t0 = audioCtx.currentTime;
        const master = audioCtx.createGain();
        const comp = audioCtx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-18, t0);
        comp.knee.setValueAtTime(12, t0);
        comp.ratio.setValueAtTime(4, t0);
        comp.attack.setValueAtTime(0.003, t0);
        comp.release.setValueAtTime(0.18, t0);
        const filter = audioCtx.createBiquadFilter();
        filter.type = "highshelf";
        filter.frequency.setValueAtTime(1800, t0);
        filter.gain.setValueAtTime(soft ? 2 : 6, t0);

        // زنگ باشگاهی چندنُته — بلند و مشخص، نه بوق تیز زشت
        const notes = soft
          ? [
              { f: 698.46, at: 0, dur: 0.2, g: 0.55 },
              { f: 880.0, at: 0.12, dur: 0.28, g: 0.45 }
            ]
          : [
              { f: 659.25, at: 0, dur: 0.15, g: 1.15 },
              { f: 830.61, at: 0.1, dur: 0.15, g: 1.25 },
              { f: 1046.5, at: 0.2, dur: 0.18, g: 1.35 },
              { f: 1318.51, at: 0.34, dur: 0.38, g: 1.2 }
            ];

        const total = soft ? 0.45 : 0.78;
        const peak = soft ? 0.7 : 1.55;
        master.gain.setValueAtTime(0.0001, t0);
        master.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
        master.gain.setValueAtTime(peak * 0.85, t0 + total * 0.55);
        master.gain.exponentialRampToValueAtTime(0.0001, t0 + total);

        master.connect(filter);
        filter.connect(comp);
        comp.connect(audioCtx.destination);

        const oscs = [];
        notes.forEach((n) => {
          const o1 = audioCtx.createOscillator();
          const o2 = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o1.type = "sine";
          o2.type = "triangle";
          o1.frequency.setValueAtTime(n.f, t0 + n.at);
          o2.frequency.setValueAtTime(n.f * 2.0, t0 + n.at);
          const gt = t0 + n.at;
          g.gain.setValueAtTime(0.0001, gt);
          g.gain.exponentialRampToValueAtTime(n.g, gt + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, gt + n.dur);
          o1.connect(g);
          o2.connect(g);
          g.connect(master);
          o1.start(gt);
          o2.start(gt);
          o1.stop(gt + n.dur + 0.03);
          o2.stop(gt + n.dur + 0.03);
          oscs.push(o1, o2);
        });

        // کلیک کوتاه حمله برای شنیده‌شدن وسط سر و صدا
        if (!soft) {
          const noiseDur = 0.04;
          const bufSize = Math.floor(audioCtx.sampleRate * noiseDur);
          const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
          const data = buf.getChannelData(0);
          for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
          const src = audioCtx.createBufferSource();
          const ng = audioCtx.createGain();
          const nf = audioCtx.createBiquadFilter();
          nf.type = "bandpass";
          nf.frequency.setValueAtTime(2200, t0);
          nf.Q.setValueAtTime(1.2, t0);
          src.buffer = buf;
          ng.gain.setValueAtTime(0.35, t0);
          ng.gain.exponentialRampToValueAtTime(0.0001, t0 + noiseDur);
          src.connect(nf);
          nf.connect(ng);
          ng.connect(master);
          src.start(t0);
          src.stop(t0 + noiseDur + 0.01);
        }

        activeBeep = { osc: oscs[0], gain: master, oscs };
        if (oscs[0]) {
          oscs[oscs.length - 1].onended = () => {
            if (activeBeep && activeBeep.gain === master) activeBeep = null;
          };
        }
      };
      if (audioCtx.state === "suspended") {
        audioCtx.resume().then(play).catch(play);
      } else {
        play();
      }
    } catch {}
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

  async function playVoiceFile(rel, vol) {
    try {
      if (soundMuted) return false;
      unlockAudio();
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

  function speakFaSynthAsync(text, vol, lang) {
    return new Promise((resolve) => {
      if (soundMuted || !window.speechSynthesis || !text) {
        resolve(false);
        return;
      }
      unlockAudio();
      loadVoices();
      speakToken += 1;
      const tok = speakToken;
      try {
        speechSynthesis.cancel();
      } catch {}
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
          const useEn = lang === "en" && enVoice;
          if (useEn) {
            u.voice = enVoice;
            u.lang = enVoice.lang || "en-US";
            u.rate = 1.12;
            u.pitch = 1.15;
          } else {
            u.lang = "fa-IR";
            if (faVoice) {
              u.voice = faVoice;
              u.lang = faVoice.lang || "fa-IR";
            }
            // ورزشی، پرانرژی، نه کند و غمگین
            u.rate = 1.22;
            u.pitch = 1.22;
          }
          u.volume = vol == null ? 1 : Math.min(1, vol);
          let finished = false;
          const done = (ok) => {
            if (finished) return;
            finished = true;
            resolve(!!ok);
          };
          u.onend = () => done(true);
          u.onerror = () => done(false);
          speechSynthesis.speak(u);
          setTimeout(() => done(true), Math.min(6000, 800 + String(text).length * 180));
        } catch {
          resolve(false);
        }
      }, 50);
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
    lunges: "لانج",
    لانج: "لانج",
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
    استراحت: "استراحت"
  };

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

  async function speakMoveName(name, vol) {
    const { text, lang } = sayForMove(name);
    if (!text) return false;
    return speakFaSynthAsync(text, vol == null ? 0.95 : vol, lang);
  }

  async function speakPhase(step) {
    return queueAnnounce(async () => {
      // تمرین: زنگ + اسم حرکت یک‌بار
      // استراحت: زنگ + «حرکت بعد» + اسم
      buzz(step.kind === "work" ? [100, 45, 100, 45, 160] : [70, 35, 70, 35, 90]);
      beepWhite(400, false);
      await sleep(280);
      if (step.kind === "work") {
        if (step.name) await speakMoveName(step.name, 1);
        return;
      }
      const name = step.nextName || "";
      if (!name) return;
      await speakFaSynthAsync("حرکت بعد", 1);
      await sleep(120);
      await speakMoveName(name, 1);
    });
  }

  async function speakDoneAmount(sec) {
    const n = Math.round(sec);
    if (n <= 0) return;
    return queueAnnounce(async () => {
      buzz([55, 30, 90]);
      await sleep(50);
      // فقط مقدار انجام‌شده؛ اسم را دوباره نگو
      const phrase = faNum(n) + " ثانیه انجام دادی";
      await speakFaSynthAsync(phrase, 1);
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
  }

  function loop() {
    stopLoop();
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
    raf = requestAnimationFrame(loop);
  }

  function maybeAnnounce() {
    if (!run) return;
    const cur = Math.ceil(run.left);
    const prev = run.prevLeftCeil;
    run.prevLeftCeil = cur;
    if (prev == null) return;

    // یک‌بار بعد از حدود دوسوم انجام‌شده (+ اسم حرکت)
    const midKey = run.i + ":twoThirds";
    const thirdLeft = Math.ceil(run.phaseDur / 3);
    if (run.phaseDur >= 12 && !run.announced[midKey] && prev > thirdLeft && cur <= thirdLeft) {
      run.announced[midKey] = true;
      const done = Math.max(1, Math.round(run.phaseDur - cur));
      speakDoneAmount(done);
    }

    // ۴ ثانیه مانده: بوق ملایم
    const softKey = run.i + ":soft4";
    if (run.phaseDur > 5 && !run.announced[softKey] && prev > 4 && cur <= 4) {
      run.announced[softKey] = true;
      beepWhite(220, true);
      buzz([90, 40, 120]);
    }
  }

  function advance() {
    if (!run) return;
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

  $("#moveForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = ($("#moveName").value || "").trim();
    if (!name) return;
    const work = Math.max(5, Number($("#moveWork").value) || 40);
    state.moves.unshift({ id: uid(), name, work });
    save(state);
    $("#moveName").value = "";
    renderMoves();
  });

  $("#addToSetForm").addEventListener("submit", (e) => {
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
    } else {
      unlockAudio();
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
