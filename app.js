// ===============================
// Kindling – Full App Logic
// ===============================

// ---------- Utilities ----------
function ymd(d){
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,'0');
  const day = String(dt.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function todayYMD(){ return ymd(new Date()); }

// IMPORTANT: avoid timezone parsing bugs from new Date("YYYY-MM-DD")
function dateFromYMD(key){
  const [Y,M,D] = key.split("-").map(n => parseInt(n, 10));
  return new Date(Y, M - 1, D);
}

function uid(prefix="e"){
  return prefix + "_" + Math.random().toString(36).slice(2,9);
}

// ---------- Local Data ----------
const STORAGE_KEY = "kindling_data_v1";

let data = {
  checks:{},   // { "YYYY-MM-DD": { sun:true,... } }
  events:[]    // user events only
};

function load(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw) data = JSON.parse(raw);
}
function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
load();

// ---------- Tabs ----------
const tabs = {
  today: document.getElementById("view-today"),
  history: document.getElementById("view-history"),
  calendar: document.getElementById("view-calendar"),
  settings: document.getElementById("view-settings")
};

function switchTab(name){
  Object.keys(tabs).forEach(k=>{
    tabs[k].classList.toggle("hide", k!==name);
    document.getElementById(`tab-${k}`).setAttribute("aria-selected", k===name);
  });

  // keep other views fresh
  if (name === "history") renderHistory();
  if (name === "calendar") {
    renderCalendar();
    renderMoonPanel(currentDate);
  }
}

["today","history","calendar","settings"].forEach(name=>{
  document.getElementById(`tab-${name}`).onclick = ()=>switchTab(name);
});

// ---------- Routine Text ----------
const SUN_TEXT =
`Step outside within 10 minutes of waking.
No phone. No sunglasses.
Let light hit your eyes.
Breathe slow through the nose.
Remember: you are an animal first.`;

const ALTAR_TEXT =
`Light candle.
Call attention inward.
State intention clearly.
Offer gratitude.
Close with stillness.`;

const WORKOUTS = {
  0:"Sunday – Long Walk + Mobility\n20 min walk\n10 min stretch\nBreathwork finish.",
  1:"Monday – Push\nPushups\nShoulder press\nCore hold",
  2:"Tuesday – Legs\nSquats\nLunges\nCalf raises",
  3:"Wednesday – Pull\nRows\nPullups or bands\nRear delts",
  4:"Thursday – Conditioning\nIntervals\nJump rope or sprints",
  5:"Friday – Hybrid\nPush + Pull light\nCore",
  6:"Saturday – Recovery\nMobility\nLight yoga\nBreathing"
};

const COFFEE_TEXT =
`Brew with intention.
No scrolling.
Journal by hand.
Upload page here.`;

// ---------- Today Logic ----------
let currentDate = todayYMD();

function getChecks(key){
  if(!data.checks[key]){
    data.checks[key] = {
      sun:false,
      altar:false,
      workout:false,
      coffee:false,
      journal:false
    };
  }
  return data.checks[key];
}

function renderToday(){
  // Always show what day you're viewing
  document.getElementById("todayLabel").textContent = currentDate;

  const checks = getChecks(currentDate);

  document.getElementById("chk-sun").checked = checks.sun;
  document.getElementById("chk-altar").checked = checks.altar;
  document.getElementById("chk-workout").checked = checks.workout;
  document.getElementById("chk-coffee").checked = checks.coffee;
  document.getElementById("chk-journal_step").checked = checks.journal;

  document.getElementById("sunText").textContent = SUN_TEXT;
  document.getElementById("altarText").textContent = ALTAR_TEXT;

  // Use timezone-safe date
  const dayIndex = dateFromYMD(currentDate).getDay();
  document.getElementById("workoutText").textContent = WORKOUTS[dayIndex];
  document.getElementById("workoutDayLabel").textContent =
    ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dayIndex];

  document.getElementById("coffeeText").textContent = COFFEE_TEXT;

  const total = 5;
  const done =
    (checks.sun?1:0)+
    (checks.altar?1:0)+
    (checks.workout?1:0)+
    (checks.coffee?1:0)+
    (checks.journal?1:0);

  document.getElementById("doneCount").textContent = done;
  document.getElementById("totalCount").textContent = total;

  renderCorrespondences(currentDate);
  renderPhotos(currentDate);
  updateStreak();
}

