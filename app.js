(() => {
  const LS = "setdadr-v2";

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
    faVoice =
      voices.find((v) => /^fa(-|_|$)/i.test(v.lang)) ||
      voices.find((v) => /persian|farsi|فارسی/i.test(v.name)) ||
      voices.find((v) => /fa-IR|fa_IR/i.test(v.lang)) ||
      null;
    enVoice =
      voices.find((v) => /^en(-|_|$)/i.test(v.lang) && /female|zira|samantha|google|aria|jenny/i.test(v.name)) ||
      voices.find((v) => /^en-US/i.test(v.lang)) ||
      voices.find((v) => /^en(-|_|$)/i.test(v.lang)) ||
      null;
    voiceReady = !!voices.length;
  }
  if (window.speechSynthesis) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  function unlockAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch {}
    if (window.speechSynthesis) {
      try {
        speechSynthesis.resume();
        // warm-up silent utterance helps some Android engines
        if (!voiceReady) loadVoices();
      } catch {}
    }
  }

  function stopBeep() {
    if (!activeBeep) return;
    try {
      activeBeep.gain.gain.cancelScheduledValues(audioCtx ? audioCtx.currentTime : 0);
      activeBeep.gain.gain.value = 0;
      activeBeep.osc.stop();
      activeBeep.osc.disconnect();
      activeBeep.gain.disconnect();
    } catch {}
    activeBeep = null;
  }

  function stopAllSound() {
    speakToken += 1;
    stopBeep();
    if (window.speechSynthesis) {
      try {
        speechSynthesis.cancel();
      } catch {}
    }
  }

  /** بوق سفید کوتاه — همیشه یک نمونه؛ دوبار زدن روی هم نمی‌رود */
  function beepWhite(ms) {
    try {
      unlockAudio();
      if (!audioCtx) return;
      stopBeep();
      const dur = Math.max(0.04, (ms || 140) / 1000);
      const t0 = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      // سفیدِ ملایم: موج سینوسی با نویز خیلی کوتاه حس «بوق سفید»
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, t0);
      osc.frequency.exponentialRampToValueAtTime(660, t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
      activeBeep = { osc, gain };
      osc.onended = () => {
        if (activeBeep && activeBeep.osc === osc) activeBeep = null;
      };
    } catch {}
  }

  /** صدای فارسی؛ همیشه lang=fa-IR — صف صدا قفل می‌شود تا زوم نشود */
  function speakFa(text) {
    if (!window.speechSynthesis || !text) return;
    unlockAudio();
    speakToken += 1;
    const tok = speakToken;
    try {
      speechSynthesis.cancel();
    } catch {}
    // بعد از cancel کمی صبر — بدون این روی کروم/اندروید صدا روی هم می‌افتد
    setTimeout(() => {
      if (tok !== speakToken) return;
      try {
        if (speechSynthesis.speaking || speechSynthesis.pending) {
          try {
            speechSynthesis.cancel();
          } catch {}
        }
        const u = new SpeechSynthesisUtterance(String(text));
        u.lang = "fa-IR";
        if (faVoice) {
          u.voice = faVoice;
          u.lang = faVoice.lang || "fa-IR";
        }
        u.rate = 1;
        u.pitch = 1;
        u.volume = 1;
        speechSynthesis.speak(u);
      } catch {}
    }, 80);
  }

  function speakSeconds(sec) {
    const n = Math.round(sec);
    beepWhite(90);
    speakFa(faNum(n));
  }

  function speakPhase(step) {
    const n = Math.round(step.dur);
    beepWhite(140);
    speakFa(faNum(n) + " ثانیه");
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

  function renderMoves() {
    const ul = $("#moveLib");
    const empty = $("#moveEmpty");
    const dl = $("#moveDatalist");
    if (!ul) return;
    ul.innerHTML = "";
    if (dl) dl.innerHTML = "";
    if (!state.moves.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    state.moves.forEach((m) => {
      if (dl) {
        const opt = document.createElement("option");
        opt.value = m.name;
        dl.appendChild(opt);
      }
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
      start.addEventListener("click", () => startRun(p.id));
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
      lastTick: performance.now()
    };
    paintRun(true);
    show("run");
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
    const left = Math.ceil(run.left);
    const marks = [20, 10];
    marks.forEach((m) => {
      const key = run.i + ":" + m;
      if (run.phaseDur > m && left === m && !run.announced[key]) {
        run.announced[key] = true;
        speakSeconds(m);
      }
    });
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
    run.lastTick = performance.now();
    paintRun(true);
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
      moveEl.textContent = "";
      moveEl.hidden = true;
      if (mc) {
        mc.innerHTML =
          toFaDigits(step.moveIndex) + "<span>/</span>" + toFaDigits(step.moveCount);
      }
      if (mpi) mpi.hidden = false;
      $("#runSub").textContent = "";
    }
    $("#runTimer").textContent = fmt(run.left);
    $("#btnPause").textContent = run.paused ? "ادامه" : "توقف";
    paintNext();
    if (announceStart) {
      speakPhase(step);
    }
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
        return;
      }
      card.classList.add("is-rest-next");
      showFlow("حرکت بعدی", step.nextName, true);
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
      showFlow("↓ استراحت " + toFaDigits(next.dur) + "ث", next.nextName, true);
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
    speakFa(faNum(rounds) + " ست");
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
    try {
      $("#moveName").focus();
    } catch {}
  });

  $("#addToSetForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = ($("#pickMoveName").value || "").trim();
    if (!name) return;
    let work = Math.max(5, Number($("#pickWork").value) || 40);
    const known = state.moves.find((m) => m.name === name);
    if (known && !Number($("#pickWork").value)) work = known.work;
    if (!known) {
      state.moves.unshift({ id: uid(), name, work });
      save(state);
      renderMoves();
    } else if (!$("#pickWork").value) {
      work = known.work;
    }
    circuit.push({ id: uid(), name, work });
    $("#pickMoveName").value = "";
    renderCircuit();
    try {
      $("#pickMoveName").focus();
    } catch {}
  });

  $("#pickMoveName").addEventListener("change", () => {
    const name = ($("#pickMoveName").value || "").trim();
    const known = state.moves.find((m) => m.name === name);
    if (known) $("#pickWork").value = String(known.work);
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
  renderMoves();
  renderPlans();
  show("home");
})();
