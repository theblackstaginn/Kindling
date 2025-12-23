import { KINDLING_POOL, HEARTH_STATES } from "./data.js";

const KEY_TODAY = "kindling_today_v1";
const KEY_HISTORY = "kindling_history_v1";
const KEY_STREAK = "kindling_streak_v1";

function pad(n){ return String(n).padStart(2,"0"); }

function todayKey() {
const d = new Date();
return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function prettyToday() {
const d = new Date();
return d.toLocaleDateString(undefined, { weekday:"long", year:"numeric", month:"long", day:"numeric" });
}

function seasonFor(date = new Date()){
const m = date.getMonth() + 1; // 1-12
// Northern hemisphere-ish; adjust if you want
if ([12,1,2].includes(m)) return "Winter";
if ([3,4,5].includes(m)) return "Spring";
if ([6,7,8].includes(m)) return "Summer";
return "Autumn";
}

function loadJSON(key, fallback){
try{
const raw = localStorage.getItem(key);
return raw ? JSON.parse(raw) : fallback;
}catch{
return fallback;
}
}

function saveJSON(key, value){
localStorage.setItem(key, JSON.stringify(value));
}

function pick(arr){
return arr[Math.floor(Math.random() * arr.length)];
}

function hashId(dayKey, element){
// short deterministic-ish ID for display
let s = `${dayKey}|${element}`;
let h = 2166136261;
for (let i=0;i<s.length;i++){
h ^= s.charCodeAt(i);
h = Math.imul(h, 16777619);
}
return (h >>> 0).toString(16).slice(0,8);
}

function ensureTodayDraw(force=false){
const dayKey = todayKey();
const saved = loadJSON(KEY_TODAY, null);

if (!force && saved?.dayKey === dayKey && saved?.draw) return saved;

if (!Array.isArray(KINDLING_POOL) || KINDLING_POOL.length === 0){
return { dayKey, draw: null, id:"00000000" };
}

const draw = pick(KINDLING_POOL);
const id = hashId(dayKey, draw.element);

const payload = { dayKey, draw, id };
saveJSON(KEY_TODAY, payload);

// Initialize history entry for the day if missing
const history = loadJSON(KEY_HISTORY, {});
if (!history[dayKey]){
history[dayKey] = { completed:false, completedAt:null, id, element: draw.element };
saveJSON(KEY_HISTORY, history);
}

return payload;
}

function computeStreak(history){
// streak = consecutive completed days ending today
const keys = Object.keys(history).sort(); // YYYY-MM-DD sorts lexicographically
if (keys.length === 0) return 0;

let streak = 0;
let d = new Date();
for (;;){
const k = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
if (history[k]?.completed) {
streak++;
d.setDate(d.getDate() - 1);
continue;
}
break;
}
return streak;
}

function hearthFromStreak(streak){
if (streak <= 0) return "Cold";
if (streak <= 2) return "Ember";
if (streak <= 6) return "Warm";
return "Bright";
}

function $(id){ return document.getElementById(id); }

function render(payload){
const { dayKey, draw, id } = payload;

$("today").textContent = prettyToday();
$("drawId").textContent = id ?? "—";
$("season").textContent = seasonFor();

const history = loadJSON(KEY_HISTORY, {});
const streak = computeStreak(history);
$("streak").textContent = String(streak);
$("hearthState").textContent = hearthFromStreak(streak);

const setText = (el, txt) => el.textContent = (txt ?? "—");

if (!draw){
setText($("kindlingElement"), "No draw pool found.");
setText($("kindlingMicro"), "data.js has an empty KINDLING_POOL.");
setText($("kindlingBoundary"), "—");
setText($("kindlingMantra"), "—");
setText($("kindlingWorkout"), "—");
return;
}

setText($("kindlingElement"), draw.element);
setText($("kindlingMicro"), draw.micro);
setText($("kindlingBoundary"), draw.boundary);
setText($("kindlingMantra"), draw.mantra);
setText($("kindlingWorkout"), draw.workout);

// Button label based on completion
const entry = history[dayKey];
const done = entry?.completed === true;
$("markComplete").textContent = done ? "Completed" : "Mark complete";
$("markComplete").disabled = done;
}

function markComplete(){
const dayKey = todayKey();
const history = loadJSON(KEY_HISTORY, {});
history[dayKey] = history[dayKey] || {};
history[dayKey].completed = true;
history[dayKey].completedAt = new Date().toISOString();
saveJSON(KEY_HISTORY, history);
render(ensureTodayDraw(false));
}

function redrawToday(){
// Admin control: re-roll today’s draw, but keep history completion state
const dayKey = todayKey();
const history = loadJSON(KEY_HISTORY, {});
const completedState = history[dayKey]?.completed ?? false;
const completedAt = history[dayKey]?.completedAt ?? null;

const payload = ensureTodayDraw(true);

// restore completion flags
history[dayKey] = history[dayKey] || {};
history[dayKey].completed = completedState;
history[dayKey].completedAt = completedAt;
history[dayKey].id = payload.id;
history[dayKey].element = payload.draw?.element ?? "—";
saveJSON(KEY_HISTORY, history);

render(payload);
}

function resetAll(){
if (!confirm("Reset everything? This clears streak + history on this device.")) return;
localStorage.removeItem(KEY_TODAY);
localStorage.removeItem(KEY_HISTORY);
localStorage.removeItem(KEY_STREAK);
const payload = ensureTodayDraw(true);
render(payload);
}

function registerSW(){
if ("serviceWorker" in navigator){
navigator.serviceWorker.register("./sw.js").catch(()=>{});
}
}

document.addEventListener("DOMContentLoaded", () => {
const payload = ensureTodayDraw(false);
render(payload);

$("markComplete").addEventListener("click", markComplete);
$("redraw").addEventListener("click", redrawToday);
$("resetAll").addEventListener("click", resetAll);

registerSW();
});