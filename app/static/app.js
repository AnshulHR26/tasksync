"use strict";

/* ================= Storage (safe if blocked) ================= */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/* ================= State ================= */
const state = {
  token: store.get("token"),
  user: null,
  tasks: [],
  view: store.get("view") || "today",
  priority: "all",
  search: "",
  authMode: "login",
  ws: null,
  wsRetry: 0,
  editing: null,
  day: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* ================= Helpers ================= */
function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function icon(name) {
  const paths = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    edit: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M4 10h16M9 3v4M15 3v4" stroke="currentColor" stroke-width="2"/>',
  };
  const span = document.createElement("span");
  span.style.display = "contents";
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${name === "check" ? 14 : 16}" height="${name === "check" ? 14 : 16}" aria-hidden="true">${paths[name]}</svg>`;
  return span.firstChild;
}

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return ymd(d); };
const localDay = (iso) => (iso ? ymd(new Date(iso)) : null);

function dueLabel(s) {
  const t = todayStr();
  if (s === t) return "Today";
  if (s === addDays(t, 1)) return "Tomorrow";
  if (s === addDays(t, -1)) return "Yesterday";
  const d = parseDay(s);
  const diff = Math.round((d - parseDay(t)) / 86400000);
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  const opts = { day: "numeric", month: "short" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
}

function longDate(s) {
  return parseDay(s).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const PRIORITY_LABEL = { high: "High", medium: "Medium", low: "Low" };

function byPriorityThenDue(a, b) {
  return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    || (a.due_date || "9999").localeCompare(b.due_date || "9999")
    || a.id - b.id;
}

/* ================= API ================= */
async function api(path, { method = "GET", body, form } = {}) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  let payload;
  if (form) {
    payload = new URLSearchParams(form);
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, { method, headers, body: payload });
  } catch {
    throw new Error("Can't reach the server. Is it running?");
  }
  if (res.status === 401 && state.token && !path.startsWith("/auth/")) {
    logout("Your session expired. Please log in again.");
    throw new Error("Session expired");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    if (typeof data?.detail === "string") msg = data.detail;
    else if (Array.isArray(data?.detail) && data.detail[0]) {
      const d = data.detail[0];
      const field = d.loc?.[d.loc.length - 1];
      msg = field ? `${field}: ${d.msg}` : d.msg;
    }
    throw new Error(msg);
  }
  return data;
}

/* ================= Toasts ================= */
function toast(message, { error = false, action, onAction, timeout = 4000 } = {}) {
  const el = h("div", { class: "toast" + (error ? " error" : ""), role: "status" }, [h("span", {}, message)]);
  let timer;
  const close = () => { clearTimeout(timer); el.remove(); };
  if (action) {
    el.append(h("button", { type: "button", onclick: () => { close(); onAction(); } }, action));
  }
  $("#toasts").append(el);
  timer = setTimeout(close, timeout);
  while ($("#toasts").children.length > 3) $("#toasts").firstChild.remove();
}

/* ================= Theme ================= */
function applyTheme(theme) {
  if (theme) document.documentElement.setAttribute("data-theme", theme);
  else document.documentElement.removeAttribute("data-theme");
}
applyTheme(store.get("theme"));

$("#theme-btn").addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme")
    || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  store.set("theme", next);
});

/* ================= Auth ================= */
function setAuthMode(mode) {
  state.authMode = mode;
  $$(".seg button").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  $("#auth-submit").textContent = mode === "login" ? "Log in" : "Create account";
  $("#auth-password").autocomplete = mode === "login" ? "current-password" : "new-password";
  $("#auth-error").hidden = true;
}
$$(".seg button").forEach((b) => b.addEventListener("click", () => setAuthMode(b.dataset.mode)));

$("#auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  const err = $("#auth-error");
  err.hidden = true;

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return showAuthError("Enter a valid email address.");
  if (password.length < 8) return showAuthError("Password must be at least 8 characters.");

  const btn = $("#auth-submit");
  btn.disabled = true;
  try {
    if (state.authMode === "register") {
      await api("/auth/register", { method: "POST", body: { email, password } });
    }
    const tok = await api("/auth/login", { method: "POST", form: { username: email, password } });
    state.token = tok.access_token;
    store.set("token", state.token);
    $("#auth-password").value = "";
    await startApp();
    if (state.authMode === "register") toast("Welcome! Your account is ready.");
  } catch (ex) {
    showAuthError(ex.message);
  } finally {
    btn.disabled = false;
  }

  function showAuthError(msg) {
    err.textContent = msg;
    err.hidden = false;
  }
});

