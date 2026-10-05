(() => {
  const LS = "setdadr-v1";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function load() {
    try {
      const cur = JSON.parse(localStorage.getItem(LS));
      if (cur && Array.isArray(cur.plans) && Array.isArray(cur.history)) return cur;
    } catch {}
    return { plans: [], history: [] };
  }
  function save(st) {
    localStorage.setItem(LS, JSON.stringify(st));
  }

  let state = load();
  let editId = null;
  let exercises = [];
  let run = null;

  const viewIds = ["home", "edit", "run", "history", "done"];

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

  function num(el, fallback) {
    const n = Number(el && el.value);
    return Number.isFinite(n) ? n : fallback;
  }

  function fmtSetsMeta(ex) {
    const w = Number(ex.weight) || 0;
    const weightBit = w > 0 ? " · " + w + " کیلو" : "";
    return ex.sets + " ست × " + ex.reps + " تکرار" + weightBit + " · استراحت " + (ex.rest || 0) + "ث";
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
      const totalSets = p.exercises.reduce((a, e) => a + (Number(e.sets) || 0), 0);
      li.innerHTML =
        '<div class="row"><div><div class="title"></div><div class="meta"></div></div></div>' +
        '<div class="row"></div>';
      li.querySelector(".title").textContent = p.title;
      li.querySelector(".meta").textContent =
        p.exercises.length + " حرکت · " + totalSets + " ست تعریف‌شده";
      const actions = li.children[1];
      const start = document.createElement("button");
      start.type = "button";
      start.className = "btn primary sm";
      start.textContent = "شروع و تیک ست‌ها";
      start.addEventListener("click", () => startRun(p.id));
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "btn sm";
      edit.textContent = "ویرایش ست‌ها";
      edit.addEventListener("click", () => openEdit(p.id));
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn danger sm";
      del.textContent = "حذف";
      del.addEventListener("click", () => {
        if (!confirm("این جلسه حذف شود؟")) return;
        state.plans = state.plans.filter((x) => x.id !== p.id);
        save(state);
        renderPlans();
      });
      actions.append(start, edit, del);
      ul.appendChild(li);
    });
  }

  function renderExList() {
    const ol = $("#exList");
    if (!ol) return;
    ol.innerHTML = "";
    exercises.forEach((ex, idx) => {
      const li = document.createElement("li");
      li.innerHTML =
        '<div class="ex-top"><div><div class="ex-name"></div><div class="ex-meta"></div></div></div>';
      li.querySelector(".ex-name").textContent = ex.name;
      li.querySelector(".ex-meta").textContent = fmtSetsMeta(ex);
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "btn danger sm";
      rm.textContent = "حذف";
      rm.addEventListener("click", () => {
        exercises.splice(idx, 1);
        renderExList();
      });
      li.querySelector(".ex-top").appendChild(rm);
      ol.appendChild(li);
    });
  }

  function openEdit(id) {
    editId = id || null;
    exercises = [];
    if (id) {
      const p = state.plans.find((x) => x.id === id);
      if (!p) return;
      $("#planTitle").value = p.title;
      exercises = p.exercises.map((e) => ({ ...e }));
    } else {
      $("#planTitle").value = "";
    }
    renderExList();
    show("edit");
  }

  function startRun(id) {
    const p = state.plans.find((x) => x.id === id);
    if (!p || !p.exercises.length) return;
    run = {
      planId: p.id,
      title: p.title,
      startedAt: Date.now(),
      items: p.exercises.map((ex) => ({
        name: ex.name,
        rest: Number(ex.rest) || 0,
        sets: Array.from({ length: Math.max(1, Number(ex.sets) || 1) }, () => ({
          reps: Number(ex.reps) || 1,
          weight: Number(ex.weight) || 0,
          done: false
        }))
      }))
    };
    renderRun();
    show("run");
  }

  function renderRun() {
    if (!run) return;
    $("#runTitle").textContent = run.title;
    const stack = $("#runStack");
    stack.innerHTML = "";
    let done = 0;
    let total = 0;
    run.items.forEach((item, ei) => {
      const card = document.createElement("div");
      card.className = "ex-card";
      const h = document.createElement("h3");
      h.textContent = item.name;
      card.appendChild(h);
      item.sets.forEach((s, si) => {
        total += 1;
        if (s.done) done += 1;
        const row = document.createElement("div");
        row.className = "set-row" + (s.done ? " done" : "");
        row.innerHTML =
          '<div class="n"></div>' +
          '<input type="number" min="0" step="0.5" data-k="weight" inputmode="decimal" aria-label="وزن"/>' +
          '<input type="number" min="1" data-k="reps" inputmode="numeric" aria-label="تکرار"/>' +
          '<button type="button" class="chk"></button>';
        row.querySelector(".n").textContent = "ست " + (si + 1);
        const wInp = row.querySelector('[data-k="weight"]');
        const rInp = row.querySelector('[data-k="reps"]');
        wInp.value = String(s.weight);
        rInp.value = String(s.reps);
        wInp.placeholder = "کیلو";
        rInp.placeholder = "تکرار";
        wInp.addEventListener("change", () => {
          s.weight = Number(wInp.value) || 0;
        });
        rInp.addEventListener("change", () => {
          s.reps = Math.max(1, Number(rInp.value) || 1);
        });
        const chk = row.querySelector(".chk");
        chk.textContent = s.done ? "✓" : "زد";
        chk.addEventListener("click", () => {
          s.done = !s.done;
          s.weight = Number(wInp.value) || 0;
          s.reps = Math.max(1, Number(rInp.value) || 1);
          renderRun();
        });
        card.appendChild(row);
      });
      stack.appendChild(card);
    });
    $("#runProgress").textContent = done + " از " + total + " ست انجام شد";
    $("#btnFinish").disabled = done === 0;
  }

  function finishRun() {
    if (!run) return;
    const doneSets = run.items.reduce(
      (a, it) => a + it.sets.filter((s) => s.done).length,
      0
    );
    const totalSets = run.items.reduce((a, it) => a + it.sets.length, 0);
    const entry = {
      id: uid(),
      planId: run.planId,
      title: run.title,
      finishedAt: Date.now(),
      startedAt: run.startedAt,
      doneSets,
      totalSets,
      items: run.items
    };
    state.history.unshift(entry);
    state.history = state.history.slice(0, 80);
    save(state);
    run = null;
    $("#doneSummary").textContent =
      entry.title + " · " + doneSets + " از " + totalSets + " ست ثبت شد.";
    show("done");
    renderHistory();
  }

  function renderHistory() {
    const ul = $("#histList");
    const empty = $("#histEmpty");
    if (!ul) return;
    ul.innerHTML = "";
    if (!state.history.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    state.history.forEach((h) => {
      const li = document.createElement("li");
      const when = new Date(h.finishedAt);
      const dateFa = when.toLocaleDateString("fa-IR") + " · " + when.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
      const detail = h.items
        .map((it) => {
          const done = it.sets.filter((s) => s.done);
          if (!done.length) return null;
          const last = done[done.length - 1];
          return it.name + ": " + done.length + " ست" + (last.weight ? " تا " + last.weight + "ک" : "");
        })
        .filter(Boolean)
        .join(" · ");
      li.innerHTML = '<div class="title"></div><div class="meta"></div><div class="meta"></div>';
      li.children[0].textContent = h.title;
      li.children[1].textContent = dateFa + " · " + h.doneSets + "/" + h.totalSets + " ست";
      li.children[2].textContent = detail || "بدون جزئیات";
      ul.appendChild(li);
    });
  }

  $("#btnNewPlan").addEventListener("click", () => openEdit(null));
  $("#btnCancelEdit").addEventListener("click", () => {
    editId = null;
    show("home");
  });
  $("#btnDoneHome").addEventListener("click", () => show("home"));
  $("#btnAbort").addEventListener("click", () => {
    run = null;
    show("home");
  });
  $("#btnFinish").addEventListener("click", finishRun);

  $("#exForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = ($("#exName").value || "").trim();
    if (!name) return;
    exercises.push({
      id: uid(),
      name,
      sets: Math.max(1, Math.min(20, num($("#exSets"), 3))),
      reps: Math.max(1, Math.min(100, num($("#exReps"), 10))),
      weight: Math.max(0, num($("#exWeight"), 0)),
      rest: Math.max(0, Math.min(600, num($("#exRest"), 90)))
    });
    $("#exName").value = "";
    renderExList();
    try {
      $("#exName").focus();
    } catch {}
  });

  $("#btnSavePlan").addEventListener("click", () => {
    const title = ($("#planTitle").value || "").trim() || "جلسه بدون نام";
    if (!exercises.length) {
      alert("حداقل یک حرکت با ست تعریف کن.");
      return;
    }
    if (editId) {
      const p = state.plans.find((x) => x.id === editId);
      if (p) {
        p.title = title;
        p.exercises = exercises.map((e) => ({ ...e }));
      }
    } else {
      state.plans.unshift({
        id: uid(),
        title,
        exercises: exercises.map((e) => ({ ...e })),
        createdAt: Date.now()
      });
    }
    save(state);
    editId = null;
    renderPlans();
    show("home");
  });

  $$("#navTabs button").forEach((b) => {
    b.addEventListener("click", () => {
      const v = b.getAttribute("data-view");
      if (v === "home") show("home");
      if (v === "history") {
        renderHistory();
        show("history");
      }
      if (v === "edit" && !b.hidden) show("edit");
    });
  });

  renderPlans();
  renderHistory();
  show("home");
})();
