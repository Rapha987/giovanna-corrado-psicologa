const SLOT_TIMES = ["09:00", "10:00", "11:30", "14:30", "15:30", "16:30", "17:30"];
const WEEKS = 8;
const KEY = "gc-bookings";
const WA_E164 = "393274596515";
const KINDS = [
  { id: "consultazione", label: "Primo colloquio", hint: "Gratuito · 50 minuti" },
  { id: "supporto", label: "Supporto psicologico", hint: "Percorso individuale" },
  { id: "parent-training", label: "Parent training", hint: "Accompagnamento ai genitori" },
];
const MODS = [
  { id: "studio", label: "In studio" },
  { id: "online", label: "Online" },
];
const DOW = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

function pad(n) { return String(n).padStart(2, "0"); }
function toStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseStr(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function formatLong(s) {
  return parseStr(s).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}
function romeNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, minutes: Number(g("hour")) * 60 + Number(g("minute")) };
}
function isPast(dateStr, time) {
  const now = romeNow();
  if (dateStr < now.date) return true;
  if (dateStr > now.date) return false;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m <= now.minutes;
}
function makeCode() {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const p = () => L[Math.floor(Math.random() * L.length)];
  return `GC-${p()}${p()}${String(Math.floor(1000 + Math.random() * 9000))}`;
}
function readMine() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function writeMine(list) { localStorage.setItem(KEY, JSON.stringify(list)); }
function kindLabel(id) { return KINDS.find((k) => k.id === id)?.label ?? id; }
function modLabel(id) { return MODS.find((m) => m.id === id)?.label ?? id; }
function waMessage(b) {
  return [
    `Ciao, sono ${b.guestName}.`,
    "Vorrei confermare una prenotazione:",
    "",
    `• ${formatLong(b.slotDate)} alle ${b.slotTime}`,
    `• ${kindLabel(b.kind)}`,
    `• ${modLabel(b.modality)}`,
    `• Codice ${b.code}`,
    "",
    "Grazie.",
  ].join("\n");
}
function waUrl(b) {
  return `https://wa.me/${WA_E164}?text=${encodeURIComponent(waMessage(b))}`;
}

const state = {
  cursor: today(),
  selected: null,
  kind: "consultazione",
  modality: "studio",
  slotTime: null,
};

function firstOpenDay() {
  let d = today();
  for (let i = 0; i < 14; i++) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) return d;
    d = addDays(d, 1);
  }
  return today();
}

function renderCal() {
  const y = state.cursor.getFullYear();
  const m = state.cursor.getMonth();
  document.getElementById("cal-title").textContent =
    state.cursor.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysIn = new Date(y, m + 1, 0).getDate();
  const last = addDays(today(), WEEKS * 7);
  const box = document.getElementById("cal-days");
  box.innerHTML = "";
  for (let i = 0; i < startOffset; i++) box.appendChild(document.createElement("span"));
  for (let d = 1; d <= daysIn; d++) {
    const date = new Date(y, m, d);
    const str = toStr(date);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day" + (state.selected === str ? " is-selected" : "");
    btn.textContent = String(d);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const out = date < today() || date > last;
    btn.disabled = weekend || out;
    btn.addEventListener("click", () => { state.selected = str; renderCal(); renderSlots(); });
    box.appendChild(btn);
  }
}

function renderSlots() {
  const title = document.getElementById("slot-title");
  const grid = document.getElementById("slots");
  const hint = document.getElementById("slot-hint");
  if (!state.selected) {
    title.textContent = "Seleziona un giorno";
    grid.innerHTML = "";
    hint.textContent = "";
    return;
  }
  title.textContent = formatLong(state.selected);
  const mine = readMine();
  const taken = new Set(mine.map((b) => `${b.slotDate}|${b.slotTime}`));
  grid.innerHTML = "";
  SLOT_TIMES.forEach((time) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot";
    btn.textContent = time;
    btn.disabled = taken.has(`${state.selected}|${time}`) || isPast(state.selected, time);
    btn.addEventListener("click", () => openDialog(time));
    grid.appendChild(btn);
  });
  hint.textContent = "Gli orari barrati sono già occupati su questo dispositivo o trascorsi.";
}