function logout(message) {
  state.token = null;
  state.user = null;
  state.tasks = [];
  store.del("token");
  const ws = state.ws;
  state.ws = null;
  if (ws) ws.close();
  $("#app-view").hidden = true;
  $("#auth-view").hidden = false;
  $("#user-menu").hidden = true;
  setAuthMode("login");
  document.title = "Daily Tasks";
  if (message) toast(message, { error: true });
  setTimeout(() => $("#auth-email").focus(), 0);
}

$("#logout-btn").addEventListener("click", () => logout());

/* ================= User menu & password ================= */
$("#user-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  const menu = $("#user-menu");
  menu.hidden = !menu.hidden;
  $("#user-btn").setAttribute("aria-expanded", String(!menu.hidden));
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".menu")) $("#user-menu").hidden = true;
});

$("#pw-btn").addEventListener("click", () => {
  $("#user-menu").hidden = true;
  $("#pw-form").reset();
  $("#pw-error").hidden = true;
  $("#pw-dialog").showModal();
});

$("#pw-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const current_password = $("#pw-current").value;
  const new_password = $("#pw-new").value;
  const err = $("#pw-error");
  if (new_password.length < 8) {
    err.textContent = "New password must be at least 8 characters.";
    err.hidden = false;
    return;
  }
  try {
    await api("/users/me/password", { method: "POST", body: { current_password, new_password } });
    $("#pw-dialog").close();
    toast("Password updated.");
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

$$("dialog [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
$$("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

/* ================= Data ================= */
async function loadTasks() {
  state.tasks = await api("/tasks?limit=1000");
  render();
}

let refreshTimer;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => loadTasks().catch(() => {}), 150);
}

function upsert(task) {
  const i = state.tasks.findIndex((t) => t.id === task.id);
  if (i === -1) state.tasks.unshift(task); else state.tasks[i] = task;
}

/* ================= Views ================= */
const VIEWS = {
  today: { title: "Today", sub: () => longDate(todayStr()) },
  upcoming: { title: "Upcoming", sub: () => "Everything scheduled after today" },
  all: { title: "All open tasks", sub: () => "Every task that isn't done yet" },
  completed: { title: "Completed", sub: () => "Nice work" },
};

function counts() {
  const t = todayStr();
  const open = state.tasks.filter((x) => !x.completed);
  return {
    today: open.filter((x) => x.due_date && x.due_date <= t).length,
    upcoming: open.filter((x) => x.due_date && x.due_date > t).length,
    all: open.length,
    completed: state.tasks.length - open.length,
  };
}

function visibleTasks() {
  const q = state.search.trim().toLowerCase();
  return state.tasks.filter((x) =>
    (state.priority === "all" || x.priority === state.priority)
    && (!q || x.title.toLowerCase().includes(q) || (x.description || "").toLowerCase().includes(q)));
}

function groupsFor(view, tasks) {
  const t = todayStr();
  const open = tasks.filter((x) => !x.completed).sort(byPriorityThenDue);
  const groups = [];
  const push = (key, title, items, cls) => { if (items.length) groups.push({ key, title, items, cls }); };

  if (view === "today") {
    push("overdue", "Overdue", open.filter((x) => x.due_date && x.due_date < t), "overdue");
    push("today", "Today", open.filter((x) => x.due_date === t));
    const doneToday = tasks.filter((x) => x.completed && localDay(x.completed_at) === t);
    push("done", "Done today", doneToday.sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || "")));
  } else if (view === "upcoming") {
    const future = open.filter((x) => x.due_date && x.due_date > t)
      .sort((a, b) => a.due_date.localeCompare(b.due_date) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
    const byDay = new Map();
    for (const x of future) {
      if (!byDay.has(x.due_date)) byDay.set(x.due_date, []);
      byDay.get(x.due_date).push(x);
    }
    for (const [day, items] of byDay) {
      const label = dueLabel(day);
      push(day, label === longDate(day) ? label : `${label} · ${parseDay(day).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`, items);
    }
  } else if (view === "all") {
    push("overdue", "Overdue", open.filter((x) => x.due_date && x.due_date < t), "overdue");
    push("today", "Today", open.filter((x) => x.due_date === t));
    push("later", "Upcoming", open.filter((x) => x.due_date && x.due_date > t)
      .sort((a, b) => a.due_date.localeCompare(b.due_date)));
    push("nodate", "No due date", open.filter((x) => !x.due_date));
  } else {
    const done = tasks.filter((x) => x.completed)
      .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || "") || b.id - a.id);
    push("today", "Completed today", done.filter((x) => localDay(x.completed_at) === t));
    push("earlier", "Earlier", done.filter((x) => localDay(x.completed_at) !== t));
  }
  return groups;
}

