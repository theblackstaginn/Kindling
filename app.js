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
  const label = document.getElementById("todayLabel");
  label.textContent = currentDate;

  const checks = getChecks(currentDate);

  document.getElementById("chk-sun").checked = checks.sun;
  document.getElementById("chk-altar").checked = checks.altar;
  document.getElementById("chk-workout").checked = checks.workout;
  document.getElementById("chk-coffee").checked = checks.coffee;
  document.getElementById("chk-journal_step").checked = checks.journal;

  document.getElementById("sunText").textContent = SUN_TEXT;
  document.getElementById("altarText").textContent = ALTAR_TEXT;

  const dayIndex = new Date(currentDate).getDay();
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
  };
});

// ---------- Streak ----------
function updateStreak(){
  let streak=0;
  let d = new Date();
  while(true){
    const key = ymd(d);
    const c = data.checks[key];
    if(!c) break;
    const done =
      c.sun&&c.altar&&c.workout&&c.coffee&&c.journal;
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
    req.onerror=()=>rej();
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
    tx.onerror=rej;
  });
}

function getPhotos(date){
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,"readonly");
    const store=tx.objectStore(STORE);
    const req=store.getAll();
    req.onsuccess=()=>{
      res(req.result.filter(p=>p.date===date));
    };
  });
}

function deletePhoto(id){
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete=res;
  });
}

async function renderPhotos(date){
  const grid=document.getElementById("photoGrid");
  grid.innerHTML="";
  const photos=await getPhotos(date);
  document.getElementById("photoStatus").textContent=
    photos.length?`${photos.length} photo(s)`:"No photos yet.";

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
    };

    const left=document.createElement("div");
    left.className="left";

    const d=document.createElement("div");
    d.className="date";
    d.textContent=key;

    const preview=document.createElement("div");
    preview.className="preview";
    const c=data.checks[key];
    preview.textContent=
      `Sun:${c.sun?1:0} Altar:${c.altar?1:0} Workout:${c.workout?1:0}`;

    left.appendChild(d);
    left.appendChild(preview);

    div.appendChild(left);
    wrap.appendChild(div);
  });
}

// ---------- Lunar Data (Feb 2026 from your calendar) ----------
const COTD = {
  "2026-02-01": { color:"Gold", moon:{phase:"Full Moon", time:"5:09 pm"} },
  "2026-02-02": { color:"Lavender", notes:["Imbolc","Groundhog Day"] },
  "2026-02-09": { color:"Silver", moon:{phase:"Fourth Quarter", time:"7:43 am"} },
  "2026-02-17": { color:"Scarlet", moon:{phase:"New Moon"} },
  "2026-02-24": { color:"White", moon:{phase:"Second Quarter", time:"7:28 am"} }
};

function moonMeaning(phase){
  const p=phase.toLowerCase();
  if(p.includes("new")) return "Seed intentions. Quiet power.";
  if(p.includes("full")) return "Completion. Release and charge.";
  if(p.includes("quarter")) return "Decision point. Push or cut.";
  return "";
}

function moonIcon(phase){
  const p=phase.toLowerCase();
  if(p.includes("new")) return "🌑";
  if(p.includes("full")) return "🌕";
  if(p.includes("fourth")) return "🌗";
  if(p.includes("second")) return "🌓";
  return "🌙";
}

function renderCorrespondences(dateKey){
  const entry=COTD[dateKey];
  document.getElementById("cotdDate").textContent=dateKey;

  if(!entry){
    document.getElementById("cotdColor").textContent="—";
    document.getElementById("moonWrap").style.display="none";
    document.getElementById("notesWrap").style.display="none";
    return;
  }

  document.getElementById("cotdColor").textContent=entry.color||"—";

  if(entry.moon){
    document.getElementById("moonWrap").style.display="";
    document.getElementById("moonPhase").textContent=entry.moon.phase;
    document.getElementById("moonTime").textContent=
      entry.moon.time?`(${entry.moon.time})`:"";
    document.getElementById("moonMeaning").textContent=
      moonMeaning(entry.moon.phase);
  } else {
    document.getElementById("moonWrap").style.display="none";
  }

  if(entry.notes){
    document.getElementById("notesWrap").style.display="";
    document.getElementById("cotdNotes").textContent=
      entry.notes.map(n=>"• "+n).join("\n");
  } else {
    document.getElementById("notesWrap").style.display="none";
  }
}

// ---------- Calendar ----------
let calYear=2026;
let calMonth=1; // February (0-index)

function renderCalendar(){
  const grid=document.getElementById("calGrid");
  grid.innerHTML="";

  const first=new Date(calYear,calMonth,1);
  const startDay=first.getDay();
  const days=new Date(calYear,calMonth+1,0).getDate();

  document.getElementById("calTitle").textContent=
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

  for(let d=1;d<=days;d++){
    const date=new Date(calYear,calMonth,d);
    const key=ymd(date);

    const cell=document.createElement("div");
    cell.className="cell";
    if(key===currentDate) cell.classList.add("selected");

    const n=document.createElement("div");
    n.className="n";
    n.textContent=d;
    cell.appendChild(n);

    const entry=COTD[key];
    if(entry && entry.moon){
      const m=document.createElement("div");
      m.className="moon";
      m.textContent=moonIcon(entry.moon.phase);
      cell.appendChild(m);
    }

    if(entry && entry.notes){
      const badges=document.createElement("div");
      badges.className="badges";
      entry.notes.forEach(note=>{
        const b=document.createElement("div");
        b.className="badge holy";
        b.textContent=note;
        badges.appendChild(b);
      });
      cell.appendChild(badges);
    }

    cell.onclick=()=>{
      currentDate=key;
      renderCalendar();
      renderToday();
      renderMoonPanel(key);
    };

    grid.appendChild(cell);
  }

  document.getElementById("eventCount").textContent=data.events.length;
}

function renderMoonPanel(dateKey){
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
    rel.textContent="";
  }
}

document.getElementById("prevMonth").onclick=()=>{
  calMonth--;
  renderCalendar();
};
document.getElementById("nextMonth").onclick=()=>{
  calMonth++;
  renderCalendar();
};

// ---------- Init ----------
openDB().then(()=>{
  renderToday();
  renderHistory();
  renderCalendar();
  renderMoonPanel(currentDate);
});