["sun","altar","workout","coffee","journal"].forEach(key=>{
  const el = document.getElementById("chk-"+(key==="journal"?"journal_step":key));
  el.onchange = ()=>{
    getChecks(currentDate)[key]=el.checked;
    save();
    renderToday();
    renderHistory();
    renderCalendar();
  };
});

// Jump button (was missing before)
document.getElementById("jumpToday").onclick = ()=>{
  currentDate = todayYMD();
  switchTab("today");
  renderToday();
  renderCalendar();
  renderMoonPanel(currentDate);
};

// Reset button (was missing before)
document.getElementById("resetDayBtn").onclick = async ()=>{
  if (!confirm(`Reset ${currentDate}? This clears checks + ALL photos for that day.`)) return;
  data.checks[currentDate] = {
    sun:false, altar:false, workout:false, coffee:false, journal:false
  };
  save();
  await deletePhotosForDate(currentDate);
  renderToday();
  renderHistory();
  renderCalendar();
  renderMoonPanel(currentDate);
};

// ---------- Streak ----------
function updateStreak(){
  let streak=0;
  let d = new Date(); // local today
  while(true){
    const key = ymd(d);
    const c = data.checks[key];
    if(!c) break;
    const done = c.sun && c.altar && c.workout && c.coffee && c.journal;
    if(!done) break;
    streak++;
    d.setDate(d.getDate()-1);
  }
  document.getElementById("streak").textContent=streak;
}

// ---------- IndexedDB Photos ----------
const DB_NAME="kindling_photos";
const STORE="photos";
let db=null;

function openDB(){
  return new Promise((res,rej)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{
      req.result.createObjectStore(STORE,{keyPath:"id"});
    };
    req.onsuccess=()=>{ db=req.result; res(); };
    req.onerror=()=>rej(req.error);
  });
}

function addPhoto(date, blob){
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).add({
      id:uid("p"),
      date,
      blob
    });
    tx.oncomplete=res;
    tx.onerror=()=>rej(tx.error);
  });
}

function getAllPhotos(){
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,"readonly");
    const store=tx.objectStore(STORE);
    const req=store.getAll();
    req.onsuccess=()=>res(req.result || []);
    req.onerror=()=>rej(req.error);
  });
}

async function getPhotos(date){
  const all = await getAllPhotos();
  return all.filter(p=>p.date===date);
}

function deletePhoto(id){
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete=res;
    tx.onerror=()=>rej(tx.error);
  });
}

async function deletePhotosForDate(date){
  const photos = await getPhotos(date);
  for (const p of photos) {
    await deletePhoto(p.id);
  }
}

async function renderPhotos(date){
  const grid=document.getElementById("photoGrid");
  grid.innerHTML="";
  const photos=await getPhotos(date);

  document.getElementById("photoStatus").textContent =
    photos.length ? `${photos.length} photo(s)` : "No photos yet.";

  photos.forEach(p=>{
    const div=document.createElement("div");
    div.className="thumb";

    const img=document.createElement("img");
    img.src=URL.createObjectURL(p.blob);
    div.appendChild(img);

    const x=document.createElement("div");
    x.className="x";
    x.textContent="✕";
    x.onclick=async(e)=>{
      e.stopPropagation();
      await deletePhoto(p.id);
      renderPhotos(date);
    };
    div.appendChild(x);

    div.onclick=()=>{
      document.getElementById("viewer").classList.remove("hide");
      document.getElementById("viewerImg").src=img.src;
      document.getElementById("viewerLabel").textContent=date;
    };

    grid.appendChild(div);
  });
}

document.getElementById("viewerClose").onclick=()=>{
  document.getElementById("viewer").classList.add("hide");
};