function taskRow(task) {
  const t = todayStr();
  const meta = [];
  if (task.due_date) {
    const cls = !task.completed && task.due_date < t ? "overdue" : task.due_date === t ? "today" : "";
    meta.push(h("span", { class: `tag ${cls}`, title: longDate(task.due_date) }, [icon("cal"), dueLabel(task.due_date)]));
  }
  meta.push(h("span", { class: "tag" }, [h("span", { class: `pdot ${task.priority}` }), PRIORITY_LABEL[task.priority]]));
  if (task.completed && task.completed_at) {
    meta.push(h("span", { class: "tag" }, `Done ${new Date(task.completed_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`));
  }

  return h("li", { class: `task p-${task.priority}${task.completed ? " done" : ""}`, "data-id": task.id }, [
    h("button", {
      class: "check", type: "button",
      "aria-label": task.completed ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`,
      onclick: () => toggleTask(task),
    }, icon("check")),
    h("div", { class: "task-body", onclick: () => openEdit(task) }, [
      h("div", { class: "task-title" }, task.title),
      task.description ? h("div", { class: "task-desc" }, task.description) : null,
      h("div", { class: "meta" }, meta),
    ]),
    h("div", { class: "task-actions" }, [
      h("button", { type: "button", title: "Edit", "aria-label": "Edit task", onclick: () => openEdit(task) }, icon("edit")),
      h("button", { type: "button", class: "del", title: "Delete", "aria-label": "Delete task", onclick: () => deleteTask(task) }, icon("trash")),
    ]),
  ]);
}

const EMPTY = {
  today: ["You're all clear for today", "Add a task above, or check Upcoming for what's next."],
  upcoming: ["Nothing scheduled ahead", "Give a task a future due date and it will show up here."],
  all: ["No open tasks", "Everything is done. Add something new above."],
  completed: ["Nothing completed yet", "Tick a task's circle to mark it done."],
};

function render() {
  if (!state.user) return;
  state.day = todayStr();
  const c = counts();
  for (const k of Object.keys(c)) $(`#count-${k}`).textContent = c[k] || "";
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
  $$("#priority-chips .chip").forEach((b) => b.classList.toggle("active", b.dataset.priority === state.priority));

  const v = VIEWS[state.view];
  $("#view-title").textContent = v.title;
  $("#view-sub").textContent = v.sub();
  $("#add-form").hidden = state.view === "completed";
  document.title = c.today ? `(${c.today}) Daily Tasks` : "Daily Tasks";

  // Today's progress: done today vs still due today/overdue
  const t = state.day;
  const doneToday = state.tasks.filter((x) => x.completed && localDay(x.completed_at) === t).length;
  const total = doneToday + c.today;
  const pct = total ? Math.round((doneToday / total) * 100) : 0;
  $("#progress-label").textContent = total
    ? (c.today ? `${doneToday} of ${total} done today` : `All ${total} done today 🎉`)
    : "Nothing due today";
  $("#progress-pct").textContent = total ? `${pct}%` : "";
  $("#progress-fill").style.width = `${pct}%`;

  const groups = groupsFor(state.view, visibleTasks());
  const list = $("#list");
  list.replaceChildren(...groups.map((g) =>
    h("section", { class: `group ${g.cls || ""}` }, [
      h("h3", {}, [g.title, h("span", { class: "n" }, String(g.items.length))]),
      h("ul", { class: "tasks" }, g.items.map(taskRow)),
    ])));

  const empty = $("#empty");
  if (!groups.length) {
    const filtered = state.search || state.priority !== "all";
    const [title, text] = filtered ? ["No matching tasks", "Try a different search or priority filter."] : EMPTY[state.view];
    empty.replaceChildren(h("strong", {}, title), text);
    empty.hidden = false;
  } else {
    empty.hidden = true;
  }
  $("#completed-actions").hidden = !(state.view === "completed" && c.completed);
}

function setView(view) {
  state.view = view;
  store.set("view", view);
  const t = todayStr();
  $("#add-due").value = view === "today" ? t : view === "upcoming" ? addDays(t, 1) : "";
  render();
}

$$(".nav-item").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
$$("#priority-chips .chip").forEach((b) => b.addEventListener("click", () => {
  state.priority = b.dataset.priority;
  render();
}));
$("#search").addEventListener("input", (e) => { state.search = e.target.value; render(); });

/* ================= Task actions ================= */
$("#add-notes-btn").addEventListener("click", () => {
  const d = $("#add-desc");
  d.hidden = !d.hidden;
  $("#add-notes-btn").textContent = d.hidden ? "+ Notes" : "− Notes";
  if (!d.hidden) d.focus();
});

$("#add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("#add-title").value.trim();
  if (!title) { $("#add-title").focus(); return; }
  const body = {
    title,
    description: $("#add-desc").value.trim() || null,
    priority: $("#add-priority").value,
    due_date: $("#add-due").value || null,
  };
  const btn = $("#add-submit");
  btn.disabled = true;
  try {
    const task = await api("/tasks", { method: "POST", body });
    upsert(task);
    $("#add-title").value = "";
    $("#add-desc").value = "";
    render();
    flash(task.id);
    if (!isVisibleInView(task)) toast(`Added to ${task.due_date ? dueLabel(task.due_date) : "All open"}`);
  } catch (ex) {
    toast(ex.message, { error: true });
  } finally {
    btn.disabled = false;
    $("#add-title").focus();
  }
});

function isVisibleInView(task) {
  return groupsFor(state.view, visibleTasks()).some((g) => g.items.some((x) => x.id === task.id));
}

function flash(id) {
  const el = document.querySelector(`.task[data-id="${id}"]`);
  if (el) el.classList.add("flash");
}

async function toggleTask(task) {
  const completed = !task.completed;
  const before = { ...task };
  Object.assign(task, { completed, completed_at: completed ? new Date().toISOString() : null });
  render();
  try {
    upsert(await api(`/tasks/${task.id}`, { method: "PATCH", body: { completed } }));
    render();
    if (completed) toast("Task completed", { action: "Undo", onAction: () => toggleTask(state.tasks.find((x) => x.id === task.id) || task) });
  } catch (ex) {
    Object.assign(task, before);
    render();
    toast(ex.message, { error: true });
  }
}

async function deleteTask(task) {
  state.tasks = state.tasks.filter((x) => x.id !== task.id);
  render();
  try {
    await api(`/tasks/${task.id}`, { method: "DELETE" });
    toast("Task deleted", { action: "Undo", timeout: 6000, onAction: () => restoreTask(task) });
  } catch (ex) {
    upsert(task);
    render();
    toast(ex.message, { error: true });
  }
}

async function restoreTask(task) {
  try {
    let t = await api("/tasks", {
      method: "POST",
      body: { title: task.title, description: task.description, priority: task.priority, due_date: task.due_date },
    });
    if (task.completed) t = await api(`/tasks/${t.id}`, { method: "PATCH", body: { completed: true } });
    upsert(t);
    render();
    flash(t.id);
  } catch (ex) {
    toast(ex.message, { error: true });
  }
}

$("#clear-completed").addEventListener("click", async () => {
  const done = state.tasks.filter((x) => x.completed);
  if (!done.length || !confirm(`Delete ${done.length} completed task${done.length > 1 ? "s" : ""}? This can't be undone.`)) return;
  try {
    await Promise.all(done.map((x) => api(`/tasks/${x.id}`, { method: "DELETE" })));
    toast(`Deleted ${done.length} completed task${done.length > 1 ? "s" : ""}`);
  } catch (ex) {
    toast(ex.message, { error: true });
  }
  loadTasks().catch(() => {});
});

/* ================= Edit dialog ================= */
function openEdit(task) {
  state.editing = task;
  $("#edit-title").value = task.title;
  $("#edit-desc").value = task.description || "";
  $("#edit-due").value = task.due_date || "";
  $("#edit-priority").value = task.priority;
  const created = new Date(task.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  $("#edit-meta").textContent = `Created ${created}` +
    (task.completed_at ? ` · Completed ${new Date(task.completed_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}` : "");
  $("#edit-dialog").showModal();
  $("#edit-title").focus();
}

$("#edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const task = state.editing;
  const title = $("#edit-title").value.trim();
  if (!task || !title) return;
  try {
    upsert(await api(`/tasks/${task.id}`, {
      method: "PATCH",
      body: {
        title,
        description: $("#edit-desc").value.trim() || null,
        due_date: $("#edit-due").value || null,
        priority: $("#edit-priority").value,
      },
    }));
    $("#edit-dialog").close();
    render();
    flash(task.id);
  } catch (ex) {
    toast(ex.message, { error: true });
  }
});

$("#edit-delete").addEventListener("click", () => {
  const task = state.editing;
  $("#edit-dialog").close();
  if (task) deleteTask(task);
});

/* ================= Real-time (WebSocket) ================= */
function setLive(on) {
  $("#live").classList.toggle("on", on);
  $("#live .live-text").textContent = on ? "Live" : "Offline";
  $("#live").title = on ? "Real-time sync is on: changes from other tabs and devices appear instantly" : "Reconnecting…";
}

function connectWS() {
  if (!state.token || state.ws) return;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  state.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ token: state.token }));
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.event === "ready") {
      setLive(true);
      if (state.wsRetry > 0) scheduleRefresh(); // catch up on anything missed while offline
      state.wsRetry = 0;
    } else {
      scheduleRefresh();
    }
  };
  ws.onclose = (e) => {
    if (state.ws !== ws) return; // closed on purpose (logout)
    state.ws = null;
    setLive(false);
    if (e.code === 4401) { logout("Your session expired. Please log in again."); return; }
    const delay = Math.min(30000, 1000 * 2 ** state.wsRetry++);
    setTimeout(connectWS, delay);
  };
}

