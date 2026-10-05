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
    25: "بیست و پنج",
    30: "سی",
    35: "سی و پنج",
    40: "چهل",
    45: "چهل و پنج",
    50: "پنجاه",
    55: "پنجاه و پنج",
    60: "شصت",
    90: "نود",
    120: "صد و بیست",
    150: "صد و پنجاه",
    180: "سه دقیقه"
  };

  function faNum(n) {
    n = Math.round(n);
    if (FA_NUM[n]) return FA_NUM[n];
    if (n > 20 && n < 100) {
      const tens = Math.floor(n / 10) * 10;
      const ones = n % 10;
      const t = FA_NUM[tens] || String(tens);
      return ones ? t + " و " + (FA_NUM[ones] || ones) : t;
    }
    return String(n);
  }

  function loadVoices() {
    if (!window.speechSynthesis) return;
    const voices = speechSynthesis.getVoices() || [];
    faVoice =
      voices.find((v) => /^fa/i.test(v.lang)) ||
      voices.find((v) => /persian|farsi/i.test(v.name)) ||
      null;
    enVoice =
      voices.find((v) => /^en(-|_|$)/i.test(v.lang) && /female|zira|samantha|google/i.test(v.name)) ||
      voices.find((v) => /^en(-|_|$)/i.test(v.lang)) ||
      null;
    voiceReady = true;
  }
  if (window.speechSynthesis) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  function speak(text, langPrefer) {
    if (!window.speechSynthesis || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (langPrefer === "fa" && faVoice) {
        u.voice = faVoice;
        u.lang = faVoice.lang || "fa-IR";
      } else if (faVoice && langPrefer !== "en") {
        u.voice = faVoice;
        u.lang = faVoice.lang || "fa-IR";
      } else if (enVoice) {
        u.voice = enVoice;
        u.lang = enVoice.lang || "en-US";
      } else {
        u.lang = langPrefer === "en" ? "en-US" : "fa-IR";
      }
      u.rate = 1.05;
      u.pitch = 1;
      speechSynthesis.speak(u);
    } catch {}
  }

  function speakSeconds(sec) {
    const n = Math.round(sec);
    if (faVoice) {
      speak(faNum(n) + " ثانیه", "fa");
    } else {
      speak(n + " seconds", "en");
    }
  }

  function speakPhase(kind, name, sec) {
    if (faVoice) {
      if (kind === "work") speak((name || "حرکت") + "، " + faNum(sec) + " ثانیه", "fa");
      else if (kind === "rest-set") speak("استراحت ست، " + faNum(sec) + " ثانیه", "fa");
      else speak("استراحت، " + faNum(sec) + " ثانیه", "fa");
    } else {
      if (kind === "work") speak((name || "move") + ", " + sec + " seconds", "en");
      else if (kind === "rest-set") speak("set rest, " + sec + " seconds", "en");
      else speak("rest, " + sec + " seconds", "en");
    }
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
      li.querySelector(".title").textContent = p.title;
      li.querySelector(".meta").textContent =
        p.circuit.length + " حرکت در هر ست · " + p.rounds + " ست · استراحت ست " + p.restSet + "ث";
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

  function openEdit(id) {
    editId = id || null;
    circuit = [];
    if (id) {
      const p = state.plans.find((x) => x.id === id);
      if (!p) return;
      $("#planTitle").value = p.title;
      $("#planRounds").value = String(p.rounds);
      $("#planRestSet").value = String(p.restSet);
      $("#planRestMove").value = String(p.restMove);
      circuit = p.circuit.map((c) => ({ ...c }));
    } else {
      $("#planTitle").value = "";
      $("#planRounds").value = "4";
      $("#planRestSet").value = "60";
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
    if (window.speechSynthesis) {
      try {
        speechSynthesis.resume();
      } catch {}
      speak("شروع", "fa");
    }
    const steps = buildTimeline(p);
    run = {
      planId: p.id,
      title: p.title,
      steps,
      i: 0,
      left: steps[0].dur,
      phaseDur: steps[0].dur,
      paused: false,
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
    const isRest = step.kind !== "work";
    stage.classList.toggle("work", !isRest);
    stage.classList.toggle("rest", isRest);
    $("#runFrac").innerHTML = toFaDigits(step.round) + "<span>/</span>" + toFaDigits(step.rounds);
    $("#runFracLbl").textContent = "ست";
    $("#runPhase").textContent =
      step.kind === "work" ? "کار" : step.kind === "rest-set" ? "استراحت ست" : "استراحت";
    $("#runMove").textContent = step.kind === "work" ? step.name : step.name;
    $("#runTimer").textContent = fmt(run.left);
    $("#runSub").textContent =
      "حرکت " + toFaDigits(step.moveIndex) + " از " + toFaDigits(step.moveCount) + " · " + run.title;
    $("#btnPause").textContent = run.paused ? "ادامه" : "توقف";
    paintNext();
    if (announceStart) {
      speakPhase(step.kind, step.name, step.dur);
    }
  }

  function paintNext() {
    const card = $("#nextCard");
    const nameEl = $("#nextName");
    const metaEl = $("#nextMeta");
    if (!card || !run) return;
    const next = run.steps[run.i + 1];
    if (!next) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    if (next.kind === "work") {
      nameEl.textContent = next.name;
      metaEl.textContent =
        "کار · " + toFaDigits(next.dur) + " ثانیه · ست " + toFaDigits(next.round) + "/" + toFaDigits(next.rounds);
    } else if (next.kind === "rest-set") {
      nameEl.textContent = "استراحت بین ست";
      metaEl.textContent = toFaDigits(next.dur) + " ثانیه · بعد ست " + toFaDigits(Math.min(next.round + 1, next.rounds));
    } else {
      nameEl.textContent = "استراحت بین حرکت";
      metaEl.textContent = toFaDigits(next.dur) + " ثانیه";
    }
  }

  function finishRun() {
    stopLoop();
    if (window.speechSynthesis) {
      if (faVoice) speak("تمام", "fa");
      else speak("done", "en");
    }
    const last = run && run.steps.length ? run.steps[run.steps.length - 1] : null;
    const rounds = last ? last.rounds : 0;
    run = null;
    $("#doneFrac").innerHTML = toFaDigits(rounds) + "<span>/</span>" + toFaDigits(rounds);
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
    const title = ($("#planTitle").value || "").trim() || "جلسه";
    const rounds = Math.max(1, Math.min(30, Number($("#planRounds").value) || 4));
    const restSet = Math.max(0, Math.min(600, Number($("#planRestSet").value) || 0));
    const restMove = Math.max(0, Math.min(300, Number($("#planRestMove").value) || 0));
    if (!circuit.length) return;
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
      if (window.speechSynthesis) speechSynthesis.cancel();
    } else {
      run.lastTick = performance.now();
      loop();
    }
    paintRun(false);
  });

  $("#btnSkip").addEventListener("click", () => {
    if (!run) return;
    advance();
  });

  $("#btnAbort").addEventListener("click", () => {
    stopLoop();
    if (window.speechSynthesis) speechSynthesis.cancel();
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

  // Unlock audio on first tap (iOS)
  document.body.addEventListener(
    "pointerdown",
    () => {
      if (!window.speechSynthesis) return;
      try {
        speechSynthesis.resume();
      } catch {}
    },
    { once: true }
  );

  renderMoves();
  renderPlans();
  show("home");
})();