// ---------- Add Photo ----------
document.getElementById("addPhotoBtn").onclick=()=>{
  document.getElementById("photoInput").click();
};

document.getElementById("photoInput").onchange=async(e)=>{
  const file=e.target.files[0];
  if(!file) return;
  await addPhoto(currentDate,file);
  renderPhotos(currentDate);
  e.target.value="";
};

// ---------- History ----------
function renderHistory(){
  const wrap=document.getElementById("history");
  wrap.innerHTML="";
  const days=Object.keys(data.checks).sort().reverse();
  document.getElementById("historyCount").textContent=days.length;

  days.forEach(key=>{
    const div=document.createElement("div");
    div.className="day";
    div.onclick=()=>{
      currentDate=key;
      switchTab("today");
      renderToday();
      renderCalendar();
      renderMoonPanel(currentDate);
    };

    const left=document.createElement("div");
    left.className="left";

    const d=document.createElement("div");
    d.className="date";
    d.textContent=key;

    const preview=document.createElement("div");
    preview.className="preview";
    const c=data.checks[key];
    preview.textContent=`Sun:${c.sun?1:0} Altar:${c.altar?1:0} Workout:${c.workout?1:0} Coffee:${c.coffee?1:0} Journal:${c.journal?1:0}`;

    left.appendChild(d);
    left.appendChild(preview);

    div.appendChild(left);

    const score=document.createElement("div");
    score.className="score";
    const dot=document.createElement("div");
    dot.className="dot";
    if(c.sun&&c.altar&&c.workout&&c.coffee&&c.journal) dot.classList.add("ok");
    score.appendChild(dot);
    score.appendChild(document.createTextNode("saved"));
    div.appendChild(score);

    wrap.appendChild(div);
  });
}

// ---------- Lunar Data (Feb 2026 from your calendar photo) ----------
const COTD = {
  "2026-02-01": { color:"Gold", moon:{phase:"Full Moon", time:"5:09 pm"} },
  "2026-02-02": { color:"Lavender", notes:["Imbolc","Groundhog Day"] },
  "2026-02-03": { color:"Maroon" },
  "2026-02-04": { color:"Brown" },
  "2026-02-05": { color:"White" },
  "2026-02-06": { color:"Pink" },
  "2026-02-07": { color:"Gray" },
  "2026-02-08": { color:"Orange" },
  "2026-02-09": { color:"Silver", moon:{phase:"Fourth Quarter", time:"7:43 am"} },
  "2026-02-10": { color:"Black" },
  "2026-02-11": { color:"Yellow" },
  "2026-02-12": { color:"Turquoise" },
  "2026-02-13": { color:"Black" },
  "2026-02-14": { color:"Indigo", notes:["Valentine's Day"] },
  "2026-02-15": { color:"Yellow" },
  "2026-02-16": { color:"Ivory", notes:["Presidents' Day"] },
  "2026-02-17": { color:"Scarlet", moon:{phase:"New Moon"}, notes:["Lunar New Year (Horse)","Mardi Gras (Fat Tuesday)","Solar Eclipse (28° ♒ 50′)"] },
  "2026-02-18": { color:"White", notes:["Ash Wednesday","Sun enters Pisces","Celtic Tree Month of Ash begins"] },
  "2026-02-19": { color:"Green" },
  "2026-02-20": { color:"Purple" },
  "2026-02-21": { color:"Black" },
  "2026-02-22": { color:"Gold" },
  "2026-02-23": { color:"Gray" },
  "2026-02-24": { color:"White", moon:{phase:"Second Quarter", time:"7:28 am"} },
  "2026-02-25": { color:"Topaz" },
  "2026-02-26": { color:"Crimson" },
  "2026-02-27": { color:"Coral" },
  "2026-02-28": { color:"Blue" }
};