function renderMine() {
  const wrap = document.getElementById("mine-wrap");
  const list = document.getElementById("mine-list");
  const mine = readMine();
  if (!mine.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  list.innerHTML = "";
  mine.forEach((b) => {
    const li = document.createElement("li");
    li.innerHTML = `<div><p style="font-weight:500;color:var(--ink);text-transform:capitalize">${formatLong(b.slotDate)} · ${b.slotTime}</p>
      <p style="font-size:.9rem">${kindLabel(b.kind)} · ${modLabel(b.modality)} · codice <span style="font-variant-numeric:tabular-nums">${b.code}</span></p></div>`;
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;flex-wrap:wrap;gap:.5rem";
    const wa = document.createElement("a");
    wa.className = "btn btn-outline btn-sm";
    wa.href = waUrl(b);
    wa.target = "_blank";
    wa.rel = "noreferrer";
    wa.textContent = "WhatsApp";
    const cancel = document.createElement("button");
    cancel.className = "btn btn-outline btn-sm";
    cancel.textContent = "Annulla";
    cancel.addEventListener("click", () => {
      writeMine(readMine().filter((x) => x.code !== b.code));
      renderMine(); renderSlots();
    });
    actions.appendChild(wa);
    actions.appendChild(cancel);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

function openDialog(time) {
  state.slotTime = time;
  state.kind = "consultazione";
  state.modality = "studio";
  document.getElementById("dlg-desc").textContent = `${formatLong(state.selected)} alle ${time}`;
  document.getElementById("guest-name").value = "";
  document.getElementById("privacy-consent").checked = false;
  document.getElementById("form-view").hidden = false;
  document.getElementById("ok-view").hidden = true;
  paintChoices();
  document.getElementById("book-dialog").showModal();
}

function paintChoices() {
  const kinds = document.getElementById("kinds");
  kinds.innerHTML = "";
  KINDS.forEach((k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "choice" + (state.kind === k.id ? " is-on" : "");
    b.innerHTML = `<span style="font-weight:500">${k.label}</span><span style="font-size:.75rem;color:var(--muted)">${k.hint}</span>`;
    b.addEventListener("click", () => { state.kind = k.id; paintChoices(); });
    kinds.appendChild(b);
  });
  const mods = document.getElementById("mods");
  mods.innerHTML = "";
  MODS.forEach((m) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "choice" + (state.modality === m.id ? " is-on" : "");
    b.textContent = m.label;
    b.addEventListener("click", () => { state.modality = m.id; paintChoices(); });
    mods.appendChild(b);
  });
}

function submitBook(e) {
  e.preventDefault();
  const name = document.getElementById("guest-name").value.trim();
  const consent = document.getElementById("privacy-consent").checked;
  if (!name) return;
  if (!consent) return;
  const saved = {
    code: makeCode(),
    guestName: name,
    slotDate: state.selected,
    slotTime: state.slotTime,
    kind: state.kind,
    modality: state.modality,
    createdAt: new Date().toISOString(),
  };
  writeMine([saved, ...readMine()].slice(0, 8));
  document.getElementById("ok-code").textContent = saved.code;
  document.getElementById("ok-copy").textContent =
    `${saved.guestName}, ${formatLong(saved.slotDate)} alle ${saved.slotTime}`;
  const wa = document.getElementById("ok-wa");
  wa.href = waUrl(saved);
  document.getElementById("form-view").hidden = true;
  document.getElementById("ok-view").hidden = false;
  renderMine();
  renderSlots();
}

document.addEventListener("DOMContentLoaded", () => {
  state.selected = toStr(firstOpenDay());
  state.cursor = parseStr(state.selected);
  document.getElementById("prev-m").addEventListener("click", () => {
    state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() - 1, 1);
    renderCal();
  });
  document.getElementById("next-m").addEventListener("click", () => {
    state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + 1, 1);
    renderCal();
  });
  document.getElementById("book-form").addEventListener("submit", submitBook);
  document.getElementById("clear-local").addEventListener("click", () => {
    localStorage.removeItem(KEY);
    renderMine(); renderSlots();
  });
  document.getElementById("dow").innerHTML = DOW.map((d) => `<span>${d}</span>`).join("");
  renderCal();
  renderSlots();
  renderMine();
});
