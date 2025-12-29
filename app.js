// Kindling — daily draw + streak
// Four-day schedule: Mon/Tue/Fri/Sat are Kindling days.
// Other days are Hearth maintenance + light cardio.

const STORAGE_KEY = "kindling_state_v2";

const KINDLING_DAYS = [1, 2, 5, 6]; // Mon Tue Fri Sat
// Hearth days: Sun Wed Thu (0 3 4)

const MICRO_COOLDOWN_KINDLING_DAYS = 7;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function defaultState() {
  return {
    deviceSalt: null,
    // history[YYYY-MM-DD] = { drawId, element, micro, boundary, mantra, workout, dayType, completed, redrawNonce }
    history: {},
    lastCompletedDate: null, // YYYY-MM-DD
    streak: 0,
  };
}

function ensureDeviceSalt(state) {
  if (state.deviceSalt) return;
  // stable per install, random enough
  state.deviceSalt = `${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toISODateLocal(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatToday(d = new Date()) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getDayType(d = new Date()) {
  return KINDLING_DAYS.includes(d.getDay()) ? "kindling" : "hearth";
}

function seasonName(d = new Date()) {
  // simple meteorological seasons (northern hemisphere-ish; good enough for discipline)
  const m = d.getMonth(); // 0=Jan
  if (m === 11 || m === 0 || m === 1) return "Winter";
  if (m === 2 || m === 3 || m === 4) return "Spring";
  if (m === 5 || m === 6 || m === 7) return "Summer";
  return "Autumn";
}

function isoToDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isFriday(d = new Date()) {
  return d.getDay() === 5; // Fri
}

function getRecentKindlingMicros(state, n = MICRO_COOLDOWN_KINDLING_DAYS) {
  const entries = Object.entries(state.history || {}).sort((a, b) => a[0].localeCompare(b[0])); // ISO sort
  const kindling = entries
    .filter(([, v]) => v && v.dayType === "kindling" && typeof v.micro === "string")
    .slice(-n)
    .map(([, v]) => v.micro);

  return new Set(kindling);
}

// ---------------- RNG (deterministic) ----------------
// Mulberry32 PRNG
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashToSeed(str) {
  // FNV-1a-ish
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// ---------------- Content pools ----------------

// Elements for Kindling days
const ELEMENTS = ["Fire", "Earth", "Air", "Water", "Aether"];

const FRIDAY_HARVEST = [
  "Harvest check: confirm next 7 days are covered (bills, groceries, gas).",
  "Harvest check: check credit utilization and plan a 5% reduction.",
  "Harvest check: move $10–$50 into Buffer (automatic beats heroic).",
  "Harvest check: send one income ping (client, lead, listing, follow-up).",
  "Harvest check: review subscriptions—cancel or downgrade one leak.",
];

// Micro-actions (wealth + stability) — designed to push cashflow + credit strength
const MICRO_ACTIONS = [
  "Pay one bill early (even $5 extra toward principal).",
  "Review bank + card balances and confirm next 7 days are covered.",
  "Log every expense for 24 hours. No judgment—only data.",
  "Make one call/email that increases income probability (client, lead, vendor, lender).",
  "Move $10–$50 into savings or a separate ‘Buffer’ account—automatic beats heroic.",
  "Update a single system: budget sheet, pricing, SOP, inventory list, or calendar.",
  "Cancel or downgrade one recurring expense or unused subscription.",
  "Check credit report / utilization and set a micro-plan to lower utilization by 5%.",
  "Build one small asset: a product listing draft, a portfolio post, or a template.",
  "Set a 25-minute sprint on the highest-leverage task you’re avoiding.",
];

// Boundaries
const BOUNDARIES = [
  "No doomscrolling before noon. Protect attention like a shrine.",
  "No impulse spending today. Sleep on every purchase.",
  "No debating with strangers. Your energy is currency.",
  "No overcommitting. A clean ‘no’ is a protective spell.",
  "No self-betrayal: do the one thing you said you’d do.",
  "No multitasking during money tasks. Single focus, sharp blade.",
];

// Mantras
const MANTRAS = [
  "I do what compounds.",
  "Quiet power. Clean choices.",
  "My boundary is my blessing.",
  "I build the altar of tomorrow with today’s actions.",
  "I choose the path that strengthens my future self.",
  "Cash flow is oxygen. I protect oxygen.",
  "Discipline is devotion made visible.",
];

// Workouts
const WORKOUT_KINDLING = [
  "30 min strength: push/pull/legs (simple full-body).",
  "30 min brisk walk + 5 min mobility.",
  "30 min circuit: squats, rows, pushups, carries (steady pace).",
  "30 min zone 2 cardio (you can talk, but you’re working).",
  "30 min mobility + core (spine, hips, shoulders).",
];

const WORKOUT_HEARTH = [
  "Light cardio only: 20–30 min walk (easy pace).",
  "Light movement: 15 min mobility + 10–15 min walk.",
  "Gentle zone 2: 20–30 min bike/walk (no heroics).",
];

// Hearth day script (fixed, non-random; the point is containment)
const HEARTH_SCRIPT = {
  element: "Hearth",
  micro: "Maintain the hearth: do ONE stabilizing task (clean, prep, plan, bills, inventory, calendar).",
  boundary: "Contain energy. Don’t expand scope. Protect tomorrow’s fire.",
  mantra: "I preserve the flame by tending the ash.",
  workout: "Light cardio only: 20–30 min walking or mobility.",
};

// ---------------- Draw generation ----------------

function generateDrawForDate(state, isoDate, dayType, redrawNonce = 0) {
  const seedStr = `${isoDate}|${state.deviceSalt}|${dayType}|${redrawNonce}`;
  const seed = hashToSeed(seedStr);
  const rng = mulberry32(seed);

  if (dayType === "hearth") {
    return {
      drawId: `H-${isoDate}-${String(redrawNonce).padStart(2, "0")}`,
      dayType,
      element: HEARTH_SCRIPT.element,
      micro: HEARTH_SCRIPT.micro,
      boundary: HEARTH_SCRIPT.boundary,
      mantra: HEARTH_SCRIPT.mantra,
      workout: pick(rng, WORKOUT_HEARTH),
      completed: false,
      redrawNonce,
    };
  }

  // Kindling: Micro-action selection with cooldown (avoid repeats)
  let microPool = MICRO_ACTIONS.slice();
  const recent = getRecentKindlingMicros(state, MICRO_COOLDOWN_KINDLING_DAYS);
  microPool = microPool.filter((m) => !recent.has(m));
  if (microPool.length === 0) microPool = MICRO_ACTIONS.slice();

  // Friday Harvest override (money altar)
  const micro = isFriday(isoToDate(isoDate)) ? pick(rng, FRIDAY_HARVEST) : pick(rng, microPool);

  return {
    drawId: `K-${isoDate}-${String(redrawNonce).padStart(2, "0")}`,
    dayType,
    element: pick(rng, ELEMENTS),
    micro: micro,
    boundary: pick(rng, BOUNDARIES),
    mantra: pick(rng, MANTRAS),
    workout: pick(rng, WORKOUT_KINDLING),
    completed: false,
    redrawNonce,
  };
}

function getOrCreateToday(state) {
  const iso = toISODateLocal();
  const dayType = getDayType();

  if (state.history[iso]) {
    // If the day type changed due to timezone weirdness, honor current day type by regenerating once.
    if (state.history[iso].dayType !== dayType) {
      state.history[iso] = generateDrawForDate(state, iso, dayType, 0);
      saveState(state);
    }
    return state.history[iso];
  }

  state.history[iso] = generateDrawForDate(state, iso, dayType, 0);
  saveState(state);
  return state.history[iso];
}

// ---------------- Streak logic ----------------

function daysBetween(aIso, bIso) {
  const a = isoToDate(aIso);
  const b = isoToDate(bIso);
  const ms = 24 * 60 * 60 * 1000;
  return Math.round((b - a) / ms);
}

function updateStreakOnComplete(state, todayIso) {
  const last = state.lastCompletedDate;
  if (!last) {
    state.streak = 1;
    state.lastCompletedDate = todayIso;
    return;
  }

  const diff = daysBetween(last, todayIso);
  if (diff === 0) {
    // already counted today
    return;
  } else if (diff === 1) {
    state.streak = (state.streak || 0) + 1;
    state.lastCompletedDate = todayIso;
  } else {
    // missed days => reset
    state.streak = 1;
    state.lastCompletedDate = todayIso;
  }
}

// ---------------- UI ----------------

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function forceRepaint() {
  // iOS Safari / PWA: occasionally fails to repaint text layers after fast DOM updates.
  // This nudges the compositor and forces a clean repaint.
  document.body.style.transform = "translateZ(0)";
  requestAnimationFrame(() => {
    document.body.style.transform = "";
  });
}

function render(state, todayDraw) {
  setText("today", formatToday(new Date()));
  setText("drawId", todayDraw.drawId);

  setText("kindlingElement", todayDraw.element);
  setText("kindlingMicro", todayDraw.micro);
  setText("kindlingBoundary", todayDraw.boundary);
  setText("kindlingMantra", todayDraw.mantra);
  setText("kindlingWorkout", todayDraw.workout);

  const hearthLabel = todayDraw.dayType === "kindling" ? "Kindling Day" : "Hearth Maintenance";
  setText("hearthState", hearthLabel);

  const rule =
    todayDraw.dayType === "kindling"
      ? "Kindling Day: advance wealth + stability. Do the micro-action OR hold the boundary. Then move your body."
      : "Hearth Day: maintain. One stabilizing task + light cardio. Contain scope. Protect tomorrow’s fire.";
  setText("dayRule", rule);

  setText("season", seasonName(new Date()));
  setText("streak", String(state.streak || 0));

  const btn = document.getElementById("markComplete");
  if (btn) {
    btn.textContent = todayDraw.completed ? "Completed" : "Mark complete";
    btn.disabled = !!todayDraw.completed;
  }
}

// ---------------- Actions ----------------

function markComplete(state, todayIso, todayDraw) {
  if (todayDraw.completed) return;

  todayDraw.completed = true;
  state.history[todayIso] = todayDraw;

  updateStreakOnComplete(state, todayIso);

  saveState(state);
}

function redrawToday(state, todayIso) {
  const dayType = getDayType();
  const existing = state.history[todayIso];
  const nextNonce = existing ? (existing.redrawNonce || 0) + 1 : 1;

  // redraw resets only today’s completion status (streak remains what it was unless you want stricter rules)
  state.history[todayIso] = generateDrawForDate(state, todayIso, dayType, nextNonce);
  saveState(state);
}

function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

// ---------------- Service Worker ----------------

async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  } catch {
    // silent: app shouldn’t crash on SW failure
  }
}

// ---------------- Boot ----------------

function main() {
  const state = loadState();
  ensureDeviceSalt(state);
  saveState(state);

  const todayIso = toISODateLocal();
  const todayDraw = getOrCreateToday(state);

  render(state, todayDraw);

  const markBtn = document.getElementById("markComplete");
  markBtn?.addEventListener("click", () => {
    markComplete(state, todayIso, todayDraw);
    const updated = state.history[todayIso];
    render(state, updated);
  });

  const redrawBtn = document.getElementById("redraw");
  redrawBtn?.addEventListener("click", () => {
    redrawToday(state, todayIso);
    const updated = state.history[todayIso];
    render(state, updated);
  });

  const resetBtn = document.getElementById("resetAll");
  resetBtn?.addEventListener("click", () => {
    const ok = confirm("Reset all? This clears streak + history.");
    if (ok) resetAll();
  });

  registerSW();
}

main();