function moonMeaning(phase){
  const p=(phase||"").toLowerCase();
  if(p.includes("new")) return "New Moon: seed intentions, start clean, go quiet and precise. Perfect for vows, plans, and resets.";
  if(p.includes("full")) return "Full Moon: peak illumination. Charge, celebrate, divinate, and release what’s overstayed. Don’t cling.";
  if(p.includes("fourth") || p.includes("third")) return "Last Quarter: cut, simplify, banish, end cycles. Clean the altar. Close open loops.";
  if(p.includes("second") || p.includes("first")) return "First Quarter: friction + momentum. Adjust the plan and push through resistance.";
  return "";
}

function moonIcon(phase){
  const p=(phase||"").toLowerCase();
  if(p.includes("new")) return "🌑";
  if(p.includes("full")) return "🌕";
  if(p.includes("fourth") || p.includes("third")) return "🌗";
  if(p.includes("second") || p.includes("first")) return "🌓";
  return "🌙";
}

function renderCorrespondences(dateKey){
  const entry=COTD[dateKey];

  document.getElementById("cotdDate").textContent = dateKey;

  if(!entry){
    document.getElementById("cotdColor").textContent="—";
    document.getElementById("cotdMeaning").textContent="";
    document.getElementById("moonWrap").style.display="none";
    document.getElementById("notesWrap").style.display="none";
    return;
  }

  document.getElementById("cotdColor").textContent = entry.color || "—";
  document.getElementById("cotdMeaning").textContent =
    entry.color ? colorMeaning(entry.color) : "";

  if(entry.moon){
    document.getElementById("moonWrap").style.display="";
    document.getElementById("moonPhase").textContent = entry.moon.phase;
    document.getElementById("moonTime").textContent = entry.moon.time ? `(${entry.moon.time})` : "";
    document.getElementById("moonMeaning").textContent = moonMeaning(entry.moon.phase);
  } else {
    document.getElementById("moonWrap").style.display="none";
  }

  if(entry.notes && entry.notes.length){
    document.getElementById("notesWrap").style.display="";
    document.getElementById("cotdNotes").textContent = entry.notes.map(n=>"• "+n).join("\n");
  } else {
    document.getElementById("notesWrap").style.display="none";
  }
}

// Color relevance (short + practical)
function colorMeaning(color){
  const c = (color||"").toLowerCase();
  if(c==="scarlet"||c==="red"||c==="crimson") return "Power + courage. Good for decisive action, boundaries, and will.";
  if(c==="gold") return "Confidence + attraction. Good for visibility, leadership, prosperity focus.";
  if(c==="lavender"||c==="purple") return "Intuition + spirit. Good for divination, calm power, inner work.";
  if(c==="white"||c==="ivory") return "Purification + clarity. Good for cleansing, resets, and protection.";
  if(c==="black") return "Shielding + banishing. Good for cutting cords, ending cycles, protection work.";
  if(c==="green") return "Growth + money + healing. Good for steady builds and health focus.";
  if(c==="yellow") return "Mind + communication. Good for planning, study, outreach, decisions.";
  if(c==="blue"||c==="indigo") return "Peace + truth. Good for emotional regulation and honest speech.";
  if(c==="gray"||c==="silver") return "Neutral + balance. Good for reflection, pause, recalibration.";
  if(c==="orange"||c==="coral") return "Creativity + movement. Good for momentum and social warmth.";
  if(c==="pink") return "Love + softness. Good for affection, compassion, repair.";
  if(c==="brown"||c==="topaz") return "Ground + home. Good for stability, practical work, home protection.";
  if(c==="turquoise") return "Flow + healing + expression. Good for gentle courage and openness.";
  if(c==="maroon") return "Deep will. Good for stamina, discipline, long-term focus.";
  return "";
}

// ---------- Calendar ----------
let calYear = 2026;
let calMonth = 1; // February