setInterval(() => {
  if (state.ws?.readyState === WebSocket.OPEN) state.ws.send("ping");
  if (state.user && state.day !== todayStr()) render(); // date rolled over at midnight
}, 25000);

// Phones pause background tabs and drop the connection; catch up as soon as the app is opened again.
function resume() {
  if (!state.user) return;
  scheduleRefresh();
  if (!state.ws) { state.wsRetry = 0; connectWS(); }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") resume(); });
window.addEventListener("online", resume);

/* ================= Keyboard shortcuts ================= */
document.addEventListener("keydown", (e) => {
  if (!state.user || e.ctrlKey || e.metaKey || e.altKey) return;
  const typing = e.target.closest("input, textarea, select, [contenteditable]");
  if (document.querySelector("dialog[open]")) return;
  if (e.key === "Escape" && typing) { e.target.blur(); return; }
  if (typing) return;
  if (e.key === "/") { e.preventDefault(); $("#search").focus(); }
  else if (e.key === "n" || e.key === "N") {
    e.preventDefault();
    if (state.view === "completed") setView("today");
    $("#add-title").focus();
  }
});

/* ================= Startup ================= */
async function startApp() {
  state.user = await api("/users/me");
  $("#user-email").textContent = state.user.email;
  $("#user-btn").textContent = state.user.email[0];
  $("#auth-view").hidden = true;
  $("#app-view").hidden = false;
  setView(VIEWS[state.view] ? state.view : "today");
  await loadTasks();
  setLive(false);
  connectWS();
}

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

fetch("/auth/config").then((r) => r.json()).then((cfg) => {
  if (cfg.allow_registration) return;
  $('.seg button[data-mode="register"]').hidden = true;
  $(".seg").style.gridTemplateColumns = "1fr";
}).catch(() => {});

(async () => {
  if (!state.token) { logout(); return; }
  try {
    await startApp();
  } catch {
    if (state.token) logout();
  }
})();