function renderCalendar(){
  const grid=document.getElementById("calGrid");
  grid.innerHTML="";

  const first=new Date(calYear,calMonth,1);
  const startDay=first.getDay();
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();

  document.getElementById("calTitle").textContent =
    first.toLocaleString("default",{month:"long",year:"numeric"});

  ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d=>{
    const div=document.createElement("div");
    div.className="dow";
    div.textContent=d;
    grid.appendChild(div);
  });

  for(let i=0;i<startDay;i++){
    const blank=document.createElement("div");
    grid.appendChild(blank);
  }

  for(let day=1;day<=daysInMonth;day++){
    const date=new Date(calYear,calMonth,day);
    const key=ymd(date);

    const cell=document.createElement("div");
    cell.className="cell";
    if(key===currentDate) cell.classList.add("selected");

    const n=document.createElement("div");
    n.className="n";
    n.textContent=day;
    cell.appendChild(n);

    const entry=COTD[key];
    if(entry && entry.moon){
      const m=document.createElement("div");
      m.className="moon";
      m.innerHTML = `${moonIcon(entry.moon.phase)} <span class="label">${entry.moon.phase.replace(" Quarter"," Qtr")}</span>`;
      cell.appendChild(m);
    }

    const badges=document.createElement("div");
    badges.className="badges";

    if(entry && entry.notes){
      entry.notes.forEach(note=>{
        const b=document.createElement("div");
        b.className="badge holy";
        b.textContent=note;
        badges.appendChild(b);
      });
    }

    // show “event” badge if you add user events later (placeholder)
    const userEvents = data.events.filter(e => e.date === key);
    if(userEvents.length){
      const b=document.createElement("div");
      b.className="badge event";
      b.textContent=`${userEvents.length} event`;
      badges.appendChild(b);
    }

    if(badges.children.length) cell.appendChild(badges);

    cell.onclick=()=>{
      currentDate=key;
      renderCalendar();
      renderToday();
      renderMoonPanel(key);
      document.getElementById("selDayLabel").textContent=key;
    };

    grid.appendChild(cell);
  }

  document.getElementById("eventCount").textContent=data.events.length;
}

function renderMoonPanel(dateKey){
  document.getElementById("selDayLabel").textContent = dateKey;

  const entry=COTD[dateKey];
  const big=document.getElementById("moonBig");
  const name=document.getElementById("moonName");
  const when=document.getElementById("moonWhen");
  const rel=document.getElementById("moonRelevance");

  if(entry && entry.moon){
    big.textContent=moonIcon(entry.moon.phase);
    name.textContent=entry.moon.phase;
    when.textContent=entry.moon.time||"";
    rel.textContent=moonMeaning(entry.moon.phase);
  } else {
    big.textContent="🌙";
    name.textContent="No major phase marker";
    when.textContent="";
    rel.textContent="Most days are between phase markers. Use the color-of-day + your ritual consistency as the real lever.";
  }
}

document.getElementById("prevMonth").onclick=()=>{
  calMonth--;
  if(calMonth<0){ calMonth=11; calYear--; }
  renderCalendar();
};
document.getElementById("nextMonth").onclick=()=>{
  calMonth++;
  if(calMonth>11){ calMonth=0; calYear++; }
  renderCalendar();
};

// ---------- Settings: Wipe ----------
document.getElementById("wipeAllBtn").onclick = async ()=>{
  if(!confirm("Wipe everything? This deletes local routine/events and ALL stored photos.")) return;
  localStorage.removeItem(STORAGE_KEY);
  data = { checks:{}, events:[] };
  save();
  await wipeAllPhotos();
  currentDate = todayYMD();
  renderToday();
  renderHistory();
  renderCalendar();
  renderMoonPanel(currentDate);
};

function wipeAllPhotos(){
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,"readwrite");
    const store=tx.objectStore(STORE);
    const req=store.clear();
    req.onsuccess=()=>res();
    req.onerror=()=>rej(req.error);
  });
}

// ---------- Init ----------
async function init(){
  await openDB();

  // FORCE load to real today on each refresh
  currentDate = todayYMD();

  // Keep calendar on Feb 2026 for now (your target month)
  calYear = 2026;
  calMonth = 1;

  renderToday();
  renderHistory();
  renderCalendar();
  renderMoonPanel(currentDate);
}

init().catch(err=>{
  console.error("Init failed:", err);
  alert("Kindling failed to initialize. Check console for errors.");
});