/*********************************
 MICRO-PMU CORE ENGINE (STABLE)
**********************************/
/* ================= GLOBAL STATE ================= */

function getSystemData(){

  // 🔥 ALWAYS SYNC MODE
  systemMode = getSystemMode();
  const mode = systemMode;

  // ===== ESP MODE =====
  if(mode === "esp"){

    if(!window.espConnected){
      isNoData = true;
      return [];
    }

    isNoData = false;

    return [{
      voltage,
      current,
      frequency,
      power,
      pf,
      temperature,
      humidity,
      status: evaluateStatus(),
      timestamp: Date.now()
    }];
  }

  // ===== CSV MODE (FIXED 🔥) =====
  if(mode === "hybrid"){

    if(!window.analysisDataset || window.analysisDataset.length === 0){
      isNoData = true;
      return [];
    }

    isNoData = false;

    // 🔥 GET CURRENT CSV ROW
    const row = window.analysisDataset[analysisIndex] || {};

    return [{
      voltage: row.voltage ?? voltage,
      current: row.current ?? current,
      frequency: row.frequency ?? frequency,
      power: row.power ?? power,
      pf: row.pf ?? pf,
      temperature: row.temperature ?? temperature,
      humidity: row.humidity ?? humidity,
      status: evaluateStatus(),
      timestamp: Date.now()
    }];
  }


  // ===== SIMULATION =====
  isNoData = false;
  return JSON.parse(localStorage.getItem("micropmu_logs") || "[]");
}

/* ===== FINAL SYSTEM LIMITS ===== */
const deviceId = localStorage.getItem("deviceId") || ("dev_" + Math.random().toString(36).substr(2, 9));
localStorage.setItem("deviceId", deviceId);
const DEG = 180 / Math.PI;
const LIMITS = {


  VOLT_MIN: 210,
  VOLT_WARN: 215,
  VOLT_MAX: 240,

  OVERLOAD_CURRENT: 10,
  SHORT_CURRENT: 15,

  PF_MIN: 0.85,

  FREQ_MIN: 49,
  FREQ_MAX: 51,

  TEMP_MAX: 60

};

let logTimer;

let voltage = 0;
let current = 0;
let frequency = 50;
let power = 0;
let pf = 0.95;
let temperature = 35;
let humidity = 50;
let phaseAngle = 0;
let energy = 0;
let lastEnergyTime = Date.now();
let isFetching = false;
let isNoData = false;
let loggingEnabled = true;

let buzzerMuted = false;
let buzzerPlaying = false;

// simulation | esp | hybrid
let samplingTimer = null;
let connectedDevices = 1;
let isAdminDevice = false;
let analysisIndex = 0;

let csvPlaying = true;
let faultDuration = 0;
let faultStart = null;
let activeFaultType = "NORMAL";
let faultHoldTime = 0;
let faultTimer = 0;
let faultCooldown = 0;
let lastFaultEnd = 0;
let accessMode = "";
  let attemptsLeft = 3;
  let energyCharge = 0;
  let breakdown = [];
  let faultCooldownActive = false;
  let faultCooldownTime = 0;
  let forceNormalAfterFault = false;
let recoveryCounter = 0;
let lastUIRender = 0;

window.voltage = 230;
window.current = 2;
window.power = 500;
window.frequency = 50;
window.pf = 0.95;

window.csvPlaying = true;
window.analysisIndex = 0;

// 🔥 ===== FINAL ESP FETCH =====

async function fetchESPData(){

  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");

  // 🔥 ONLY RUN IN ESP MODE
  if(settings.systemMode !== "esp"){
    return;
  }

  // 🔥 AUTO DETECT MODE
  if(settings.connectionMode === "auto" && !window.espConnected && !settings.deviceIP){

    window._autoScanTried = true;

    const ip = await autoScanESP();

    if(!ip){
      showToast("⚠️ Try Mannualy or Scan Again", 2000);
      return;
    }
  }

  try{

    if(!settings.deviceIP){
      console.warn("No IP set");
      return;
    }

    const ip = settings.deviceIP || "192.168.174.94";

    const start = Date.now();

    const res = await fetch(`http://${ip}/data`);

    espLatency = Date.now() - start;

    if(!res.ok) throw new Error("ESP not responding");

    const data = await res.json();

    // ===== SAFE ASSIGN =====
    voltage = Number(data.voltage) || 0;
    current = Number(data.current) || 0;
    frequency = Number(data.frequency) || 0;
    power = Number(data.power) || 0;
    pf = Number(data.pf) || 0;
    temperature = Number(data.temperature) || 0;
    humidity = Number(data.humidity) || 0;

    // ===== PF SAFETY =====
    if(pf > 0 && pf <= 1){
      phaseAngle = Math.acos(pf) * 180 / Math.PI;
    }else{
      phaseAngle = 0;
    }

    // ===== CONNECTION SUCCESS =====
    // ===== CONNECTION SUCCESS =====
if(!window.espConnected){
  showToast("✅ ESP Connected", 1500);
}

// 🔥 IMPORTANT
window.espConnected = true;
isNoData = false;

// 🔥 ADD THIS (MAIN FIX)
setStatus("connected");

  }catch(e){

    console.error("ESP Error:", e);

    // ===== CONNECTION LOST =====
    if(window.espConnected){
      showToast("❌ ESP Disconnected", 1500);
    }

    window.espConnected = false;

    window.espConnected = false;
setStatus("disconnected");

    // 🔥 allow auto reconnect
    window._autoScanTried = false;

    // ===== RESET =====
    voltage = 0;
    current = 0;
    frequency = 0;
    power = 0;
    pf = 0;
    temperature = 0;
    humidity = 0;
    phaseAngle = 0;
    energy = 0;

    isNoData = true;
  }

} // ✅ FUNCTION CLOSED PROPERLY



function syncGlobalData(){

  window.voltage = Number(voltage);
  window.current = Number(current);
  window.power = Number(power);
  window.frequency = Number(frequency);
  window.pf = Number(pf);

}



function safeUIUpdate(){

  if(Date.now() - lastUIRender < 100) return;

  lastUIRender = Date.now();

  updateDashboard();
  updateSyncStatus();

}



// ===== ML HISTORY + DYNAMIC LIMITS =====

let history = [];

let dynamicLimits = {
  voltMin: 210,
  voltMax: 240,
  currentMax: 10,
  pfMin: 0.85,
  tempMax: 60
};
/*********************************
 TOAST SYSTEM
*********************************/
function showToast(msg, duration = 1500){

  // 🔥 ONLY allow in settings page
  if(!document.body.classList.contains("settings-page")){
    return; // ❌ block everywhere else
  }

  // 🔥 prevent spam
  const old = document.getElementById("customToast");
  if(old) old.remove();

  let toast = document.createElement("div");
  toast.id = "customToast";
  toast.innerText = msg;

  toast.style.position = "fixed";
  toast.style.bottom = "20px";
  toast.style.right = "20px";
  toast.style.background = "#0f172a";
  toast.style.color = "#fff";
  toast.style.padding = "10px 15px";
  toast.style.borderRadius = "8px";
  toast.style.zIndex = "9999";
  toast.style.fontSize = "13px";

  document.body.appendChild(toast);

  setTimeout(()=> toast.remove(), duration);
}

/*********************************
 AUTO RECONNECT ENGINE
*********************************/
setInterval(() => {

  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
  const mode = settings.systemMode || "simulation";

  // ❌ only ESP mode
  if(mode !== "esp") return;

  if(settings.autoReconnect === "on" && !window.espConnected){

    const statusText = document.getElementById("wifiStatusText");
    setStatus("searching");

    showToast("🔄 Reconnecting...");
    fetchESPData();
  }

}, 5000);


window.addEventListener("load", ()=>{

  const icon = document.getElementById("csvPlayIcon");
if(icon){
  icon.className = csvPlaying ? "fas fa-pause" : "fas fa-play";
}

  setStatus("disconnected");
});

/*********************************
 STATUS SYSTEM (FINAL CLEAN)
*********************************/
function setStatus(state){

  const box = document.querySelector(".status-live-box");
  const text = document.getElementById("wifiStatusText");
  const msg = document.getElementById("connectionMsg"); // 🔥 inline message

  if(!box || !text) return;

  // ===== RESET CLASSES =====
  box.classList.remove(
    "connected",
    "disconnected",
    "searching",
    "error",
    "slow"
  );

  // ===== STATUS HANDLER =====
  let message = "";

  if(state === "connected"){
    box.classList.add("connected");
    text.innerText = "Connected";
    message = "✅ Device Connected Successfully";

    // 🔥 AUTO HIDE AFTER 2.5s
    setTimeout(()=>{
      if(text.innerText === "Connected"){
        if(msg) msg.innerText = "";
      }
    }, 2500);
  }

  else if(state === "searching"){
    box.classList.add("searching");
    text.innerText = "Searching...";
    message = "🔍 Searching for ESP device...";
  }

  else if(state === "connecting"){
    box.classList.add("searching");
    text.innerText = "Connecting...";
    message = "🔄 Establishing connection...";
  }

  else if(state === "found"){
    box.classList.add("connected");
    text.innerText = "ESP Found";
    message = "📡 Device Found, preparing connection...";
  }

  else if(state === "slow"){
    box.classList.add("slow");
    text.innerText = "Slow Network";
    message = "⚠️ Connected but network is slow";
  }

  else if(state === "connection_lost"){
    box.classList.add("error");
    text.innerText = "Connection Lost";
    message = "⚠️ Connection lost. Trying to reconnect...";
  }

  else if(state === "error"){
    box.classList.add("error");
    text.innerText = "Connection Failed";
    message = "❌ Connection failed";
  }

  else if(state === "notfound"){
    box.classList.add("disconnected");
    text.innerText = "Not Found";
    message = "❌ ESP device not found";
  }

  else{
    box.classList.add("disconnected");
    text.innerText = "Disconnected";
    message = "❌ Device disconnected";
  }

  // ===== INLINE MESSAGE SHOW (ONLY SETTINGS PAGE) =====
  if(document.body.classList.contains("settings-page") && msg){
    msg.innerText = message;
  }
}

/*********************************
 TEST CONNECTION
*********************************/

async function testESPConnection(){

  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");

  // ❌ not ESP mode
  if(settings.systemMode !== "esp"){
    setStatus("error");
    return;
  }

  // 🔍 STEP 1: searching
  setStatus("searching");

  try{

    // 🔎 STEP 2: scan network
    const ip = await autoScanESP();

    // ❌ NOT FOUND
    if(!ip){
      setStatus("notfound");
      return;
    }

    // ✅ FOUND
    setStatus("found");

    // autofill input
    const input = document.getElementById("deviceIP");
    if(input) input.value = ip;

    // 🔄 STEP 3: smooth delay (NO async inside setTimeout issue)
    await new Promise(resolve => setTimeout(resolve, 800));

    setStatus("connecting");

    try{

      // 🔥 SAFE FETCH CALL
      await fetchESPData();

      // ✅ SUCCESS
      if(window.espConnected){

        if(window.espLatency && window.espLatency > 1000){
          setStatus("slow");
        }else{
          setStatus("connected");
        }

      }else{
        setStatus("connection_lost");
      }

    }catch(e){
      console.error("Connection Error:", e);
      setStatus("connection_lost");
    }

  }catch(e){
    console.error("Scan Error:", e);
    setStatus("error");
  }
}

/*********************************
 AUTO SCAN SYSTEM
*********************************/

async function autoScanESP(){

  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");

  // ❌ only ESP mode
  if(settings.systemMode !== "esp"){
    return null;
  }

  // 🔍 searching status
  setStatus("searching");

  const startTime = Date.now();
  const timeout = 8000;

  const baseIPs = [
  "192.168.174.",   // 🔥 ADD THIS (IMPORTANT)
  "192.168.0.",
  "192.168.1.",
  "192.168.4."
];

  for(let base of baseIPs){

    for(let i = 1; i <= 254; i++){

      // ⏱ timeout check
      if(Date.now() - startTime > timeout){
        setStatus("notfound");
        return null;
      }

      const ip = base + i;

      try{

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 800);

        const start = Date.now();

        const res = await fetch(`http://${ip}/data`, {
          signal: controller.signal
        });

        const latency = Date.now() - start;
        window.espLatency = latency;

        clearTimeout(timer);

        // ✅ FOUND DEVICE
        if(res.ok){

          // 🔥 SAVE IP
          const newSettings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
          newSettings.deviceIP = ip;
          localStorage.setItem("micropmu_settings", JSON.stringify(newSettings));

          // autofill input
          const input = document.getElementById("deviceIP");
          if(input) input.value = ip;

          window.espConnected = true;

          return ip;   // 🔥 return only (status handled outside)
        }

      }catch(e){
        // ignore errors (normal in scanning)
      }
    }
  }

  // ❌ NOT FOUND
  return null;
}

// ===== GLOBAL SYSTEM MODE =====
function getSystemMode(){
  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
  return settings.systemMode || "simulation";
}

// ===== REAL DATA CHECK =====
function hasRealData(){
  const logs = JSON.parse(localStorage.getItem("micropmu_logs") || "[]");
  return logs.length > 0;
}


// ===== EVENT TIMELINE STATE =====
let lastStatus = "SYSTEM HEALTHY";
let faultStartTime = null;
let activeFault = null;



  window.showAccessPopup = function(mode) {

  accessMode = mode;
  attemptsLeft = 3;

  const popup = document.getElementById("adminAccessPopup");
  if (!popup) return;

  popup.style.display = "flex";
  document.getElementById("adminAccessPass").value = "";

  document.getElementById("accessModeText").innerText =
    mode === "mirror" ? "🔁 Sync Mode Access" : "☁ Cloud Mode Access";

  document.getElementById("adminAttemptInfo").innerText = "Attempts left: 3";

  setTimeout(() => {
    document.getElementById("adminAccessPopup").style.opacity = "1";
  }, 10);

  setTimeout(() => {
    document.getElementById("adminAccessPass")?.focus();
  }, 200);
}


window.submitAccess = function() {

  const el = document.getElementById("adminAttemptInfo");
  const input = document.getElementById("adminAccessPass").value;
  const ACCESS_KEY = "904fc916382f58461415901a47dd8742";

  // ✅ CORRECT PASSWORD
  if (md5(input) === ACCESS_KEY) {

    if (accessMode === "mirror") {
      sessionStorage.setItem("syncVerified", "true");
    }
    else if (accessMode === "remote") {
      sessionStorage.setItem("cloudVerified", "true");
    }

    const popup = document.getElementById("adminAccessPopup");
    popup.style.display = "none";
    popup.style.opacity = "0";
    popup.style.pointerEvents = "none"; 

    return;
  }

  // ❌ WRONG PASSWORD
  attemptsLeft--;

  el.innerText = "Attempts left: " + attemptsLeft;

  // 🔥 COLOR CHANGE
  if (attemptsLeft <= 1) {
    el.style.color = "red";
  }

  // ❌ ALERT / BLOCK
  if (attemptsLeft > 0) {
    alert("❌ Wrong Password");
  } 
  else {
    el.innerText = "Access Blocked";
    document.body.innerHTML =
      "<h2 style='text-align:center;margin-top:100px'>⛔ Access Denied</h2>";
  }
};


function applyProtectionSettings() {

  const s = getSettings();

  if (s.vmin) LIMITS.VOLT_MIN = parseFloat(s.vmin);
  if (s.vmax) LIMITS.VOLT_MAX = parseFloat(s.vmax);

  if (s.overloadLimit)
    LIMITS.OVERLOAD_CURRENT = parseFloat(s.overloadLimit);

  if (s.shortLimit)
    LIMITS.SHORT_CURRENT = parseFloat(s.shortLimit);

  if (s.pfMin)
    LIMITS.PF_MIN = parseFloat(s.pfMin);

  if (s.fmin)
    LIMITS.FREQ_MIN = parseFloat(s.fmin);

  if (s.fmax)
    LIMITS.FREQ_MAX = parseFloat(s.fmax);

  if (s.tempMax)
    LIMITS.TEMP_MAX = parseFloat(s.tempMax);

}

/*********************************
 BUZZER SYSTEM (FINAL STABLE)
*********************************/

const buzzer = new Audio("buzzer.mp3");
buzzer.loop = true;

let audioUnlocked = false;



/* ================= AUDIO UNLOCK SYSTEM ================= */

// 🔥 unlock on first user interaction (browser restriction safe)
document.addEventListener("pointerdown", () => {

  if (audioUnlocked) return;

  buzzer.play().then(() => {
    buzzer.pause();
    buzzer.currentTime = 0;
    audioUnlocked = true;
    console.log("🔊 Audio Unlocked");
  }).catch((err)=>{
    console.warn("Audio unlock failed:", err);
  });

}, { once: true });


/* ================= BUZZER BUTTON ================= */

function toggleBuzzerMute() {

  const icon = document.getElementById("buzzerBox");

  buzzerMuted = !buzzerMuted;

  if (buzzerMuted) {

    // 🔥 stop instantly
    buzzer.pause();
    buzzer.currentTime = 0;
    buzzerPlaying = false;

    if (icon) {
      icon.innerText = "🔕";
      icon.classList.add("buzzer-muted");
    }

  } else {

    if (icon) {
      icon.innerText = "🔊";
      icon.classList.remove("buzzer-muted");
    }

    // 🔥 resume only if fault + unlocked
    if (audioUnlocked && evaluateStatus() !== "SYSTEM HEALTHY") {
      playBuzzer();
    }

  }

}


/* ================= PLAY BUZZER ================= */

function playBuzzer() {

  if (buzzerMuted) return;

  // 🔥 prevent autoplay block
  if (!audioUnlocked) return;

  // 🔥 prevent multiple triggers
  if (!buzzerPlaying) {
    buzzer.currentTime = 0;

    buzzer.play().then(() => {
      buzzerPlaying = true;
    }).catch((err)=>{
      console.warn("Buzzer play blocked:", err);
    });
  }

}


/* ================= STOP BUZZER ================= */

function stopBuzzer() {

  if (!buzzerPlaying) return;

  buzzer.pause();
  buzzer.currentTime = 0;
  buzzerPlaying = false;

}


/* ================= PRELOAD (SAFE) ================= */

window.addEventListener("load", () => {
  buzzer.load(); // only preload, no autoplay
});

/* ================= RANDOM CONTROL ================= */

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function applySystemPhysics(){

  // ================= VOLTAGE ↔ CURRENT =================
  if (voltage > 240) current *= 0.9;
  if (voltage < 210) current *= 1.15;

  // ================= PF EFFECT =================
  if (pf < 0.85){
    current *= 1.1;
    temperature += 5;
  }

  // ================= PF NATURAL RECOVERY =================
if (pf < 0.98) {
  pf += 0.005;
}

  // ================= LOAD HEATING =================
  if (current > LIMITS.OVERLOAD_CURRENT){
    temperature += (current - LIMITS.OVERLOAD_CURRENT) * 1.5;
  }

  // ================= SHORT CIRCUIT =================
  if (current > LIMITS.SHORT_CURRENT){
    temperature += 20;
    voltage *= 0.9; // 🔥 voltage drop due to fault
  }

  // ================= FREQUENCY EFFECT =================
  if (frequency < 49 || frequency > 51){
    temperature += 3;
    current *= 1.05; // instability → more stress
  }

  // ================= TEMPERATURE FEEDBACK =================
  // high temperature → resistance ↑ → current slightly ↓
  if (temperature > 50){
    current *= 0.95;
  }

  // ================= VOLTAGE DROP DUE TO LOAD =================
  // heavy load → voltage sag (real grid behavior)
  if (current > 8){
    voltage -= (current * 0.5);
  }

  // ================= PF ↔ VOLTAGE RELATION =================
  if (pf < 0.8){
    voltage -= 2;
  }

  // ================= THERMAL COOLING (IMPORTANT 🔥) =================
  // natural cooling effect (transformer behavior)
  let ambient = 28;
  if (temperature > ambient){
    temperature -= (temperature - ambient) * 0.02;
  }

  // ================= NO NEGATIVE / LIMIT =================
  temperature = Math.min(temperature, 80);
  temperature = Math.max(28, temperature);

  current = Math.max(0, current);
  voltage = Math.max(180, voltage);

  // ================= CLEAN VALUES =================
  current = parseFloat(current.toFixed(2));
  voltage = parseFloat(voltage.toFixed(2));
  temperature = parseFloat(temperature.toFixed(1));

  // ================= HUMIDITY FINAL ENGINE =================
if (typeof humidity !== "number") {
  humidity = 50;
}

// temperature effect
if (temperature > 45) humidity -= 2;
if (temperature < 30) humidity += 1;

// load effect
if (current > 8) humidity -= 1;

// day/night effect
let hour = new Date().getHours();
if (hour >= 18 || hour <= 6) humidity += 2;

// random fluctuation
humidity += (Math.random() - 0.5) * 2;

// limits
humidity = Math.max(30, Math.min(70, humidity));

// clean value
humidity = parseFloat(humidity.toFixed(1));
}


function applyFault(type) {

  switch (type) {

    case "NORMAL":

  voltage = random(220, 235);

  let baseCurrent = (Math.random() * 3 + 1);
  current = current * 0.8 + baseCurrent * 0.2;

  let rand = Math.random();

if(rand < 0.7){
  // 🔴 lagging (70%)
  pf = parseFloat((0.85 + Math.random() * 0.1).toFixed(2));
  pf = Math.min(Math.max(pf, 0.01), 1);
  if(pf > 0 && pf <= 1){
  phaseAngle = Math.acos(pf) * 180 / Math.PI;
}else{
  phaseAngle = 0;
}
}
else if(rand < 0.9){
  // 🔵 leading (20%)
  pf = parseFloat((0.85 + Math.random() * 0.1).toFixed(2));
  pf = Math.min(Math.max(pf, 0.01), 1);
  phaseAngle = -Math.acos(pf) * DEG;
}
else{
  // ⚪ unity (10%)
  pf = 1;
  phaseAngle = 0;
}

  frequency = parseFloat((49.99 + Math.random() * 0.02).toFixed(2));

  // 🔥 cooling
  temperature -= 2;
  if (temperature < 30) temperature = 25;

  break;

    case "LOW VOLTAGE":
      voltage = random(180, 205);
      current = parseFloat((Math.random() * 2 + 1).toFixed(2));
      frequency = 49.7;
      pf = 0.9;
      temperature = 35;
      break;

    case "OVER VOLTAGE":
      voltage = random(240, 260);
      current = parseFloat((Math.random() * 3 + 1).toFixed(2));
      frequency = 50.2;
      pf = 0.93;
      temperature = 36;
      break;

    case "OVERLOAD":
      voltage = random(220, 230);
      current = random(10, 14);
      frequency = 49.8;
      pf = 0.85;
      temperature = random(45, 60);
      break;

    case "SHORT CIRCUIT":
      voltage = random(200, 230);
      current = random(15, 20);
      frequency = 49.5;
      pf = 0.7;
      temperature = random(50, 70);
      break;

    case "LOW POWER FACTOR":
      voltage = random(220, 230);
      current = parseFloat((Math.random() * 4 + 2).toFixed(2));
      frequency = 50;
      pf = parseFloat((0.6 + Math.random() * 0.2).toFixed(2));
      temperature = 40;
      break;

    case "FREQUENCY FAULT":
      voltage = random(220, 230);
      current = parseFloat((Math.random() * 3 + 1).toFixed(2));
      frequency = random(47, 53);
      pf = 0.9;
      temperature = 38;
      break;

    case "HIGH CURRENT":
      voltage = random(215, 230);
      current = random(8, 12); // high but not overload
      frequency = 49.9;
      pf = 0.88;
      temperature = random(35, 45);
      break;

    case "UNDER FREQUENCY":
      voltage = random(220, 230);
      current = random(2, 5);
      frequency = random(47, 49);
      pf = 0.9;
      temperature = 35;
      break;

    case "OVER FREQUENCY":
      voltage = random(220, 230);
      current = random(2, 5);
      frequency = random(51, 53);
      pf = 0.92;
      temperature = 36;
      break;

    case "LINE DISTURBANCE":
      voltage = random(200, 240); // fluctuating
      current = parseFloat((Math.random() * 5).toFixed(2));
      frequency = parseFloat((49 + Math.random() * 2).toFixed(2));
      pf = parseFloat((0.7 + Math.random() * 0.2).toFixed(2));
      temperature = random(35, 45);
      break;

}

  /* =========================
   PF → PHASE ANGLE LINK
========================= */
pf = Math.min(Math.max(pf, 0.01), 1);
phaseAngle = parseFloat((Math.acos(pf) * 180 / Math.PI).toFixed(1));

/* =========================
   OPTIONAL: LEADING PF (20% chance)
========================= */
if(Math.random() < 0.2){
  phaseAngle = -phaseAngle; // 🔵 leading
}

}

/* ================= SETTINGS ================= */

function getSettings() {
  return JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
}

/* ================= STATUS ENGINE (FINAL FIXED) ================= */

let csvFaultBuffer = [];
let csvFaultStable = "SYSTEM HEALTHY";

function evaluateCSVFault(){

  const faults = [];

  // ===== CURRENT (SOFT) =====
  if(current > 17){
    faults.push("SHORT CIRCUIT");
  }
  else if(current > 14){
    faults.push("OVERLOAD");
  }
  else if(current > 11){
    faults.push("HIGH CURRENT");
  }

  // ===== VOLTAGE =====
  if(voltage < 195){
    faults.push("LOW VOLTAGE");
  }
  else if(voltage > 255){
    faults.push("OVER VOLTAGE");
  }

  // ===== PF =====
  if(pf < 0.7){
    faults.push("LOW POWER FACTOR");
  }

  // ===== FREQUENCY =====
  if(frequency < 48 || frequency > 52){
    faults.push("FREQUENCY FAULT");
  }

  if(faults.length === 0){
    return "SYSTEM HEALTHY";
  }

  return faults[0];
}


// 🔥 STABLE FILTER (IMPORTANT)
function getStableCSVFault(){

  const currentFault = evaluateCSVFault();

  csvFaultBuffer.push(currentFault);

  if(csvFaultBuffer.length > 5){
    csvFaultBuffer.shift();
  }

  const count = {};
  csvFaultBuffer.forEach(f => {
    count[f] = (count[f] || 0) + 1;
  });

  let maxFault = "SYSTEM HEALTHY";
  let maxCount = 0;

  for(let f in count){
    if(count[f] > maxCount){
      maxFault = f;
      maxCount = count[f];
    }
  }

  if(maxCount >= 3){
    csvFaultStable = maxFault;
  }

  return csvFaultStable;
}

function evaluateStatus(returnAll = false) {

 const mode = getSystemMode();

// 🔥 ONLY CSV MODE
if(mode === "hybrid"){
  return getStableCSVFault();
}

if(isNoData){

  // ===== BASIC PARAMETERS =====
  const map = {
    v: "--",
    c: "--",
    f: "--",
    p: "--",
    pfVal: "--",
    temp: "--",
    humidityVal: "--",

    // ===== PERFORMANCE =====
    load: "--",
    energy: "--",
    efficiency: "--",
    freqStability: "--",
    vsi: "--",

    // ===== EXTRA =====
    phaseAngleVal: "--"
  };

  Object.entries(map).forEach(([id,val])=>{
    const el = document.getElementById(id);
    if(el) el.innerText = val;
  });

  // ===== STATUS =====
  const statusEl = document.getElementById("statusText");
  if(statusEl) statusEl.innerText = "NO DATA";

  // ===== SEVERITY =====
  const sev = document.getElementById("severityLevel");
  if(sev){
    sev.innerText = "--";
    sev.style.color = "#94a3b8";
  }

  // ===== FAULT LOCATION =====
  const loc = document.getElementById("faultLocation");
  if(loc) loc.innerText = "--";

  // ===== BUZZER =====
  stopBuzzer();

  return; // 🔥 FULL STOP
}

  const sensitivity = getSettings().alarmSensitivity || "medium";

  let overloadLimit = LIMITS.OVERLOAD_CURRENT;

  if (sensitivity === "low") overloadLimit += 2;
  if (sensitivity === "high") overloadLimit -= 2;
  

  // ===== ALL FAULTS COLLECT =====
  const faults = [];

  // 🔥 PRIORITY SAFE CONDITIONS (NO DUPLICATE LOGIC)
  if (current >= LIMITS.SHORT_CURRENT) {
    faults.push("SHORT CIRCUIT");
  }
  else if (current >= overloadLimit) {
    faults.push("OVERLOAD");
  }
  else if (current > 8) {
    faults.push("HIGH CURRENT");
  }

  if (voltage < LIMITS.VOLT_MIN) {
    faults.push("LOW VOLTAGE");
  }
  else if (voltage >= LIMITS.VOLT_MIN && voltage < LIMITS.VOLT_WARN) {
    faults.push("WARNING");
  }
  else if (voltage > LIMITS.VOLT_MAX) {
    faults.push("OVER VOLTAGE");
  }

  if (pf < LIMITS.PF_MIN) {
    faults.push("LOW POWER FACTOR");
  }

  if (frequency < LIMITS.FREQ_MIN || frequency > LIMITS.FREQ_MAX) {
    faults.push("FREQUENCY FAULT");

    // 🔥 Sub classification (optional but useful)
    if (frequency < 49) faults.push("UNDER FREQUENCY");
    if (frequency > 51) faults.push("OVER FREQUENCY");
  }

  if (temperature > LIMITS.TEMP_MAX) {
    faults.push("OVER TEMPERATURE");
  }

  // ===== NO FAULT =====
  if (faults.length === 0) {
    return returnAll ? ["SYSTEM HEALTHY"] : "SYSTEM HEALTHY";
  }

  // ===== PRIORITY ORDER =====
  const priority = [
    "SHORT CIRCUIT",
    "OVERLOAD",
    "OVER VOLTAGE",
    "LOW VOLTAGE",
    "FREQUENCY FAULT",
    "OVER TEMPERATURE",
    "LOW POWER FACTOR",
    "HIGH CURRENT",
    "WARNING"
  ];

  // ===== FIND HIGHEST PRIORITY =====
  let primary = faults[0];

  for (let p of priority) {
    if (faults.includes(p)) {
      primary = p;
      break;
    }
  }

  // ===== RETURN MODE =====
  if (returnAll) {
    return faults;  // ✅ for AI / logs
  }

  return primary;   // ✅ for UI
}
/*********************************
 EVENT TIMELINE ENGINE
*********************************/

function trackTimeline() {

if(isNoData) return;
  const currentStatus = evaluateStatus();

  // ===== NEW FAULT DETECTED =====
  if (currentStatus !== "SYSTEM HEALTHY" && lastStatus === "SYSTEM HEALTHY") {

    faultStartTime = new Date();
    activeFault = currentStatus;

    saveTimeline("FAULT START", currentStatus, faultStartTime);
  }

  // ===== FAULT RECOVERED =====
  if (currentStatus === "SYSTEM HEALTHY" && lastStatus !== "SYSTEM HEALTHY") {

    const recoveryTime = new Date();

    saveTimeline("RECOVERED", activeFault, recoveryTime);

    faultStartTime = null;
    activeFault = null;
  }

  lastStatus = currentStatus;
}


function saveTimeline(type, fault, time) {

  let timeline = JSON.parse(localStorage.getItem("micropmu_timeline") || "[]");

  timeline.push({
    type,
    fault,
    time: time.toLocaleString()
  });

  // 🔥 LIMIT TO LAST 200 EVENTS
  if (timeline.length > 200) {
    timeline.shift();
  }
  localStorage.setItem("micropmu_timeline", JSON.stringify(timeline));
}

/*********************************
 SYSTEM MODE DISPLAY
*********************************/

function updateSystemModeUI() {

  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
  systemMode = settings.systemMode || "simulation";

  const elements = document.querySelectorAll("#liveMode, #systemModeLabel, #perfMode");

  elements.forEach(el => {
    if (!el) return;

    if (getSystemMode() === "esp"){
      el.innerText = "ESP Mode";
    }
    else if (systemMode === "hybrid") {
      el.innerText = "Hybrid Mode";
    }
    else {
      el.innerText = "Simulation";
    }

    // 🔥 CSV CONTROL BUTTON TOGGLE
const ctrl = document.getElementById("csvControlBox");
if(ctrl){
  ctrl.style.display = (systemMode === "hybrid") ? "block" : "none";
}
  });


// limit size (important)
if(history.length > 50){
  history.shift();
}

}

function broadcastUpdate(){

  localStorage.setItem("micropmu_sync", Date.now());
}



function detectVoltageTrend(){

  if(history.length < 5) return "Stable";

  let first = history[0].voltage;
  let last = history[history.length-1].voltage;

  if(last - first > 10) return "Rising ⚡";
  if(first - last > 10) return "Dropping ⚠";
  return "Stable";
}

/* ==================================================== */
/* ================= DASHBOARD UPDATE ================= */
/* ==================================================== */
function updateDashboard(forcedStatus = null) {



  let level = "NORMAL";
  let color = "#22c55e";

  const status = forcedStatus || evaluateStatus();

  // ===== AI HISTORY UPDATE =====
  history.push({
    voltage,
    current,
    frequency,
    pf,
    temperature
  });

  if(history.length > 50){
    history.shift();
  }
  
  // ===== FAULT DURATION =====
  if (faultStartTime) {
    const now = new Date();
    faultDuration = ((now - faultStartTime) / 1000).toFixed(1);

    const fdOld = document.getElementById("faultDuration");
    if (fdOld) {
      fdOld.innerText = faultDuration + " sec";
    }
  }

  // ===== NETWORK MODE =====
  const modeLabel = document.getElementById("modeLabel");
  if (modeLabel) {
    const mode = localStorage.getItem("networkMode") || "local";

    if (mode === "local") modeLabel.innerText = "Admin Mode";
    else if (mode === "mirror") modeLabel.innerText = "Sync Mode";
    else modeLabel.innerText = "Cloud Mode";
  }

  // ===== SYSTEM MODE =====
const liveModeEl = document.getElementById("liveMode");

if (liveModeEl) {

  const mode = getSystemMode(); // 🔥 ALWAYS LIVE

  if (mode === "esp") {
    liveModeEl.innerText = "ESP Mode";
  }
  else if (mode === "hybrid") {
    liveModeEl.innerText = "Hybrid Mode";
  }
  else {
    liveModeEl.innerText = "Simulation";
  }
}
  // ===== VALUES (SAFE FIX - NO BLOCK DEPENDENCY) =====
  const vEl = document.getElementById("v");
  if (vEl) vEl.innerText = voltage + " V";

  const cEl = document.getElementById("c");
  if (cEl) cEl.innerText = current + " A";

  const fEl = document.getElementById("f");
  if (fEl) fEl.innerText = frequency + " Hz";

  const pEl = document.getElementById("p");
  if (pEl) pEl.innerText = power + " W";

  const pfEl = document.getElementById("pfVal");
  if (pfEl) pfEl.innerText = pf.toFixed(2);

  // ===== Temperature =====
  const tempEl = document.getElementById("temp");
  if (tempEl) {
    tempEl.innerText = temperature.toFixed(1) + " °C";
  }

  // ===== PERFORMANCE (FIXED IDs MATCH YOUR HTML) =====

  // Phase Angle
  const phaseEl = document.getElementById("phaseAngleVal");
  if (phaseEl) {
    phaseEl.innerText = phaseAngle + "°";
  }

  // Load Demand ✅ FIXED
  const loadEl = document.getElementById("load");
  if (loadEl) {
    const loadKW = power / 1000;
    loadEl.innerText = loadKW.toFixed(2) + " kW";
  }

  // Energy ✅ FIXED
  const energyEl = document.getElementById("energy");
  if (energyEl) {
    energyEl.innerText = energy.toFixed(3) + " kWh";
  }

  // Efficiency ✅ FIXED
  const effEl = document.getElementById("efficiency");
  if (effEl) {
    let efficiency = Math.max(0, Math.min(100, pf * 100));
    effEl.innerText = efficiency.toFixed(1) + " %";
  }

  // Frequency Stability ✅ FIXED
  const freqEl = document.getElementById("freqStability");
  if (freqEl) {
    let stability = 100 - Math.abs(frequency - 50) * 20;
    stability = Math.max(0, Math.min(100, stability));
    freqEl.innerText = stability.toFixed(0) + "%";
  }

  // Voltage Stability ✅ FIXED (vsi)
  const voltEl = document.getElementById("vsi");
  if (voltEl) {
    let stability = 100 - Math.abs(voltage - 230) * 2;
    stability = Math.max(0, Math.min(100, stability));
    voltEl.innerText = stability.toFixed(0) + "%";
  }

  // Humidity
  const humidityEl = document.getElementById("humidityVal");
  if (humidityEl) {
    if (typeof humidity !== "number" || isNaN(humidity)) {
      humidity = 50;
    }
    humidityEl.innerText = humidity.toFixed(1) + " %";
  }


  
  // ===== STATUS CARD =====
  const statusEl = document.getElementById("statusText");
  const statusCard = document.getElementById("statusCard");

  if (statusEl && statusCard) {

    statusEl.innerText = status;

    if (status === "SYSTEM HEALTHY") {
      statusCard.className = "card status normal";
      stopBuzzer();
    } else {
      statusCard.className = "card status danger";

      const settings = getSettings();
      const buzzerMode = settings.dashBuzzerMode || "auto";

      if (buzzerMode === "auto" && !buzzerMuted) {
        playBuzzer();
      }
    }
  }


  
  // ===== SEVERITY LEVEL (🔥 FIXED INSIDE FUNCTION) =====
  const el = document.getElementById("severityLevel");

if (el) {

  level = "NORMAL";
  color = "#22c55e";

  if (status === "WARNING") {
    level = "LOW";
    color = "#facc15";
  }
  else if (status === "LOW VOLTAGE" || status === "OVER VOLTAGE") {
    level = "MEDIUM";
    color = "#f97316";
  }
  else if (status === "LOW POWER FACTOR") {
    level = "MEDIUM";
    color = "#eab308";
  }
  else if (status === "FREQUENCY FAULT") {
    level = "HIGH";
    color = "#fb923c";
  }
  else if (status === "OVERLOAD") {
    level = "HIGH";
    color = "#ef4444";
  }
  else if (status === "OVER TEMPERATURE") {
    level = "HIGH";
    color = "#f43f5e";
  }
 else if (status === "SHORT CIRCUIT") {

  if (current < 15) {
    level = "HIGH";
    color = "#fb923c";
  }
  else if (current < 20) {
    level = "CRITICAL";
    color = "#f97316";
  }
  else if (current < 25) {
    level = "CRITICAL+";
    color = "#ef4444";
  }
  else {
    level = "CRITICAL++";
    color = "#dc2626";
  }
}

  // 🔥 IMPORTANT (missing part)
  el.innerText = level;
  el.style.color = color;
}


  const strip = document.querySelector(".fault-strip");

if (strip) {

  let stripColor = "#13e90b"; // green default

  if (level === "LOW") stripColor = "#facc15";
  else if (level === "MEDIUM") stripColor = "#f97316";
  else if (level === "HIGH") stripColor = "#ef4444";
  else if (level === "CRITICAL") stripColor = "#f97316";
  else if (level === "CRITICAL+") stripColor = "#ef4444";
  else if (level === "CRITICAL++") stripColor = "#dc2626";

  // 🔥 APPLY BOTH SIDES
  strip.style.borderLeft = "5px solid " + stripColor;
  strip.style.borderRight = "5px solid " + stripColor;

  // 🔥 BLINK ONLY ON FAULT
  if (level !== "NORMAL") {
    strip.classList.add("fault-blink");
  } else {
    strip.classList.remove("fault-blink");
  }
}
    // ===== SMART LOCATION WITH DYNAMIC TAG =====
    const locEl = document.getElementById("faultLocation");

    if (locEl) {

      let location = "NORMAL";

      if (status === "SHORT CIRCUIT") {
        location = "⚡ Line Fault";
      }
      else if (status === "OVERLOAD") {
        location = "⚡ Load Surge";
      }
      else if (status === "LOW VOLTAGE") {
        location = "⚡ Voltage Drop";
      }
      else if (status === "OVER VOLTAGE") {
        location = "⚡ Grid Surge";
      }
      else if (status === "LOW POWER FACTOR") {
        location = "⚡ PF Issue";
      }
      else if (status === "FREQUENCY FAULT") {
        location = "⚡ Freq Instability";
      }
      else if (status === "OVER TEMPERATURE") {
        location = "⚡ Overheat";
      }

      locEl.innerText = location;
    }

    // ===== TIMELINE ENGINE =====
    

    if (!window._timelineUIThrottle) {
      window._timelineUIThrottle = true;

      setTimeout(() => {
        updateTimelineUI();
        window._timelineUIThrottle = false;
      }, 2000);
    }
   
  }

  window.addEventListener("storage", (e) => {
  if(e.key === "micropmu_sync"){
    safeUIUpdate();
    generateAIReport(); 

    // export page ho toh hi run hoga (safe)
    if(typeof updateExportPage === "function"){
      updateExportPage();
    }
  }
});

/************* AI BUTTON + INIT *******************/
document.addEventListener("DOMContentLoaded", () => {

  const modeEl = document.getElementById("systemMode");
if(modeEl){
  modeEl.value = getSystemMode();
}

  // ===== ACCESS CHECK =====
  if (!checkDashboardAccess()) return;

  // ===== CORE INIT =====
  loadFirebaseSafe();
  detectModeFromURL();
  applyModeFromSettings();

  if (typeof firebase !== "undefined") {
    startFirebaseSync();
  }

  const settings = getSettings();

  // ===== AI BUTTON =====
  const aiBtn = document.getElementById("aiBtn");

  if (aiBtn) {
    aiBtn.addEventListener("click", openAI);

    const status = evaluateStatus();

    // 🔥 Better color logic
    if (status !== "SYSTEM HEALTHY") {
      aiBtn.style.background = "#be4dfa"; // red (fault)
    } else {
      aiBtn.style.background = "#22c55e"; // green (normal)
    }
  }

  // ===== LOAD TYPE FIX =====
  const loadTypeEl = document.getElementById("loadType");

  if (loadTypeEl) {
    loadTypeEl.addEventListener("change", function () {

      const loadInput = document.getElementById("calcPower");
      const pfInput = document.getElementById("calcPF");
      const label = document.getElementById("loadLabel");

      if (!loadInput || !pfInput || !label) return;

      let load = parseFloat(loadInput.value);
      let pf = parseFloat(pfInput.value);

      const newType = this.value;
      const prevType = loadInput.getAttribute("data-type") || "W";

      if (newType === "kVA") label.innerText = "Load (kVA)";
      else if (newType === "W") label.innerText = "Load (W)";
      else label.innerText = "Load (kW)";

      if (!isNaN(load) && prevType !== newType) {

        if (prevType === "W" && newType === "kW") load /= 1000;
        else if (prevType === "kW" && newType === "W") load *= 1000;
        else if (newType === "kVA" && !isNaN(pf) && pf !== 0) load /= pf;
        else if (prevType === "kVA" && newType === "kW" && !isNaN(pf)) load *= pf;

        loadInput.value = load.toFixed(2);
      }

      loadInput.setAttribute("data-type", newType);

    });
  }

  // ===== GRAPH CONTROLS =====
  const graphSelect = document.getElementById("graphPoints");
  const refreshSelect = document.getElementById("autoRefresh");

  if (graphSelect) {
    graphSelect.addEventListener("change", startGraphEngine);
  }

  if (refreshSelect) {
    refreshSelect.addEventListener("change", startGraphEngine);
  }

});

 /************* AI BUTTON + INIT (FIXED) *******************/


  /********************END UPDATE**************************/


  /* ================= SAMPLING ENGINE ================= */

  function startSampling() {

    if (samplingTimer) clearInterval(samplingTimer);

    const settings = getSettings();
    const rate = Math.max(500, parseInt(settings.samplingRate) || 1000);

    samplingTimer = setInterval(updateSystem, rate);

    const perfRateEl = document.getElementById("perfRate");
if(perfRateEl){
  const rate = parseInt(getSettings().samplingRate) || 1000;
  perfRateEl.innerText = rate + " ms";
 
  const rateEl = document.getElementById("liveRate");
if(rateEl){
  const rate = parseInt(getSettings().samplingRate) || 1000;
  rateEl.innerText = rate + " ms";
}

}
  }

  /* Start when page loads */


    // ✅ fault timer engine (FINAL ULTRA SMOOTH)
setInterval(() => {

  const ft = document.getElementById("faultTimeNew");
  const fd = document.getElementById("faultDurationNew");

  if (!ft || !fd) return;

  const status = evaluateStatus();

  // 🔥 ONLY RUN WHEN REAL FAULT ACTIVE
  if (faultStartTime && status !== "SYSTEM HEALTHY") {

    const diffMs = Date.now() - faultStartTime;

    const seconds = Math.floor(diffMs / 1000);
    const ms = diffMs % 1000;

    ft.innerText = faultStartTime.toLocaleTimeString();
    fd.innerText = `${seconds}s ${ms.toString().padStart(3, '0')}ms`;

  } 
  else {

    // 🔥 INSTANT RESET (NO 1 sec DELAY)
    if (faultStartTime) {
      faultStartTime = null;
    }

    ft.innerText = "--";
    fd.innerText = "0s 0ms";
  }

}, 50); // ⚡ ULTRA SMOOTH (20 FPS feel)



  /*********************************
   GRAPH ENGINE (GLOBAL SYNCED)
  **********************************/

  let dashboardCharts = {};
  let liveCharts = {};
  let performanceCharts = {};

  let graphTimer = null;

  /* ================= DASHBOARD GRAPHS ================= */

  function initDashboardCharts() {

    if (!document.getElementById("voltageChart")) return;

    dashboardCharts.voltage = new Chart(
      document.getElementById("voltageChart"),
      {
        type: "line",
        data: {
          labels: [],
          datasets: [{
            label: "Voltage",
            data: [],
            borderColor: "#38bdf8",
            tension: 0.3,
            
            pointRadius: 1,
            borderWidth: 2,
            fill: false

          }]
        }
      }
    );

    dashboardCharts.current = new Chart(
      document.getElementById("currentChart"),
      {
        type: "line",
        data: {
          labels: [],
          datasets: [{
            label: "Current",
            data: [],
            borderColor: "#22c55e",
            tension: 0.3
          }]
        }
      }
    );
  }

  /* ================= LIVE PAGE GRAPHS ================= */

  function initLiveCharts() {

  if (!document.getElementById("liveVoltage")) return;

  const ids = ["liveVoltage", "liveCurrent", "liveFrequency", "livePower"];

  ids.forEach(id => {

    let color = "#38bdf8"; // default

    // ===== ONLY COLOR CHANGE =====
    if (id === "liveVoltage") color = "#38bdf8";   // 🔵 Blue
    else if (id === "liveCurrent") color = "#22c55e"; // 🟢 Green
    else if (id === "liveFrequency") color = "#d708ea"; // 🟡 Yellow
    else if (id === "livePower") color = "#f97316"; // 🟠 Orange

    liveCharts[id] = new Chart(
      document.getElementById(id),
      {
        type: "line",
        data: {
          labels: [],
          datasets: [{
            label: id,
            data: [],
            borderColor: color, // ✅ applied
            tension: 0.3
          }]
        }
      }
    );
  });
}

  /* ================= PERFORMANCE GRAPHS ================= */

  function initPerformanceCharts() {

    if (!document.getElementById("pfChart")) return;

    performanceCharts.phaseAngle = new Chart(
      document.getElementById("pfChart"),
      {
        type: "line",
        data: { labels: [], datasets: [{ label: "Phase Angle", data: [], borderColor: "#38bdf8", tension: 0.3 }] }
      }
    );

    performanceCharts.load = new Chart(
      document.getElementById("loadChart"),
      {
        type: "line",
        data: { labels: [], datasets: [{ label: "Load (kW)", data: [], borderColor: "#22c55e", tension: 0.3 }] }
      }
    );

    performanceCharts.energy = new Chart(
      document.getElementById("energyChart"),
      {
        type: "line",
        data: { labels: [], datasets: [{ label: "Energy (kWh)", data: [], borderColor: "#a855f7", tension: 0.3 }] }
      }
    );

    performanceCharts.eff = new Chart(
      document.getElementById("effChart"),
      {
        type: "line",
        data: { labels: [], datasets: [{ label: "Efficiency (%)", data: [], borderColor: "#f97316", tension: 0.3 }] }
      }
    );
  }


window.drawPhasor = function(){

  const canvas = document.getElementById("phasorCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  const w = canvas.width;
  const h = canvas.height;

  const cx = w / 2;
  const shiftUp = 15;  // 🔥 jitna upar lena hai (10–25 try kar)
const cy = (h / 2) - shiftUp;

  /* 🔥 responsive radius */
  const radius = Math.min(w, h) * 0.35;

  ctx.clearRect(0, 0, w, h);

  ctx.lineWidth = 2;

  /* =========================
     AXES (REFERENCE)
  ========================= */
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;

  // horizontal
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.stroke();

  // vertical
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.stroke();

  /* =========================
     OUTER CIRCLE
  ========================= */
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  /* =========================
     VOLTAGE (REFERENCE)
  ========================= */
  ctx.strokeStyle = "#f87171";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.stroke();

  /* label V */
  ctx.fillStyle = "#f87171";
  ctx.font = "12px sans-serif";
  ctx.fillText("V", cx + radius + 6, cy + 4);


  /*=========================
   VOLTAGE ARROW
   =========================*/

   const vArrowSize = 8;

ctx.beginPath();
ctx.moveTo(cx + radius, cy);

ctx.lineTo(cx + radius - vArrowSize, cy - vArrowSize / 2);
ctx.lineTo(cx + radius - vArrowSize, cy + vArrowSize / 2);

ctx.closePath();
ctx.fillStyle = "#f87171";
ctx.fill();

  /* =========================
     CURRENT PHASOR
  ========================= */
  const angle = phaseAngle * Math.PI / 180;

  ctx.strokeStyle = "#4ade80";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(
    cx + radius * Math.cos(angle),
    cy - radius * Math.sin(angle)
  );
  ctx.stroke();

  /* label I */
  ctx.fillStyle = "#4ade80";
  ctx.fillText(
    "I",
    cx + radius * Math.cos(angle) + 6,
    cy - radius * Math.sin(angle)
  );

  /* =========================
   ARROW HEAD (CURRENT)
========================= */
const arrowSize = 8;

const endX = cx + radius * Math.cos(angle);
const endY = cy - radius * Math.sin(angle);

ctx.beginPath();
ctx.moveTo(endX, endY);

ctx.lineTo(
  endX - arrowSize * Math.cos(angle - Math.PI / 6),
  endY + arrowSize * Math.sin(angle - Math.PI / 6)
);

ctx.lineTo(
  endX - arrowSize * Math.cos(angle + Math.PI / 6),
  endY + arrowSize * Math.sin(angle + Math.PI / 6)
);

ctx.closePath();
ctx.fillStyle = "#4ade80";
ctx.fill();

/* =========================
   ANGLE SECTOR (FILL)
========================= */
ctx.beginPath();
ctx.moveTo(cx, cy);
ctx.arc(cx, cy, radius * 0.5, 0, -angle, true);
ctx.closePath();

ctx.fillStyle = "rgba(56,189,248,0.15)"; // 🔥 soft blue fill
ctx.fill();

  /* =========================
     ANGLE ARC (PF ANGLE)
  ========================= */
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.5, 0, -angle, true);
  ctx.stroke();

 /* 🔥 angle text near current phasor */
ctx.fillStyle = "#38bdf8";

ctx.textAlign = "center";
ctx.textBaseline = "middle";

/* 🔥 position (auto based on angle) */
let textX = cx + (radius + 20) * Math.cos(angle);
let textY = cy - (radius + 20) * Math.sin(angle);

/* 🔥 manual adjustments (yaha se control kar) */
const offsetX = 20;   // ➡️ right (+) / left (-)
const offsetY = 5;   // ⬇️ down (+) / up (-)

/* apply offset */
textX += offsetX;
textY += offsetY;

ctx.fillText(
  "θ = " + phaseAngle.toFixed(1) + "°",
  textX,
  textY
);

  /* =========================
     CENTER POINT
  ========================= */
  ctx.fillStyle = "#94a3b8";
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();

  /* =========================
     PF TYPE (Lag/Lead)
  ========================= */
  ctx.fillStyle = "#cbd5f5";
  ctx.font = "12px sans-serif";

  let pfType = "Unity";

if (phaseAngle > 0) pfType = "Lagging";
else if (phaseAngle < 0) pfType = "Leading";
else pfType = "Unity";

  const pfOffsetY = -4;  // 🔥 FOR UP PUT NEGATIVE VALUE 
  

ctx.fillText(
  "PF: " + pfType,
  cx - 3,
  cy + radius + 20 + pfOffsetY
);
};

 /* setInterval(updateWiFiStatus, 2000);


  /* ================= GLOBAL GRAPH UPDATE ================= */

  function startGraphEngine() {

  // 🔥 ALWAYS CLEAR OLD TIMER (ONLY ONCE)
  if (graphTimer) {
    clearInterval(graphTimer);
    graphTimer = null;
  }

  const settings = getSettings();

  // ===== AUTO REFRESH OFF =====
  if (settings.autoRefresh === "off") {
    console.log("📊 Graph OFF");
    return;
  }

  const rate = Math.max(500, parseInt(settings.samplingRate) || 1000);

  console.log("📊 Graph Rate:", rate);

  // 🔥 START NEW TIMER
  graphTimer = setInterval(() => {
  if(isNoData) return;

    // ===== DASHBOARD =====
    if (dashboardCharts.voltage) {
      pushData(dashboardCharts.voltage, voltage);
      pushData(dashboardCharts.current, current);
    }

    // ===== LIVE =====
    if (liveCharts.liveVoltage) {
      pushData(liveCharts.liveVoltage, voltage);
      pushData(liveCharts.liveCurrent, current);
      pushData(liveCharts.liveFrequency, frequency);
      pushData(liveCharts.livePower, power);
    }

    // ===== PERFORMANCE =====
    if (performanceCharts.phaseAngle) {

      let loadKW = parseFloat((voltage * current * pf / 1000).toFixed(2));
      let efficiency = Math.floor(pf * 100);

      pushData(performanceCharts.phaseAngle, phaseAngle);
      pushData(performanceCharts.load, loadKW);

      // 🔥 ENERGY CALC SAFE
      pushData(performanceCharts.energy, energy);

      pushData(performanceCharts.eff, efficiency);
    }

    // ===== PHASOR DRAW =====
    drawPhasor();

  }, rate);
}

    
  function resetGraphs() {

    Object.values(dashboardCharts).forEach(c => {
      c.data.labels = [];
      c.data.datasets[0].data = [];
      c.update();
    });

    Object.values(liveCharts).forEach(c => {
      c.data.labels = [];
      c.data.datasets[0].data = [];
      c.update();
    });

    Object.values(performanceCharts).forEach(c => {
      c.data.labels = [];
      c.data.datasets[0].data = [];
      c.update();
    });

    alert("Graphs Reset");

  }
  /* ================= PUSH DATA SAFE ================= */

  function pushData(chart, value){

  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
  const maxPoints = parseInt(settings.graphPoints) || 20;

  if(chart.data.labels.length >= maxPoints){
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }

  chart.data.labels.push("");
  chart.data.datasets[0].data.push(value);

  chart.update();
  }

  /*********************************
   LOGGER ENGINE (STABLE)
  **********************************/
let logBuffer = [];

function startLogger() {

  // 🔥 STOP OLD LOGGER
  if (logTimer) {
    clearInterval(logTimer);
    logTimer = null;
  }

  if (!loggingEnabled) return;

  const settings = getSettings();

  const value = parseInt(settings.logValue) || 1;
  const unit = settings.logUnit || "sec";

  let interval = 1000;

  if (unit === "sec") interval = value * 1000;
  else if (unit === "min") interval = value * 60000;
  else if (unit === "hr") interval = value * 3600000;

  console.log("🧠 Logger Interval:", interval);

  logTimer = setInterval(() => {

    // ===== SMART LOG CONTROL 🔥
    const settings = getSettings();
    const mode = settings.systemMode || "simulation";

    // ❌ NO DATA → DON'T LOG
    if (
      (mode === "esp" && !window.espConnected) ||
      (mode === "hybrid" && (!window.analysisDataset || window.analysisDataset.length === 0))
    ) {
      return;
    }

    // ✅ ONLY VALID DATA LOG
    if(isNoData) return;
    logBuffer.push({
      timestamp: Date.now(),
      voltage,
      current,
      frequency,
      power,
      pf,
      phaseAngle,
      temperature,
      humidity,
      status: evaluateStatus()
    });

    // ===== SAVE BUFFER =====
    if (logBuffer.length >= 10) {

      let logs = JSON.parse(localStorage.getItem("micropmu_logs") || "[]");

      // ✅ merge buffer
      logs = logs.concat(logBuffer);
      logBuffer = [];

      const maxLogs = parseInt(settings.maxLogs) || 2000;

      // ✅ limit control
      if (logs.length > maxLogs) {
        logs = logs.slice(-Math.floor(maxLogs * 0.8));
      }

      // ✅ save with throttle
      if (Date.now() - (window._lastSave || 0) > 2000) {
        localStorage.setItem("micropmu_logs", JSON.stringify(logs));
        
        window._lastSave = Date.now();
      }

      // 🔥 LIVE UPDATE
      updateMemoryUsage();

      console.log("📦 Logs Saved:", logs.length);
    }

  }, interval);
}

  function showStorageWarning(){

  let popup = document.getElementById("storagePopup");

  if(!popup){

    popup = document.createElement("div");
    popup.id = "storagePopup";

    // ===== FULL SCREEN OVERLAY =====
    popup.style.position = "fixed";
    popup.style.top = "0";
    popup.style.left = "0";
    popup.style.width = "100%";
    popup.style.height = "100%";
    popup.style.background = "rgba(0,0,0,0.7)";
    popup.style.display = "flex";
    popup.style.alignItems = "center";
    popup.style.justifyContent = "center";
    popup.style.zIndex = "99999";

    // ===== INNER BOX =====
    popup.innerHTML = `
      <div style="
        background:#0f172a;
        padding:30px 40px;
        border-radius:16px;
        text-align:center;
        box-shadow:0 0 20px rgba(220,38,38,0.6);
        animation:popupScale 0.3s ease;
      ">
        <h2 style="color:#dc2626;margin-bottom:10px;">
          ⚠ STORAGE WARNING
        </h2>

        <p style="color:#e2e8f0;margin-bottom:20px;">
          System storage is getting full.<br>
          Please clear logs to prevent crash.
        </p>

        <button onclick="closeStorageWarning()" 
onmouseover="this.style.transform='scale(1.05)'; this.style.background='#16a34a'" 
onmouseout="this.style.transform='scale(1)'; this.style.background='#22c55e'" 
style="
  display:block;
  margin:20px auto 0;
  padding:10px 20px;
  background:#22c55e;
  border:none;
  border-radius:8px;
  cursor:pointer;
  font-weight:bold;
  transition: all 0.2s ease;
">
  OK
</button>
    `;

    document.body.appendChild(popup);
  }
}

function closeStorageWarning(){
  const popup = document.getElementById("storagePopup");
  if(popup) popup.remove();
}


  function loadSettings(){

  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");

  document.querySelectorAll("input, select").forEach(el => {

    if(!el.id) return;

    if(settings[el.id] !== undefined){

      if(el.type === "checkbox"){
        el.checked = settings[el.id] === "on";
      } else {
        el.value = settings[el.id];
      }

    }

  });

  console.log("✅ Settings Loaded:", settings);
}

  function saveSettings(){

  const settings = {};

  document.querySelectorAll("input, select").forEach(el => {

    if(!el.id) return;

    if(el.type === "checkbox"){
      settings[el.id] = el.checked ? "on" : "off";
    } else {
      settings[el.id] = el.value;
    }

  });

  localStorage.setItem("micropmu_settings", JSON.stringify(settings));

  console.log("✅ Settings Saved:", settings);

  // 🔥 APPLY SETTINGS IMMEDIATELY
  applyProtectionSettings();

  // 🔥 UPDATE UI
  updateSystemModeUI();

  // 🔥 RESTART SYSTEM LOOP
  if(window.startMasterLoop){
    startMasterLoop();
  }

  // 🔥 FEEDBACK
  showToast("✅ Settings Saved Successfully", 1500);
}

// ================= MASTER SYSTEM ENGINE (FINAL ULTRA CLEAN) =================
window.addEventListener("load", () => {

  // 🔥 AUTO RESTORE DATASET
const savedData = localStorage.getItem("analysisDataset");

if(savedData){
  try{
    window.analysisDataset = JSON.parse(savedData);

    if(!Array.isArray(window.analysisDataset)){
      window.analysisDataset = [];
    }

  }catch(e){
    window.analysisDataset = [];
  }
}

  // ===== GET MASTER RATE FROM SETTINGS =====
  function getMasterRate(){
    const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
    return Math.max(300, parseInt(settings.samplingRate) || 300);
  }

  // ===== START MASTER LOOP =====
  window.startMasterLoop = function startMasterLoop(){

    // 🔥 CLEAR OLD LOOP (IMPORTANT)
    if(window._mainLoop){
      clearInterval(window._mainLoop);
    }

    const rate = getMasterRate();

    window._mainLoop = setInterval(async () => {

      try{

        const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
        const mode = settings.systemMode || "simulation";

        
        // 🔥 ================= CSV LIVE FEED ENGINE (FINAL CLEAN) =================
if(mode === "hybrid"){

  const dataset = window.analysisDataset;

  // 🔥 NO DATA SAFETY
  if(!dataset?.length){
    isNoData = true;
  } else {

    isNoData = false;

    // 🔥 AUTO RESET (NEW FILE)
    if(window._lastCSVLength !== dataset.length){
      analysisIndex = 0;
      csvPlaying = true;
      window._lastCSVLength = dataset.length;
    }

    // 🔥 LOOP SAFE INDEX
    if(analysisIndex >= dataset.length){
      analysisIndex = 0;
    }

    // 🔥 SAFE READ
    const row = dataset[analysisIndex] || {};

    voltage = row.voltage ?? 230;
    

let newCurrent = row.current ?? 2;

// 🔥 smooth but follow CSV (no artificial increase)
current = current + (newCurrent - current) * 0.5;

// clean
current = parseFloat(current.toFixed(2));

    frequency = row.frequency ?? 50;
    power = row.power ?? (voltage * current * (row.pf ?? 0.9));

// 🔥 limit power (max 9999 W)
power = Math.min(power, 9999);

// clean
power = parseFloat(power.toFixed(0));
    pf = row.pf ?? 0.9;
    temperature = row.temperature ?? 30;
    humidity = row.humidity ?? 50;

    // 🔥 ENERGY CALCULATION (CSV MODE ONLY)
let now = Date.now();
let dt = (now - lastEnergyTime) / 3600000; // hours

energy += (power / 1000) * dt; // kWh

lastEnergyTime = now;


// 🔥 CSV SPEED CONTROL
if(!window._csvLastStep) window._csvLastStep = Date.now();

if(Date.now() - window._csvLastStep > 1000){  // 1 sec same as real system

  if(csvPlaying){
    analysisIndex++;
  }

  window._csvLastStep = Date.now();
}

    // 🔥 INCREMENT
    if(csvPlaying){
      analysisIndex++;
    }
  }
}


        // ================= ESP FETCH =================
        if(mode === "esp" && typeof fetchESPData === "function"){
          if(!window._lastESPFetch || Date.now() - window._lastESPFetch > 300){
            await fetchESPData();
            syncGlobalData();
            window._lastESPFetch = Date.now();
          }
        }
        else{
          window.espConnected = false;
        }

        // ================= UI UPDATE =================
        if(typeof safeUIUpdate === "function") safeUIUpdate();

        const status = evaluateStatus();

        if(typeof updateSyncStatus === "function") updateSyncStatus();
        if(typeof updateSystemModeUI === "function") updateSystemModeUI();
        if(typeof trackTimeline === "function") trackTimeline();
        if(typeof updateWiFiStatus === "function") updateWiFiStatus();
        if(typeof updateMemoryUsage === "function") updateMemoryUsage();

        // ================= DEVICE COUNT =================
        const devEl = document.getElementById("deviceCount");
        if(devEl){
          devEl.innerText = window.connectedDevices || 1;
        }

        // ================= NETWORK MODE =================
        const modeLabel = document.getElementById("modeLabel");
        if(modeLabel){
          const netMode = localStorage.getItem("networkMode") || "local";

          if (netMode === "local") modeLabel.innerText = "Admin Mode";
          else if (netMode === "mirror") modeLabel.innerText = "Sync Mode";
          else modeLabel.innerText = "Cloud Mode";
        }

      }catch(err){
        console.error("Main Loop Error:", err);
      }

    }, rate);
  }

  // ===== START =====
  startMasterLoop();

  // ===== AUTO RESTART ON SETTINGS CHANGE =====
  window.addEventListener("storage", (e) => {
    if(e.key === "micropmu_settings"){
      startMasterLoop();
    }
  });

});

// ================= PAGE VISIBILITY / FOCUS =================
window.addEventListener("focus", refreshDashboardUI);

document.addEventListener("visibilitychange", () => {

  if (!document.hidden) {

    refreshDashboardUI();

    if(typeof updateMemoryUsage === "function") updateMemoryUsage();
    if(typeof updateSystemModeUI === "function") updateSystemModeUI();
    if(typeof updateWiFiStatus === "function") updateWiFiStatus();
    if(typeof updateDashboard === "function") safeUIUpdate();

    if(typeof broadcastUpdate === "function") broadcastUpdate();

    console.log("⚡ Instant Sync Fix Applied");
  }

});


// ================= STORAGE WARNING SAFE LOOP =================
setInterval(() => {

  const warn = localStorage.getItem("storageWarning");

  if (warn === "true") {

    if(typeof showStorageWarning === "function") showStorageWarning();
    if(typeof playBuzzer === "function") playBuzzer();

    localStorage.removeItem("storageWarning");
  }

}, 1000);


// ================= CROSS TAB SYNC =================
window.addEventListener("storage", (e) => {

  if (e.key === "storageWarning" && e.newValue === "true") {
    if(typeof showStorageWarning === "function") showStorageWarning();
    if(typeof playBuzzer === "function") playBuzzer();
  }

});


// ================= REFRESH UI =================
function refreshDashboardUI(){

  if(typeof updateMemoryUsage === "function") updateMemoryUsage();
  if(typeof updateWiFiStatus === "function") updateWiFiStatus();
  if(typeof updateSystemModeUI === "function") updateSystemModeUI();
  if(typeof trackTimeline === "function") trackTimeline();

  // ===== DEVICE COUNT =====
  const devEl = document.getElementById("deviceCount");
  if(devEl && devEl.innerText != window.connectedDevices){
    devEl.innerText = window.connectedDevices || 1;
  }

  // ===== NETWORK MODE =====
  const modeLabel = document.getElementById("modeLabel");
  if(modeLabel){
    const mode = localStorage.getItem("networkMode") || "local";

    if (mode === "local") modeLabel.innerText = "Admin Mode";
    else if (mode === "mirror") modeLabel.innerText = "Sync Mode";
    else modeLabel.innerText = "Cloud Mode";
  }

  // ===== DASHBOARD =====
  if(typeof updateDashboard === "function"){
    safeUIUpdate();
  }

  console.log("⚡ UI Refreshed on Page Return");
}


// ================= INIT =================
loadSettings();
applyProtectionSettings();
applyModeFromSettings();

startSampling();
startLogger();

initDashboardCharts();
initLiveCharts();
initPerformanceCharts();

updateMemoryUsage();
if(window._memoryLoop) clearInterval(window._memoryLoop);

window._memoryLoop = setInterval(updateMemoryUsage, 2000);

startGraphEngine();


// ================= SAFE EVENT BIND =================
const el = document.getElementById("someId");
if(el){
  el.addEventListener("click", function(){
    // your code
  });
}

  /********************
   Update Timeline
  ***********************/
  function updateTimelineUI() {

    const container = document.getElementById("timelineList");
    if (!container) return;

    let timeline = JSON.parse(localStorage.getItem("micropmu_timeline") || "[]");

    container.innerHTML = "";

    timeline.slice(-50).reverse().forEach(e => {

      const row = document.createElement("div");

      row.style.padding = "4px 0";
      row.style.borderBottom = "1px solid #1e293b";

      row.innerHTML = `
      <span style="color:#94a3b8">${e.time}</span> 
      → <b>${e.type}</b> 
      → <span style="color:#38bdf8">${e.fault}</span>
    `;

      container.appendChild(row);
    });
  }


 /*********************************
             PAGE UPDATE 
  **********************************/

  // 🔥 INSTANT STORAGE CALC (NO DELAY)
function getStoragePercent(){

  const logs = JSON.parse(localStorage.getItem("micropmu_logs") || "[]");
  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");

  const maxLogs = parseInt(settings.maxLogs) || 2000;

  let percent = (logs.length / maxLogs) * 100;
  percent = Math.min(percent, 100);

  return percent;
}

  /*********************************
   MEMORY USAGE MONITOR
  **********************************/

function updateMemoryUsage() {

  // ===== SAFE ELEMENT GET =====
  const bar = document.getElementById("memoryBar");
  const text = document.getElementById("memoryText");
  const container = bar ? bar.parentElement : null;

  const exportStorage = document.getElementById("storageUsed");
  const rec = document.getElementById("reportRecords");

  // ===== SAFE DATA =====
  const logs = JSON.parse(localStorage.getItem("micropmu_logs") || "[]");


  const usedBytes = logs.length * 120;
  const maxBytes = 5 * 1024 * 1024;

  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
  const maxLogs = parseInt(settings.maxLogs) || 2000;

  let percent = (logs.length / maxLogs) * 100;
  percent = Math.min(percent, 100);

  // ===== EXPORT PAGE SAFE =====
  if(exportStorage){
    exportStorage.innerText = percent.toFixed(1) + "%";
  }

  if(rec){
    rec.innerText = logs.length;
  }

  // ===== 🔥 MOST IMPORTANT SAFE CHECK =====
  if(!bar || !text || !container){
    return;   // 🔥 EXIT → NO CRASH
  }

  // ===== RESET CLASSES =====
  text.classList.remove("storage-red", "storage-blink");

  if (percent >= 90) {
    text.classList.add("storage-red", "storage-blink");
  }
  else if (percent >= 85) {
    text.classList.add("storage-red");
  }

  // ===== UI UPDATE =====
  bar.style.width = percent + "%";
  text.innerText = percent.toFixed(1) + "% (" + logs.length + " logs)";

  // ===== COLOR LOGIC =====
  if (percent < 25) {
    bar.style.background = "#4ade80";
    container.style.border = "2px solid #4ade80";
  }
  else if (percent < 50) {
    bar.style.background = "#22c55e";
    container.style.border = "2px solid #22c55e";
  }
  else if (percent < 70) {
    bar.style.background = "#f97316";
    container.style.border = "2px solid #f97316";
  }
  else {
    bar.style.background = "#dc2626";
    container.style.border = "2px solid #dc2626";
  }

  // ===== WARNING SYSTEM =====
  if (percent >= 90 && percent < 95) {

    if (!window._memWarned) {
      localStorage.setItem("storageWarning", "true");

      if(typeof playBuzzer === "function"){
        playBuzzer();
      }

      window._memWarned = true;
    }

  }

  else if (percent >= 95 && percent < 98) {

    if (!window._memHigh) {
      localStorage.setItem("storageWarning", "true");

      if(typeof playBuzzer === "function"){
        playBuzzer();
      }

      window._memHigh = true;
    }

  }

  else if (percent >= 98) {

    if (!window._memCritical) {

      localStorage.setItem("storageWarning", "true");

      if(typeof playBuzzer === "function"){
        playBuzzer();
      }

      // 🔥 FULL RESET
      localStorage.removeItem("micropmu_logs");

      console.log("🚨 Full storage Auto reseted");

      window._memCritical = true;
    }

  }

  else {
    window._memWarned = false;
    window._memHigh = false;
    window._memCritical = false;
  }

}

document.addEventListener("DOMContentLoaded", () => {
  updateMemoryUsage();
});
  /*********************************
   ADVANCED EXPORT CSV (FIXED)
  **********************************/

function exportCSV(btn){

  const logs = arguments[0] || getFilteredData();

// ===== MODE VALIDATION =====
if(mode === "esp" && !window.espConnected){
  alert("⚠ ESP Not Connected");
  return;
}
  

if(mode === "hybrid" && (!window.analysisDataset || window.analysisDataset.length === 0)){
  alert("⚠ Upload CSV First");
  return;
}

  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
  const format = settings.exportFormat || "csv";

  try{

    // ===== BUTTON LOADING =====
    if(btn){
      btn.innerText = "⏳ Exporting...";
      btn.disabled = true;
    }

    const logs = JSON.parse(localStorage.getItem("micropmu_logs") || "[]");

    // ===== NO DATA CHECK =====
    if(logs.length === 0){
      alert("⚠ No Data Available for Export");
      if(btn){
        btn.innerText = "⬇ Export Advanced CSV";
        btn.disabled = false;
      }
      return;
    }

    // ===== FILTER INPUTS =====
    const startDate = document.getElementById("startDate")?.value;
    const endDate = document.getElementById("endDate")?.value;
    const exportMode = document.getElementById("exportMode")?.value || "full";
    const param = document.getElementById("paramSelect")?.value || "all";
    const compareA = document.getElementById("compareA")?.value || "";
    const compareB = document.getElementById("compareB")?.value || "";

    // ===== FILTER LOGS =====
    let filtered = logs.filter(l => {

      let logDate = new Date(l.timestamp);
      let keep = true;

      if(startDate){
        keep = keep && (logDate >= new Date(startDate));
      }

      if(endDate){
        let end = new Date(endDate);
        end.setHours(23,59,59,999);
        keep = keep && (logDate <= end);
      }

      if(exportMode === "fault"){
        keep = keep && (l.status !== "SYSTEM HEALTHY");
      }

      return keep;
    });

    // ===== EMPTY FILTER RESULT =====
    if(filtered.length === 0){
      alert("⚠ No Records Match Selected Filters");
      if(btn){
        btn.innerText = "⬇ Export Advanced CSV";
        btn.disabled = false;
      }
      return;
    }

    // ===== HEADER =====
let header = ["Timestamp"];

if(param === "all"){
  header.push("Voltage","Current","Frequency","Power","PF","PhaseAngle","Temperature","Status");
}else{
  header.push(param.charAt(0).toUpperCase() + param.slice(1));
}

if(compareA && compareB){
  header.push(compareA.toUpperCase() + " vs " + compareB.toUpperCase());
}

// ✅ SAFE HEADER (comma issue fix)
let csv = header.map(h => `"${h}"`).join(",") + "\n";


// ===== ROW DATA =====
filtered.forEach(l => {

  // ✅ SAFE TIMESTAMP
  let time = l.timestamp ? new Date(l.timestamp).toLocaleString() : "-";

  let row = [time];

  if(param === "all"){
    row.push(
      l.voltage ?? "-",
      l.current ?? "-",
      l.frequency ?? "-",
      l.power ?? "-",
      l.pf ?? "-",
      l.phaseAngle ?? "-",
      l.temperature ?? "-",
      l.status ?? "-"
    );
  }else{
    row.push(l[param] ?? "-");
  }

  if(compareA && compareB){
    row.push(`${l[compareA] ?? "-"} | ${l[compareB] ?? "-"}`);
  }

  // ✅ DOUBLE QUOTE PROTECTION (IMPORTANT)
  row = row.map(val => `"${String(val).replace(/"/g, '""')}"`);

  csv += row.join(",") + "\n";
});

    // ===== DOWNLOAD =====
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `MicroPMU_Report_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);

    // ===== SUCCESS =====
    setTimeout(()=>{
      alert(`✅ Export Successful!\nRecords: ${filtered.length}`);
    },300);

  }catch(e){

    console.error("Export Error:", e);
    alert("❌ Export Failed");

  }finally{

    // ===== RESET BUTTON =====
    if(btn){
      btn.innerText = "⬇ Export CSV";
      btn.disabled = false;
    }

  }
}


// ===== 🔥 LIVE PAGE DYNAMIC SAMPLING FIX =====
if(document.body.classList.contains("live-page")){

  let liveInterval;

  function startLiveSystem(){

    // old interval stop
    if(liveInterval) clearInterval(liveInterval);

    // latest settings read
    const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
    const rate = settings.samplingRate || 1000;

    // UI update
    const el = document.getElementById("perfRate");
    if(el) el.innerText = rate + " ms";

    // restart interval
    liveInterval = setInterval(runLiveSystem, rate);

    console.log("⚡ Live sampling:", rate);
  }

  // start once
  startLiveSystem();

  // 🔁 auto update when settings change
  window.addEventListener("storage", function(e){
    if(e.key === "micropmu_settings"){
      startLiveSystem();
    }
  });

}




function exportChartsPDF(){

  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
  const mode = settings.systemMode || "simulation";

  // ===== DATA CHECK =====
  const logs = JSON.parse(localStorage.getItem("micropmu_logs") || "[]");

  if(mode === "esp" && !window.espConnected){
    alert("⚠ ESP Not Connected");
    return;
  }

  if(mode === "hybrid" && (!window.analysisDataset || window.analysisDataset.length === 0)){
    alert("⚠ CSV File Not Uploaded");
    return;
  }

  if(logs.length === 0){
    alert("⚠ No Data Available");
    return;
  }

  // ===== CHART CHECK =====
  const element = document.querySelector(".charts");

  if(!element){
    alert("⚠ Charts not found");
    return;
  }

  html2pdf()
    .set({
      margin: 0,
      filename: `MicroPMU_Charts_${new Date().toISOString().slice(0,10)}.pdf`,
      html2canvas: { scale: 2 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    })
    .from(element)
    .save()
    .then(() => {
      alert("✅ Pdf Exported Successfully");
    })
    .catch(() => {
      alert("❌ PDF Export Failed");
    });
}

function exportExcel(){

  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
  const mode = settings.systemMode || "simulation";

  const logs = JSON.parse(localStorage.getItem("micropmu_logs") || "[]");

  // ===== MODE CHECK =====
  if(mode === "esp" && !window.espConnected){
    alert("⚠ ESP Not Connected");
    return;
  }

  if(mode === "hybrid" && (!window.analysisDataset || window.analysisDataset.length === 0)){
    alert("⚠ CSV File Not Uploaded");
    return;
  }

  // ===== DATA CHECK =====
  if(logs.length === 0){
    alert("⚠ No Data Available");
    return;
  }

  try{

    const worksheet = XLSX.utils.json_to_sheet(logs);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "MicroPMU Data");

    XLSX.writeFile(
      workbook,
      `MicroPMU_Report_${new Date().toISOString().slice(0,10)}.xlsx`
    );

    alert("✅ Excel Exported Successfully");

  }catch(err){

    console.error(err);
    alert("❌ Excel Export Failed");

  }
}

/********EXPORT PAGE PARAMETERS*********/

function getFilteredData(){

  let logs = getSystemData() || [];

  const start = document.getElementById("startDateTime").value;
  const end = document.getElementById("endDateTime").value;
  const mode = document.getElementById("exportMode").value;

  // ⏱️ TIME FILTER
  logs = logs.filter(l => {

    if(!l.timestamp) return true;

    let t = new Date(l.timestamp).getTime();

    if(start && t < new Date(start).getTime()) return false;
    if(end && t > new Date(end).getTime()) return false;

    return true;
  });

  // ⚠️ FAULT FILTER
  if(mode === "fault"){
    logs = logs.filter(l => l.status && l.status !== "SYSTEM HEALTHY");
  }

  return logs;
}

function applyParamFilter(logs){

  const param = document.getElementById("paramSelect").value;

  if(param === "all") return logs;

  return logs.map(l => ({
    timestamp: l.timestamp,
    value: l[param] ?? "N/A"
  }));
}

function handleExport(){

  let logs = getFilteredData();
  logs = applyParamFilter(logs);

  const format = localStorage.getItem("export_format") || "csv";

  if(format === "csv"){
    exportCSV(logs);
  }
  else if(format === "excel"){
    exportExcel(logs);
  }
  else if(format === "pdf"){
    exportFullPDF(logs);
  }
}

  /*********************************
   GPS CONNECTION 
  **********************************/
  function testGPS() {

    const enabled = document.getElementById("gpsEnable").checked;
    const lat = document.getElementById("gpsLat").value;
    const lng = document.getElementById("gpsLng").value;

    if (!enabled) {
      alert("⚠ Enable GPS first");
      return;
    }

    if (!lat || !lng) {
      alert("⚠ Enter Latitude & Longitude");
      return;
    }

    alert(`📍 GPS OK\nLat: ${lat}\nLng: ${lng}`);
  }

  /*************************************************
   REPORTS PAGE ENGINE
  *************************************************/

  if (document.getElementById("reportVoltage")) {

  // ===== CHARTS INIT =====
  const ctxV = new Chart(document.getElementById("reportVoltage"), { type:"line", data:{labels:[], datasets:[{label:"Voltage", data:[], borderColor:"#38bdf8"}]}});
  const ctxC = new Chart(document.getElementById("reportCurrent"), { type:"line", data:{labels:[], datasets:[{label:"Current", data:[], borderColor:"#22c55e"}]}});
  const ctxP = new Chart(document.getElementById("reportPower"), { type:"line", data:{labels:[], datasets:[{label:"Power", data:[], borderColor:"#f97316"}]}});
  const ctxPF = new Chart(document.getElementById("reportPF"), { type:"line", data:{labels:[], datasets:[{label:"PF", data:[], borderColor:"#a855f7"}]}});

  // NEW
  const ctxF = new Chart(document.getElementById("reportFrequency"), { type:"line", data:{labels:[], datasets:[{label:"Frequency", data:[], borderColor:"#06b6d4"}]}});
  const ctxT = new Chart(document.getElementById("reportTemperature"), { type:"line", data:{labels:[], datasets:[{label:"Temperature", data:[], borderColor:"#ef4444"}]}});
  const ctxE = new Chart(document.getElementById("reportEnergy"), { type:"line", data:{labels:[], datasets:[{label:"Energy", data:[], borderColor:"#eab308"}]}});
  const ctxPH = new Chart(document.getElementById("reportPhase"), { type:"line", data:{labels:[], datasets:[{label:"Phase", data:[], borderColor:"#10b981"}]}});

  const allCharts = [ctxV, ctxC, ctxP, ctxPF, ctxF, ctxT, ctxE, ctxPH];

  // =================================================
  // 🔥 MAIN FUNCTION
  // =================================================
  function loadReportData(range){

    const logs = JSON.parse(localStorage.getItem("micropmu_logs") || "[]");
    const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");

    // ESP CHECK
    if(settings.systemMode === "esp" && !window.espConnected){
      alert("⚠ ESP Not Connected");
      return;
    }

    // CSV CHECK
    if(settings.systemMode === "hybrid" && (!window.analysisDataset || window.analysisDataset.length === 0)){
      alert("⚠ Upload CSV file first");
      return;
    }

   if(logs.length === 0){

  const mode = settings.systemMode || "simulation";

  if(mode === "esp"){
    alert("⚠ ESP Data Not Available");
  }
  else if(mode === "hybrid"){
    alert("⚠ Upload CSV first");
  }
  else{
    alert("⚠ No Logs Yet (Simulation Running)");
  }

  return;
}

    const now = new Date();
    let startTime = new Date();

    if(range === "Hourly") startTime.setHours(now.getHours() - 1);
    else if(range === "Daily") startTime.setDate(now.getDate() - 1);
    else if(range === "Weekly") startTime.setDate(now.getDate() - 7);
    else if(range === "Monthly") startTime.setMonth(now.getMonth() - 1);
const filtered = logs.filter(log => {
  const t = new Date(log.timestamp);
  return t >= startTime && t <= now;
});

// 🔥 DEBUG (CORRECT PLACE)
console.log("Filtered Data:", filtered.length, "Range:", range);

if(filtered.length === 0){
  alert("No Data in selected range");
  return;
}

// CLEAR
// 🔥 PROPER RESET (IMPORTANT FIX)
allCharts.forEach(c=>{
  c.data.labels = [];
  c.data.datasets.forEach(ds => ds.data = []);
  c.update();
});

let energyCalc = 0;

// FILL DATA
filtered.forEach(log => {

  let time;

  if(range === "Hourly"){
    time = new Date(log.timestamp).toLocaleTimeString();
  }
  else if(range === "Daily"){
    time = new Date(log.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  }
  else if(range === "Weekly" || range === "Monthly"){
    time = new Date(log.timestamp).toLocaleDateString();
  }

  ctxV.data.labels.push(time);
  ctxV.data.datasets[0].data.push(log.voltage || 0);

  ctxC.data.labels.push(time);
  ctxC.data.datasets[0].data.push(log.current || 0);

  ctxP.data.labels.push(time);
  ctxP.data.datasets[0].data.push(log.power || 0);

  ctxPF.data.labels.push(time);
  ctxPF.data.datasets[0].data.push(log.pf || 0);

  ctxF.data.labels.push(time);
  ctxF.data.datasets[0].data.push(log.frequency || 0);

  ctxT.data.labels.push(time);
  ctxT.data.datasets[0].data.push(log.temperature || 0);

  energyCalc += (log.power || 0) / 3600;
  ctxE.data.labels.push(time);
  ctxE.data.datasets[0].data.push(energyCalc);

  ctxPH.data.labels.push(time);
  ctxPH.data.datasets[0].data.push(log.phaseAngle || 0);
});

// UPDATE
allCharts.forEach(c => c.update());

// 🔥 HEADER UPDATE
updateReportHeader(range, filtered.length);

// TITLES
document.getElementById("reportVoltageTitle").innerText = "Voltage ("+range+")";
document.getElementById("reportCurrentTitle").innerText = "Current ("+range+")";
document.getElementById("reportPowerTitle").innerText = "Power ("+range+")";
document.getElementById("reportPFTitle").innerText = "PF ("+range+")";

document.getElementById("reportFrequencyTitle").innerText = "Frequency ("+range+")";
document.getElementById("reportTemperatureTitle").innerText = "Temperature ("+range+")";
document.getElementById("reportEnergyTitle").innerText = "Energy ("+range+")";
document.getElementById("reportPhaseTitle").innerText = "Phase Angle ("+range+")";

}

// =================================================
// 🔥 BUTTONS FIX (MAIN ISSUE)
// =================================================
window.showHourly = function(){ setLoading("Hourly"); };
window.showDaily = function(){ setLoading("Daily"); };
window.showWeekly = function(){ setLoading("Weekly"); };
window.showMonthly = function(){ setLoading("Monthly"); };

function setLoading(type){

  document.querySelectorAll("[id$='Title']").forEach(el=>{
    el.innerText = "Loading " + type + "...";
  });

  // ✅ ONLY CALL FUNCTION (NO filtered HERE)
  setTimeout(()=>loadReportData(type), 300);
}
  // =================================================
  // 🔥 RESET
  // =================================================
  window.resetReports = function(){

    allCharts.forEach(c=>{
      c.data.labels = [];
      c.data.datasets[0].data = [];
      c.update();
    });

    document.querySelectorAll("[id$='Title']").forEach(el=>{
      el.innerText = el.innerText.replace(/\(.*\)/,"").trim();
    });

    alert("✅ Reports Reset Successfully");
  };

  // RESIZE FIX
  window.addEventListener("resize", ()=>{
    allCharts.forEach(c=>c.resize());

    
  });

}
  /*********************************
   ESP LIVE MODE + WIFI ENGINE
  **********************************/

  let espConnected = false;
  let espLatency = 0;
  let espFailCount = 0;

  /* ================= FETCH ESP DATA ================= */

  /*********************************
   ULTRA FAST FIREBASE SYNC (100ms)
  **********************************/
let firebaseListenerStarted = false;
let lastUIUpdate = 0; // 🔥 throttle control

function startFirebaseSync() {

  if (firebaseListenerStarted) return;

  try {

    const db = firebase.database();
    const ref = db.ref("micropmu/live");

    ref.on("value", (snapshot) => {

      const data = snapshot.val();
      if (!data) return;

      const start = performance.now();

      // ===== SAFE PARSING =====
      let newV = parseFloat(data.voltage) || 0;
      let newI = parseFloat(data.current) || 0;
      let newF = parseFloat(data.frequency) || 50;
      let newPF = parseFloat(data.pf) || 0.96;
      let newTemp = parseFloat(data.temperature) || 0;
      let newH = parseFloat(data.humidity) || 50;

      humidity = newH;

      // ===== SMOOTH FILTER =====
      const alpha = 0.4;

      voltage = voltage * (1 - alpha) + newV * alpha;
      current = current * (1 - alpha) + newI * alpha;

      frequency = newF;
      pf = Math.min(Math.max(newPF, 0.01), 1);
      temperature = newTemp;

      // ===== POWER =====
      power = parseFloat((voltage * current * pf).toFixed(2));

      // ===== REACTIVE POWER (NEW 🔥) =====
      let apparentPower = voltage * current;
      let reactivePower = apparentPower * Math.sin(Math.acos(pf));

      // ===== ENERGY =====
      
      let now = Date.now();
      let hours = (now - lastEnergyTime) / 3600000;

      energy = parseFloat((energy + (power / 1000) * hours).toFixed(4));
      lastEnergyTime = now;

      // ===== PHASE ANGLE =====
      phaseAngle = parseFloat((Math.acos(pf) * 180 / Math.PI).toFixed(1));

      espConnected = true;

      const end = performance.now();
      espLatency = Math.round(end - start);

      // ===== 🔥 UI THROTTLE (VERY IMPORTANT) =====
      if (Date.now() - lastUIUpdate < 200) return;
      lastUIUpdate = Date.now();

      requestAnimationFrame(() => {
        safeUIUpdate();
        updateWiFiStatus();
        updateSyncStatus();
      });

    });

    firebaseListenerStarted = true;

    console.log("🔥 Firebase Ultra Sync Started");

  } catch (e) {
    console.error("Firebase Sync Error:", e);
  }
}

 /*********************************
 WIFI STATUS ENGINE (PRO FINAL)
*********************************/
function updateWiFiStatus(){

  const led = document.getElementById("wifiLed");
  const bars = document.querySelectorAll("#signalBars .bar");
  const latencyText = document.getElementById("wifiLatency");
  const statusText = document.getElementById("wifiStatusText");

  if (!led || !latencyText) return;

  // ===== RESET =====
  bars.forEach(b => {
    b.style.background = "#1e293b";
    b.classList.remove("blink");
  });

  led.classList.remove("blink");

  // ===== DISCONNECTED =====
  if(!window.espConnected){

    led.style.background = "#ef4444";
    latencyText.innerText = "--";

    led.classList.add("blink");

    if(statusText) statusText.innerText = "Disconnected";

    return;
  }

  const latency = (typeof espLatency === "number") ? espLatency : 0;
  latencyText.innerText = latency + " ms";

  // ===== STRONG =====
  if(latency <= 50){
    led.style.background = "#22c55e";
    bars.forEach(b => b.style.background = "#22c55e");

    if(statusText) statusText.innerText = "Connected";
  }

  // ===== MEDIUM =====
  else if(latency <= 100){
    led.style.background = "#facc15";

    bars[0].style.background = "#facc15";
    bars[1].style.background = "#facc15";
    bars[2].style.background = "#facc15";

    if(statusText) statusText.innerText = "Stable";
  }

  // ===== WEAK =====
  else if(latency <= 180){
    led.style.background = "#f97316";

    bars[0].style.background = "#f97316";
    bars[0].classList.add("blink");

    if(statusText) statusText.innerText = "Weak";
  }

  // ===== CRITICAL =====
  else{
    led.style.background = "#ef4444";

    bars[0].style.background = "#ef4444";
    bars[0].classList.add("blink");

    if(statusText) statusText.innerText = "Unstable";
  }
}
 /*********************************
   SYNC STATUS ENGINE (FINAL PRO)
*********************************/

// ===== MAIN LOGIC FUNCTION =====
function getSyncStatus(){

  const mode = getSystemMode();

  // ===== SIMULATION =====
  if(mode === "simulation"){
    return { text: "🟢 Active", color: "#22c55e" };
  }

  // ===== ESP MODE =====
  if(mode === "esp"){
    if(window.espConnected && !isNoData){
      return { text: "🟢 Active", color: "#22c55e" };
    }else{
      return { text: "🔴 No Data", color: "#ef4444" };
    }
  }

  // ===== CSV MODE =====
  if(mode === "hybrid"){
    if(window.analysisDataset && window.analysisDataset.length > 0){
      return { text: "🟢 Active", color: "#22c55e" };
    }else{
      return { text: "🔴 No Data", color: "#ef4444" };
    }
  }

  return { text: "--", color: "#94a3b8" };
}

// ===== UI UPDATE FUNCTION (FINAL CLEAN PRO) =====
function updateSyncStatus(){

  const el = document.getElementById("syncStatus");
  if (!el) return;

  // ===== GET MODE =====
  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
  const mode = settings.systemMode || "simulation";

  let text = "● Initializing...";
let stateClass = "sync-loading";

  // ===== SIMULATION =====
  if(mode === "simulation"){
    text = "● Active";
    stateClass = "sync-active";
  }

  // ===== ESP =====
  else if(mode === "esp"){
    if(window.espConnected && !isNoData){
      text = "● Active";
      stateClass = "sync-active";
    }else{
      text = "● No Data";
      stateClass = "sync-error";
    }
  }

  // ===== CSV =====
  else if(mode === "hybrid"){
    if(window.analysisDataset && window.analysisDataset.length > 0){
      text = "● Active";
      stateClass = "sync-active";
    }else{
      text = "● No Data";
      stateClass = "sync-error";
    }
  }

  // ===== APPLY TEXT =====
el.innerText = text;

// 🔥 REMOVE INLINE STYLE (important fix)
el.style.color = "";

// ===== REMOVE OLD CLASSES (FIXED) =====
el.classList.remove("sync-active","sync-error","sync-idle","sync-loading","blink");

// ===== APPLY NEW CLASS =====
el.classList.add(stateClass);

// ===== BLINK FOR NO DATA =====
if(stateClass === "sync-error"){
  el.classList.add("blink");
}
}

// ===== INITIAL LOAD FIX =====
document.addEventListener("DOMContentLoaded", () => {

  updateSyncStatus();
  loadSettings();  
});

/*/* ===== Test ESP Connection ====
function testESPConnection() {
  alert("ESP Connection Test Triggered");
}


/* ===== MODEL BUZZER CONTROL ===== */
function toggleModelBuzzer() {

  const settings = getSettings();
  const mode = settings.modelBuzzerMode || "auto";

  if (mode === "off") {
    alert("Model buzzer disabled");
    return;
  }

  if (mode === "auto") {
    alert("Auto mode active (triggered on faults)");
    return;
  }

  if(!settings.deviceIP){
  console.warn("⚠️ No IP set");
  return;
}

const ip = settings.deviceIP || "192.168.174.94";

  fetch(`http://${ip}/buzzer`)
    .then(() => alert("Model buzzer toggled"))
    .catch(() => alert("ESP not reachable"));
}

  /* ================= SIGNAL BARS ================= */

  function activateBars(count) {

    const bars = document.querySelectorAll("#signalBars .bar");

    bars.forEach(bar => bar.classList.remove("active"));

    for (let i = 0; i < count; i++) {
      if (bars[i]) bars[i].classList.add("active");
    }
  }

  /* ================= MODE SWITCHING ================= */

  function applyModeFromSettings() {

    const settings = getSettings();
    systemMode = settings.systemMode || "simulation";

    if (document.getElementById("liveMode")) {
      document.getElementById("liveMode").innerText =
        systemMode === "esp" ? "ESP Mode" : "Simulation";
    }
  }


  // ================= SAFE MODE SWITCH WRAPPER =================

  /*********************************
   PART 5 - SAFE CLOUD + QR MODULE
  **********************************/

  /* ====== SAFE CHECK ====== */
  const FIREBASE_ENABLED = true;
  // 🔥 Change to false to off the cloud monitoring

  let dbRef = null;

  /* ================= LOAD FIREBASE SAFELY ================= */

 function detectModeFromURL(){

  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");

  if(mode === "mirror" || mode === "remote"){
    localStorage.setItem("networkMode", mode);
  }

}


  function loadFirebaseSafe() {

    if (!FIREBASE_ENABLED) return;

    try {

      const firebaseConfig = {
        apiKey: "AIzaSyDWZtD5qgRN4o6txwel_nL5H3UHEZu0PNo",
        authDomain: "micro-pmu-dashboard.firebaseapp.com",
        databaseURL: "https://micro-pmu-dashboard-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "micro-pmu-dashboard",
        storageBucket: "micro-pmu-dashboard.firebasestorage.app",
        messagingSenderId: "492620490407",
        appId: "1:492620490407:web:82945fb280818e888a5d82"
      };
      const script1 = document.createElement("script");
      script1.src = "https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js";

      const script2 = document.createElement("script");
      script2.src = "https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js";

      script1.onload = () => {
        script2.onload = () => {
          firebase.initializeApp(firebaseConfig);
          
        };
        document.head.appendChild(script2);
      };

      document.head.appendChild(script1);

    } catch (e) {
      console.warn("Firebase load skipped.");
    }
  }

  /* ================= CLOUD SYNC ================= */

  function initCloudSync() {

    try {

      const db = firebase.database();
      dbRef = db.ref("micropmu/live");

      setInterval(() => {

        dbRef.set({
          voltage,
          current,
          frequency,
          power,
          pf,
          phaseAngle,
          temperature,
          humidity,
          status: evaluateStatus(),
          timestamp: Date.now()
        });

      }, parseInt(getSettings().samplingRate) || 2000);

      dbRef.on("value", (snapshot) => {

        const data = snapshot.val();
        if (!data) return;

        voltage = data.voltage;
        current = data.current;
        frequency = data.frequency;
        power = data.power;
        pf = data.pf;
        phaseAngle = data.phaseAngle;
        temperature = data.temperature;

        safeUIUpdate();
        updateSyncStatus();

      });

    } catch (e) {
      console.warn("Cloud sync failed safely.");
    }
  }

  // ===== DEVICE HEARTBEAT =====
  if (typeof firebase !== "undefined") {

    const deviceRef = firebase.database().ref("micropmu/devices/" + deviceId);

    setInterval(() => {
      deviceRef.set({
        lastSeen: Date.now()
      });
    }, 2000);

    firebase.database().ref("micropmu/devices").on("value", (snap) => {

      const devices = snap.val() || {};
      const now = Date.now();

      let active = 0;

      Object.values(devices).forEach(d => {
        if (now - d.lastSeen < 5000) {
          active++;
        }
      });

      connectedDevices = active;

      if (document.getElementById("deviceCount")) {
        document.getElementById("deviceCount").innerText = active;
      }

    });

    window.addEventListener("beforeunload", () => {
      firebase.database().ref("micropmu/devices/" + deviceId).remove();
    });

  }
  /* =====================================
     DASHBOARD ACCESS CONTROL (FINAL CLEAN)
  ===================================== */

  /* =====================================
     QR GENERATOR (OPTIMIZED + SAFE)
  ===================================== */

  function loadQRSafe() {

    const qrContainer = document.getElementById("qrCode");
    const linkBox = document.getElementById("shareLink");

    if (!qrContainer || !linkBox) return;

    try {

      const currentURL = getSmartLink();
      linkBox.value = getSmartLink();

      // Clear old QR (important)
      qrContainer.innerHTML = "";

      // Check if QR library already loaded
      if (typeof QRCode !== "undefined") {

        new QRCode(qrContainer, {
          text: currentURL,
          width: 180,
          height: 180
        });
        return;

      }

      // Load script only once
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";

      script.onload = () => {
        try {
          new QRCode(qrContainer, {
            text: currentURL,
            width: 180,
            height: 180
          });
        } catch (e) {
          console.warn("QR generation failed.");
        }
      };

      document.head.appendChild(script);

    } catch (e) {
      console.warn("QR module safe skip.");
    }
  }
  /* ================= INIT SAFE  MERGED ADDEVENTLISTNER================= */
window.isAdminDevice = false;

  function checkDashboardAccess() {

    const mode = localStorage.getItem("networkMode") || "local";

    // ===== ADMIN MODE =====
    if (mode === "local") {
      return true;
    }

    // ===== SYNC MODE =====
    if (mode === "mirror") {

      if (sessionStorage.getItem("syncVerified") === "true") {
        return true;
      }

      showAccessPopup("mirror");
      return false;
    }

    // ===== CLOUD MODE =====
    if (mode === "remote") {

      if (sessionStorage.getItem("cloudVerified") === "true") {
        return true;
      }

      showAccessPopup("remote");
      return false;
    }

    return true;
  }

  /*************************************************
   FINAL GLOBAL SETTINGS BUTTONS FIX
  *************************************************/

  (function () {

    // Prevent duplicate loading
    if (window.__settingsButtonsLoaded) return;
    window.__settingsButtonsLoaded = true;

    /* ================= VERIFY ================= */

    window.verifyAdmin = function () {

      const input = document.getElementById("adminPass");
      if (!input) return;

     if (md5(input.value) === "75cc9bf4f32d25d2be34c46fc308fc6a") {
        sessionStorage.setItem("adminVerified", "true");
        alert("✅Admin Verified Successfully");
        input.value = "";
      } else {
        alert("⚠️Wrong Password");
      }
    };

    /* ================= RESET ENERGY ================= */
window.toggleStorage = function () {

  // 🔐 ADMIN CHECK
  if (sessionStorage.getItem("adminVerified") !== "true") {
    alert("⚠ Verify Admin First");
    return;
  }

  const btn = document.getElementById("storageToggleBtn");

  loggingEnabled = !loggingEnabled;

  // ================= DISABLE =================
  if (!loggingEnabled) {

    if (logTimer) {
      clearInterval(logTimer);
      logTimer = null;
    }

    if (btn) {
      btn.innerText = "Enable Logging";
      btn.style.background = "#3faf68"; // 🟢 green
    }

    alert("⛔ Storage Logging Disabled");
  } 
  
  // ================= ENABLE =================
  else {

    startLogger();

    if (btn) {
      btn.innerText = "Disable Logging";
      btn.style.background = "#b93c3c"; // 🔴 red
    }

    alert("✅ Storage Logging Enabled");
  }

}; // 

/* ================= CLEAR LOGS ================= */

window.secureClearLogs = function () {

  if (sessionStorage.getItem("adminVerified") !== "true") {
    alert("⚠ Verify Admin First");
    return;
  }

  localStorage.removeItem("micropmu_logs");
  alert("✅Logs Cleared");
};

/* ================= TEST BUZZER ================= */

window.testBuzzer = function () {

  if (typeof buzzer !== "undefined") {
    buzzer.play().then(() => {
      setTimeout(() => buzzer.pause(), 1500);
    }).catch(() => { });
  } else {
    alert("Buzzer not initialized");
  }
};

/*********************************
 SMART LINK GENERATOR (FINAL REAL FIX)
*********************************/

function getSmartLink(){

  // 🔥 DIRECT dropdown se read (NOT localStorage)
  const mode = document.getElementById("networkMode")?.value || "local";
  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");

  // ❌ ADMIN MODE BLOCK
  if(mode === "local"){
    return null;
  }

  // 🌐 CLOUD MODE
  if(mode === "remote"){
    return "https://intelligrid-platform.netlify.app?mode=remote";
  }

  // 🔁 MIRROR MODE
  if(mode === "mirror"){
    const ip = document.getElementById("deviceIP")?.value || "192.168.4.1";
    return "http://" + ip + "?mode=mirror";
  }

  return null;
}

/*********************************
 GENERATE LINK
*********************************/
window.generateLink = function(){

  const linkBox = document.getElementById("shareLink");
  if(!linkBox){
    alert("❌ Link box not found");
    return;
  }

  const link = getSmartLink();

  if(!link){
    alert("❌ Link Not Available for Admin Mode");
    linkBox.value = "";
    return;
  }

  linkBox.value = link;

  alert("✅ Link Generated Successfully");
};

/*********************************
 GENERATE QR
*********************************/
window.generateQR = function(){

  const qrContainer = document.getElementById("qrCode");
  const linkBox = document.getElementById("shareLink");

  if(!qrContainer) return;

  const link = getSmartLink();

  if(!link){
    alert("❌ QR Not Available for Admin Mode");
    return;
  }

  qrContainer.innerHTML = "";

  if(linkBox){
    linkBox.value = link;
  }

  if(typeof QRCode !== "undefined"){
    new QRCode(qrContainer, {
      text: link,
      width: 180,
      height: 180
    });

    alert("✅ QR Generated Successfully");
    return;
  }

  const script = document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";

  script.onload = function(){
    new QRCode(qrContainer, {
      text: link,
      width: 180,
      height: 180
    });
     positionQR(); 
    alert("✅ QR Generated Successfully");
  };

  document.head.appendChild(script);
};
  })();


  faultHoldTime = Math.floor(Math.random() * 4900) + 100;





function positionQR(){
  const btn = document.getElementById("genBtn");
  const qr = document.getElementById("qrCode");

  if(!btn || !qr) return;

  const rect = btn.getBoundingClientRect();

  qr.style.top = window.scrollY + rect.top + "px";
  qr.style.left = window.scrollX + rect.right + 20 + "px";
}

// run always
window.addEventListener("load", positionQR);
window.addEventListener("resize", positionQR);
window.addEventListener("scroll", positionQR);


/*========DASHBORDS VALUES CONTROL===========*
=============================================*/
function updateSystem() {

  const settings = getSettings();
  const mode = settings.systemMode || "simulation";

  // ================= ZERO MODE CONTROL 🔥 =================

  // ❌ ESP NOT CONNECTED
  if (mode === "esp" && !window.espConnected) {

    voltage = 0;
    current = 0;
    frequency = 0;
    power = 0;
    pf = 0;
    temperature = 0;
    humidity = 0;
    phaseAngle = 0;

    updateDashboard("NO DATA");
    return;
  }

  // ❌ CSV NOT LOADED
  if (mode === "hybrid" && (!window.analysisDataset || window.analysisDataset.length === 0)) {

    voltage = 0;
    current = 0;
    frequency = 0;
    power = 0;
    pf = 0;
    temperature = 0;
    humidity = 0;
    phaseAngle = 0;

    updateDashboard("NO DATA");
    return;
  }

  // ===== ESP MODE =====
  if (mode === "esp") {
    if (!firebaseListenerStarted) {
      safeUIUpdate();
    }
    safeUIUpdate();
    return;
  }

  // ===== HYBRID MODE =====
  if (mode === "hybrid") {

    const d = window.analysisDataset[analysisIndex];

    voltage = d.voltage || 0;
    current = d.current || 0;
    frequency = d.frequency || 50;
    pf = d.pf || 0.95;
    power = d.power || 0;

    temperature = d.temperature || 0;
    humidity = d.humidity || 0;
    pf = Math.min(Math.max(pf, 0.01), 1);
    phaseAngle = parseFloat((Math.acos(pf) * 180 / Math.PI).toFixed(1));

    analysisIndex++;
    if (analysisIndex >= window.analysisDataset.length) analysisIndex = 0;

    safeUIUpdate();
    return;
  }

  // ================= SIMULATION =================
  const now = Date.now();

  // ===== INIT =====
  if (faultStart === null) {
    faultStart = now;
    activeFaultType = "NORMAL";
    faultHoldTime = Math.floor(Math.random() * 3000) + 2000;
    return;
  }

let elapsed = now - faultStart;

// ===== CONTINUE SAME STATE =====
if (elapsed < faultHoldTime) {
  applyFault(activeFaultType);
  applySystemPhysics();
}
else {

  // ===== NEW STATE START =====
  faultStart = now;

  const event = Math.floor(Math.random() * 100) + 1;

  // ===== BASE SYSTEM =====
  let baseVoltage = random(225, 235);
  let basePF = parseFloat((0.94 + Math.random() * 0.04).toFixed(2));
  let baseFreq = parseFloat((50 + (Math.random() - 0.5) * 0.02).toFixed(2));
  let loadKW = parseFloat((Math.random() * 2 + 1).toFixed(2));

  voltage = baseVoltage;
  pf = basePF;
  frequency = baseFreq;

  // ===== CURRENT =====
  let targetCurrent = (loadKW * 1000) / (voltage * pf);
  current = current * 0.85 + targetCurrent * 0.15;
  if (current < 0.05) current = 0;

  // ===== TEMPERATURE =====
  let ambient = 28;
  let heating = current * 1.5;
  let targetTemp = ambient + heating;
  temperature = temperature * 0.95 + targetTemp * 0.05;
  temperature = Math.max(28, Math.min(temperature, 60));

  // ===== NORMAL / FAULT =====
  if (event <= 45) {

    activeFaultType = "NORMAL";
    faultHoldTime = Math.floor(Math.random() * 3000) + 2000;

  }
  else {

    faultHoldTime = Math.floor(Math.random() * 2500) + 500;

    if (event <= 55) activeFaultType = "LOW VOLTAGE";
    else if (event <= 63) activeFaultType = "OVER VOLTAGE";
    else if (event <= 71) activeFaultType = "HIGH CURRENT";
    else if (event <= 78) activeFaultType = "OVERLOAD";
    else if (event <= 85) activeFaultType = "LOW POWER FACTOR";
    else if (event <= 90) activeFaultType = "UNDER FREQUENCY";
    else if (event <= 95) activeFaultType = "OVER FREQUENCY";
    else activeFaultType = "SHORT CIRCUIT";

    if (activeFaultType === "SHORT CIRCUIT") {
      forceNormalAfterFault = true;
    }
  }
}

// ===== LIMITS =====
pf = Math.min(Math.max(pf, 0), 1);

// ===== FINAL CALC =====
power = parseFloat((voltage * current * pf).toFixed(1));
phaseAngle = parseFloat((Math.acos(pf) * 180 / Math.PI).toFixed(1));

// ===== ENERGY CALC (🔥 CORRECT PLACE)
let hours = (now - lastEnergyTime) / 3600000;

if (power > 0) {
  energy += (power / 1000) * hours;
}

energy = parseFloat(energy.toFixed(4));
lastEnergyTime = now;

// ===== SENSOR NOISE =====
function noise(val) {
  return val + (Math.random() - 0.5) * 0.5;
}

voltage = parseFloat(noise(voltage).toFixed(2));
current = parseFloat(noise(current).toFixed(2));

console.log("Humidity Live:", humidity);
console.log("Temp:", temperature);
console.log("Fault:", activeFaultType);

// ===== UPDATE UI
if(typeof syncGlobalData === "function"){
  syncGlobalData();
}
safeUIUpdate();
broadcastUpdate();


// ===== STATUS TRACK =====
const currentStatus = evaluateStatus();

if (currentStatus !== "SYSTEM HEALTHY") {
  if (!faultStartTime) faultStartTime = new Date();
} else {
  setTimeout(() => {
    if (evaluateStatus() === "SYSTEM HEALTHY") {
      faultStartTime = null;
    }
  }, 200);
}
}



  // ==============================================
  // GLOBAL SAVE SETTINGS (CLEAN VERSION)
  // ==============================================
  window.saveSettings = function () {

    try {

      if (sessionStorage.getItem("adminVerified") !== "true") {
        alert("⚠ Verify Admin First");
        return;
      }

      const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : null;
      };

      const processingMode = document.getElementById("processingMode")?.value;

      if (processingMode === "analysis") {

        const fileInput = document.getElementById("analysisFile");

        if (!fileInput || fileInput.files.length === 0) {
          alert("⚠ Please upload CSV dataset first for Analysis Mode.");
          return;
        }

        loadAnalysisDataset();
      }

      const settings = {

        systemMode: getVal("systemMode"),
        analysisWindow: getVal("analysisWindow"),
        processingMode: getVal("processingMode"),
        connectionMode: getVal("connectionMode"),
        deviceIP: getVal("deviceIP"),
        espTimeout: getVal("espTimeout"),
        autoReconnect: getVal("autoReconnect"),
        scanInterval: getVal("scanInterval"),
        networkMode: document.getElementById("networkMode")?.value || "local",
        dashBuzzerMode: getVal("dashBuzzerMode"),
        modelBuzzerMode: getVal("modelBuzzerMode"),
        alarmSensitivity: getVal("alarmSensitivity"),

        tariff: getVal("tariff"),
        fixedCharge: getVal("fixedCharge"),

        graphPoints: getVal("graphPoints"),

        vmin: getVal("vmin"),
        vmax: getVal("vmax"),

        fmin: getVal("fmin"),
        fmax: getVal("fmax"),

        overloadLimit: getVal("overloadLimit"),
        shortLimit: getVal("shortLimit"),
        pfMin: getVal("pfMin"),
        tempMax: getVal("tempMax"),

        samplingRate: getVal("samplingRate"),
        autoRefresh: getVal("autoRefresh"),

       logValue: getVal("logValue"),
       logUnit: getVal("logUnit"),

       exportFormat: getVal("exportFormat")

      };

      localStorage.setItem("micropmu_settings", JSON.stringify(settings));
      localStorage.setItem("networkMode", settings.networkMode);
      console.log("Saved Mode:", settings.networkMode);

      if (typeof applyProtectionSettings === "function") applyProtectionSettings();
      if (typeof applyModeFromSettings === "function") applyModeFromSettings();
      if (typeof updateSystemModeUI === "function") updateSystemModeUI();

      if (typeof startSampling === "function") startSampling();
      if (typeof startLogger === "function") startLogger();
      if (typeof startGraphEngine === "function") startGraphEngine();

      // ✅ SAFE ACCESS APPLY
      const mode = settings.networkMode;
      if (mode !== "local") {
        if (typeof checkDashboardAccess === "function") checkDashboardAccess();
      }

      if (typeof updateDashboard === "function") safeUIUpdate();
      

     // 🔥 FINAL ENGINE RESTART (CLEAN VERSION)

        applyProtectionSettings();
        applyModeFromSettings();
        updateSystemModeUI();

        startSampling();     // sampling restart
        startLogger();       // logging restart
        startGraphEngine();  // graph restart

        applySystemPhysics(); // optional but good sync
        safeUIUpdate();      // UI refresh

        console.log("⚙️ Settings Applied");
        alert("✅ Settings Saved Successfully");
       } catch (e) {

      console.error("Settings Error:", e);
      alert("❌ Error Saving Settings");

    }

  };

function syncSystemMode(){
  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
  systemMode = settings.systemMode || "simulation";
}

//***************BILL CALCULATION ****************************//
// ================= GLOBAL =================
let editing = false;

// ================= SLAB EDIT =================
function toggleEdit(){

  const container = document.getElementById("slabsContainer");
  const btn = document.getElementById("editBtn");
  const rows = container.querySelectorAll(".slab");

  editing = !editing;

  rows.forEach(row => {

    if(editing){

      const unit = row.querySelector(".unit-text");
      const rate = row.querySelector(".rate-text");

      // 🔥 TEXT BASED PARSE (dataset pe depend nahi)
      let text = unit.innerText.replace("∞","Infinity");
      let parts = text.split("-");

      let min = parts[0]?.trim() || 0;
      let max = parts[1]?.trim() || "Infinity";

      // 🔥 REMOVE ₹ AND /unit
      let rateVal = rate.innerText
        .replace("₹","")
        .replace("/unit","")
        .trim();

      row.innerHTML = `
        <input class="edit-min" value="${min}" style="width:60px">
        <span>-</span>
        <input class="edit-max" value="${max}" style="width:60px">
        <input class="edit-rate" value="${rateVal}" style="width:80px">
      `;

    } else {

      const min = parseFloat(row.querySelector(".edit-min").value);
      let maxVal = row.querySelector(".edit-max").value;

      const max = (maxVal === "Infinity") ? "Infinity" : parseFloat(maxVal);
      const rate = parseFloat(row.querySelector(".edit-rate").value);

      // 🔥 NaN PROTECTION
      if(isNaN(min) || isNaN(rate)){
        alert("Invalid slab values");
        return;
      }

      row.innerHTML = `
        <span class="unit-text" data-min="${min}" data-max="${max}">
          ${min} - ${max === "Infinity" ? "∞" : max}
        </span>
        <span class="rate-text">
          ₹${rate} <span class="unit-tag">/unit</span>
        </span>
      `;
    }

  });

  // 🔥 BUTTON SWITCH
  if(editing){
    btn.innerHTML = `<i class="fas fa-save"></i> Save slabs`;
    btn.style.background = "#22c55e";
  } else {
    btn.innerHTML = `<i class="fas fa-pen"></i> Edit slabs`;
    btn.style.background = "#facc15";
  }
}
function getSlabs(){

  const slabs = [];

  document.querySelectorAll("#slabsContainer .slab").forEach(row => {

    const unit = row.querySelector(".unit-text");
    const rate = row.querySelector(".rate-text");

    if(!unit || !rate) return;

    let min = Number(unit.dataset.min);
    let max = unit.dataset.max === "Infinity"
      ? Infinity
      : Number(unit.dataset.max);

    let rateVal = parseFloat(rate.innerText.replace("₹",""));

    // 🔥 SAFETY CHECK
    if(isNaN(min)) min = 0;
    if(isNaN(max)) max = Infinity;
    if(isNaN(rateVal)) rateVal = 0;

    slabs.push({min, max, rate: rateVal});
  });

  // 🔥 SORT (VERY IMPORTANT)
  slabs.sort((a,b)=>a.min - b.min);

  return slabs;
}

function calculateSlab(units, slabs){

  let total = 0;
  let breakdown = [];
  let remaining = units;

  slabs.forEach((slab, index) => {

    if(remaining <= 0) return;

    let min = slab.min;
    let max = slab.max;

    let slabUnits = 0;

    // 🔥 CORE LOGIC (PERFECT)
    if(units > min){

      let upperLimit = (max === Infinity) ? units : Math.min(units, max);

      slabUnits = upperLimit - min;
    }

    // 🔥 FIX NEGATIVE + LIMIT
    slabUnits = Math.max(0, slabUnits);
    slabUnits = Math.min(slabUnits, remaining);

    let cost = slabUnits * slab.rate;

    total += cost;
    remaining -= slabUnits;

    // 🔥 CLEAN BREAKDOWN
    if(slabUnits > 0){
      breakdown.push({
        range: `${min}-${max === Infinity ? "∞" : max}`,
        units: slabUnits,
        rate: slab.rate,
        cost: cost
      });
    }

  });

  return {
    total: Number(total.toFixed(2)),
    breakdown
  };
}

// ================= MAIN BILL =================
function calculateBill(){

  let load = parseFloat(document.getElementById("calcPower")?.value);
  let hours = parseFloat(document.getElementById("calcHours")?.value);
  let pf = 0.95;

  let type = document.getElementById("consumerType")?.value || "dom";
  const supply = document.getElementById("supplyType")?.value || "LT";
  const mode = document.getElementById("billingMode")?.value || "daily";

  // ===== VALIDATION =====
  if(!load || load <= 0){
    alert("⚠️ Enter valid load");
    return;
  }

  if(!hours || hours <= 0){
    alert("⚠️ Enter valid hours");
    return;
  }

  // ===== WARNING ONLY =====
  if(type === "dom" && load > 20){
    alert("⚠️ High domestic load (unusual)");
  }

  let loadKW = load;

  // ===== UNITS =====
  let days = (mode === "daily") ? 1 : (mode === "weekly") ? 7 : 30;
  let units = Number((loadKW * hours * days).toFixed(2));

  // ===== SMART SWITCH =====
  if(units > 1000 && type === "dom"){
    alert("⚠️ High usage → switched to commercial tariff");
    type = "comm";
  }

  // ===== INDUSTRIAL PF =====
  if(type === "ind"){
    units = units / pf;
  }

  // ================= ENERGY =================
  let energyCharge = 0;
  let breakdown = [];

  if(type === "dom"){

    const slabs = getSlabs(); // 👉 no duplicate logic

    const result = calculateSlab(units, slabs);

    energyCharge = result.total;

    breakdown = result.breakdown.map(b =>
      `${b.units.toFixed(0)} × ₹${b.rate} = ₹${b.cost.toFixed(2)}`
    );

  } else {

    let rate = (type === "comm") ? 9.30 : 6.90;

    energyCharge = units * rate;

    breakdown.push(
      `${units.toFixed(0)} × ₹${rate} = ₹${energyCharge.toFixed(2)}`
    );
  }

  // ================= DUTY =================
  let duty = energyCharge * (type === "dom" ? 0.16 : 0.075);

  // ================= TOS =================
  let tos = (type !== "dom" && mode === "monthly") ? units * 0.15 : 0;

  // ================= FIXED =================
  let fixed = 0;

  if(type === "dom"){
    if(loadKW <= 1) fixed = 30;
    else if(loadKW <= 3) fixed = 60;
    else if(loadKW <= 5) fixed = 100;
    else fixed = 150;
  }
  else if(type === "comm"){
    fixed = loadKW * 50;
  }
  else if(type === "ind" && supply === "HT"){
    fixed = (loadKW / pf) * 472;
  }

  // ================= GST =================
  let gst = (type !== "dom") ? (fixed + duty) * 0.18 : 0;

  // ================= FINAL =================
  let total = energyCharge + duty + tos + fixed + gst;

  // SAFETY
  energyCharge = Number(energyCharge) || 0;
  duty = Number(duty) || 0;
  total = Number(total) || 0;

  // MIN BILL (only if real energy exists)
  if(type === "dom" && energyCharge > 0 && total < 120){
    total = 120;
  }

  // ================= UI =================
  document.getElementById("units").innerText = units.toFixed(2);
  document.getElementById("energyCharge").innerText = "₹ " + energyCharge.toFixed(2);
  document.getElementById("duty").innerText = "₹ " + duty.toFixed(2);
  document.getElementById("tos").innerText = "₹ " + tos.toFixed(2);
  document.getElementById("gst").innerText = "₹ " + gst.toFixed(2);
  document.getElementById("fixed").innerText = "₹ " + fixed.toFixed(2);
  document.getElementById("amount").innerText = "₹ " + total.toFixed(2);

  // ================= SAVE =================
  window._billData = {
    tariffType: type === "dom" ? "res" : "comm",
    units,
    energyCharge,
    fixedCharge: fixed,
    gst,
    electricityDuty: duty,
    totalBill: total,
    breakdown,
    supplyPhase: (supply === "HT") ? "3" : "1",
    supplyType: supply,
    loadType: "kW",
    mode,
    tariff: (type === "dom") ? "Slab Based" : (type === "comm" ? 9.30 : 6.90),
    gstPercent: 18,
    dutyPercent: (type !== "dom") ? 7.5 : 16,
    pf
  };
}
 
// ================= SOLAR CALCULATOR (FINAL PRO MAX) =================
function calcSolar(){

  let bill = parseFloat(document.getElementById("solarBill").value) || 0;
  let kw = parseFloat(document.getElementById("solarKW").value) || 0;
  let sun = parseFloat(document.getElementById("sun").value) || 5.5;

  const systemType = document.getElementById("solarType").value;
  const rooftop = document.getElementById("rooftop").value;

  // ===== VALIDATION =====
  if(bill <= 0 || kw <= 0){
    alert("Enter valid inputs");
    return;
  }

  // ===== AREA =====
  let area = 0;
  if(rooftop.includes("Small")) area = 500;
  else if(rooftop.includes("Medium")) area = 1000;
  else area = kw * 100;

  let requiredArea = kw * 100;

  // ===== SMART WARNINGS (NO SPAM) =====
  if(rooftop.includes("Small") && kw > 5){
    console.warn("Small rooftop may not support >5kW");
  }

  if(rooftop.includes("Medium") && kw > 10){
    console.warn("Medium rooftop may not support >10kW");
  }

  // ===== SYSTEM PARAMETERS =====
  const efficiency = systemType.includes("On-Grid") ? 0.80 : 0.70;
  const costPerKW = systemType.includes("On-Grid") ? 50000 : 60000;

  // ===== GENERATION =====
  let monthlyUnits = kw * sun * 30 * efficiency;
  let yearlyUnits = monthlyUnits * 12;

  // ===== REALISTIC BILL → UNITS ESTIMATION =====
  let estimatedUnits = bill / 7; // avg realistic ₹/unit
  let effectiveRate = bill / estimatedUnits;

  // ===== SAFETY CLAMP =====
  if(effectiveRate < 4) effectiveRate = 4;
  if(effectiveRate > 12) effectiveRate = 12;

  // ===== SAVINGS =====
  let monthlySavings = monthlyUnits * effectiveRate;

  // cannot exceed bill
  monthlySavings = Math.min(monthlySavings, bill);

  let yearlySavings = monthlySavings * 12;

  // ===== COST =====
  let totalCost = kw * costPerKW;

  // ===== ROI =====
  let paybackYears = yearlySavings > 0 ? (totalCost / yearlySavings) : 0;

  // ===== LIFETIME =====
  let lifetime = 25;
  let lifetimeProfit = (yearlySavings * lifetime) - totalCost;

  // ===== CO2 =====
  let co2 = yearlyUnits * 0.00082;

  // ===== PERFORMANCE SCORE =====
  let performance = "Good";
  if(paybackYears < 4) performance = "Excellent";
  else if(paybackYears > 6) performance = "Average";

  // ================= UI =================

  // 💰 Monthly Saving
  document.getElementById("save").innerText = "₹ " + monthlySavings.toFixed(0);

  // 📅 Yearly Saving
  if(document.getElementById("yearSave")){
    document.getElementById("yearSave").innerText = "₹ " + yearlySavings.toFixed(0);
  }

  // ⚡ Units Generated
  if(document.getElementById("generation")){
    document.getElementById("generation").innerText = monthlyUnits.toFixed(0) + " units";
  }

  // 🔥 NEW: Units Saved
  if(document.getElementById("unitsSaved")){
    document.getElementById("unitsSaved").innerText = monthlyUnits.toFixed(0) + " units saved";
  }

  // ⏳ Payback
  if(document.getElementById("payback")){
    document.getElementById("payback").innerText = paybackYears.toFixed(1) + " Years";
  }

  // 🌱 CO2
  if(document.getElementById("co2")){
    document.getElementById("co2").innerText = co2.toFixed(2) + " Tons/year";
  }

  // 📈 Lifetime Profit
  if(document.getElementById("lifetime")){
    document.getElementById("lifetime").innerText = "₹ " + lifetimeProfit.toFixed(0);
  }

  // 🧠 Extra Info
  if(document.getElementById("solarDetails")){
  document.getElementById("solarDetails").innerHTML = `

  <div style="
    background:#0f172a;
    padding:15px;
    border-radius:12px;
    margin-top:10px;
    box-shadow:0 4px 15px rgba(0,0,0,0.4);
    font-size:14px;
    color:#fff;   /* 🔥 MAIN FIX */
  ">

    ${row("fas fa-bolt","Monthly Generation", monthlyUnits.toFixed(0)+" kWh")}
    ${row("fas fa-calendar-alt","Yearly Generation", yearlyUnits.toFixed(0)+" kWh")}
    ${row("fas fa-coins","Effective Rate","₹"+effectiveRate.toFixed(2)+"/unit")}
    ${row("fas fa-money-bill-wave","Monthly Savings","₹"+monthlySavings.toFixed(0),"#22c55e")}
    ${row("fas fa-wallet","Yearly Savings","₹"+yearlySavings.toFixed(0))}
    ${row("fas fa-solar-panel","System Cost","₹"+totalCost.toFixed(0))}
    ${row("fas fa-hourglass-half","Payback Time",paybackYears.toFixed(1)+" years")}
    ${row("fas fa-leaf","CO₂ Saved",co2.toFixed(2)+" Tons/year")}
    ${row("fas fa-chart-line","25 Year Profit","₹"+lifetimeProfit.toFixed(0),"#22c55e")}
    ${row("fas fa-chart-bar","Performance",performance,"#38bdf8",false)}

  </div>
  `;
}

// 🔥 CLEAN FUNCTION (NO REPEAT)
function row(icon,label,value,color="#fff",border=true){
  return `
    <div style="
      display:flex;
      justify-content:space-between;
      padding:6px 0;
      ${border ? "border-bottom:1px solid rgba(255,255,255,0.05);" : ""}
    ">
      <span style="color:#94a3b8;">
        <i class="${icon}"></i> ${label}
      </span>
      <b style="color:${color};">${value}</b>
    </div>
  `;
}

}


//*********DOWNLOAD BILL********************** */

window.downloadBill = function () {

  const gstPercent = parseFloat(document.getElementById("gstInput")?.value) || 0;
  const dutyPercent = parseFloat(document.getElementById("dutyInput")?.value) || 0;

  if (!window._billData) { 
    alert("⚠ Please calculate bill first"); 
    return; 
  }

  const d = window._billData;

  const billNumber = "BILL-" + Date.now();
  const billingDate = new Date().toLocaleDateString();

  const consumerLabel = d.tariffType === "res" ? "Residential" : "Commercial";
  const phaseLabel = d.supplyPhase === "3" ? "Three Phase" : "Single Phase";

  function safe(val){
    return (val !== undefined && !isNaN(val)) ? Number(val).toFixed(2) : "0.00";
  }

  // ================= AI =================
  let suggestions = [];

  // ⚡ Consumption Analysis
  if(d.units > 1000){
    suggestions.push("🚨 Extremely high consumption detected. Immediate load optimization required.");
  }
  else if(d.units > 500){
    suggestions.push("⚠ High consumption. Reduce heavy appliances during peak hours.");
  }
  else if(d.units < 100){
    suggestions.push("✅ Excellent efficiency. Very low consumption.");
  }
  else{
    suggestions.push("ℹ Moderate usage. System operating in normal range.");
  }

  // 💰 Bill Analysis
  if(d.totalBill > 10000){
    suggestions.push("💸 High bill detected. Consider solar integration or load shifting.");
  }
  else if(d.totalBill < 2000){
    suggestions.push("💡 Economical usage. Cost efficiency maintained.");
  }

  // ⚙️ Power Factor Analysis
  if(d.loadType === "kVA"){
    suggestions.push("⚡ kVA load detected. Maintain PF near unity to reduce losses.");
  }
  

  // 🔌 Daily Usage Pattern
  const dailyUsage = d.units / 30;
  if(dailyUsage > 20){
    suggestions.push("📊 High daily consumption pattern. Peak load monitoring recommended.");
  }

  // 🧠 Advanced Intelligence
  const costPerUnit = d.units > 0 ? d.totalBill / d.units : 0;

  suggestions.push("📈 Avg Daily Usage: " + dailyUsage.toFixed(1) + " kWh/day");
  suggestions.push("💲 Cost per Unit: ₹" + costPerUnit.toFixed(2));

  if(costPerUnit > 10){
    suggestions.push("⚠ High cost per unit. Check tariff or load type.");
  }

  if(d.units < 300){
    suggestions.push("🟢 Efficiency Score: HIGH");
  }
  else if(d.units < 800){
    suggestions.push("🟡 Efficiency Score: MODERATE");
  }
  else{
    suggestions.push("🔴 Efficiency Score: LOW");
  }

  // 🧠 Final Insight
  suggestions.push("🤖 AI Insight: System analyzed with load, cost, and efficiency parameters.");

  


  // ================= HTML =================
  const html = `
<html>
<head>
<style>
body{
  font-family: Arial, sans-serif;
  background:#fff;
  color:#000;
  padding:20px;
}

.bill{
  width:100%;
  max-width:800px;
  margin:auto;
  border:2px solid #000;
  padding:20px;
}

#bill .pdf-header{
  background:#fff !important;
  color:#000 !important;
  border-bottom:2px solid #000;
}

.logo{
  width:75px !important;
  height:85px !important;
}

.center{
  text-align:center;
  flex:1;
}

.title{
  font-weight:bold;
  font-size:14px;
}

.table{
  width:100%;
  border-collapse:collapse;
  margin-top:55px;
}

.table td{
  border:1px solid #000;
  padding:6px;
  font-size:13px;
}

.section-title{
  margin-top:12px;
  font-weight:bold;
  border-bottom:1px solid #000;
}

.total{
  font-weight:bold;
  font-size:15px;
}

.bill-ai-box{
  background:#f0f8ff;
  padding:10px;
  border-left:4px solid #bedaf0;
  margin-top:10px;
  font-size:13px;
}

.sign{
  margin-top:30px;
  text-align:right;
  font-size:12px;
}
</style>
</head>

<body>

<div class="bill">

<!-- HEADER -->
<div class="pdf-header">
<img src="assets/msedcl_logo.png" crossorigin="anonymous">

<div class="center">
  <div class="title">
    MAHARASHTRA STATE ELECTRICITY DISTRIBUTION CO. LTD.<br>
    (MSEDCL)<br>
    ELECTRICITY BILL - 2026
  </div>
</div>

<div style="width:70px;"></div>
</div>

<!-- CONSUMER DETAILS -->
<table class="table">
<tr>
<td>Bill Number</td><td>${billNumber}</td>
<td>Billing Date</td><td>${billingDate}</td>
</tr>

<tr>
<td>Consumer No</td><td>CN-${Math.floor(Math.random()*999999)}</td>
<td>Meter No</td><td>MT-${Math.floor(Math.random()*999999)}</td>
</tr>

<tr>
<td>Consumer Type</td><td>${consumerLabel}</td>
<td>Supply Phase</td><td>${phaseLabel}</td>
</tr>

<tr>
<td>Supply Type</td><td>${d.supplyType || "LT"}</td>
<td>Units Consumed</td><td>${safe(d.units)} kWh</td>
</tr>

<tr>
<td>Tariff</td><td>₹${safe(d.tariff)}</td>
<td>Power Factor</td><td>${d.pf || 0.95}</td>
</tr>

<tr>
<td>Load Type</td><td>${d.loadType}</td>
<td>Billing Mode</td><td>${d.mode}</td>
</tr>
</table>

<!-- BREAKDOWN -->
<div class="section-title">ENERGY CHARGE BREAKDOWN</div>

<table class="table">
<tr><td><b>Slab</b></td><td><b>Calculation</b></td><td><b>Amount</b></td></tr>

${d.breakdown.map((b,i)=>`
<tr>
<td>${i+1}</td>
<td>${b}</td>
<td>₹${(b.match(/=\s*₹?([\d.]+)/)?.[1]) || "0.00"}</td>
</tr>
`).join("")}

</table>

<!-- CHARGES -->
<div class="section-title">BILL DETAILS</div>

<table class="table">
<tr><td>Energy Charge</td><td>₹${safe(d.energyCharge)}</td></tr>
<tr><td>Fixed Charge</td><td>₹${safe(d.fixedCharge)}</td></tr>
<tr><td>GST (${gstPercent}%)</td><td>₹${safe(d.gst)}</td></tr>
<tr><td>Electricity Duty (${dutyPercent}%)</td><td>₹${safe(d.electricityDuty)}</td></tr>

<tr class="total">
<td>TOTAL AMOUNT</td>
<td>₹${safe(d.totalBill)}</td>
</tr>
</table>

<!-- AI -->
<div class="bill-ai-box">
<b>AI Analysis:</b><br>
${suggestions.map(s => `• ${s}`).join("<br>")}

<br><br>
<b>Advanced Insights:</b><br>
• Estimated Daily Usage: ${d.units ? (d.units/30).toFixed(1) : "0.0"} kWh/day<br>
• Cost per Unit: ₹${d.units ? (d.totalBill/d.units).toFixed(2) : "0.00"}<br>
• Efficiency Score: ${d.units < 300 ? "High" : d.units < 800 ? "Moderate" : "Low"}<br>
• Load Behavior: ${d.units > 500 ? "Heavy Load Pattern" : "Normal Usage"}
</div>

<!-- INSTRUCTIONS -->
<div class="instructions">
<b>Instructions:</b><br>
• Pay bill before due date to avoid penalty<br>
• Late payment may attract additional charges<br>
• Maintain proper power factor to reduce losses<br>
• Avoid heavy load during peak hours<br>
• Use energy efficient appliances (LED, inverter AC, etc.)<br>
</div>

<!-- SIGNATURE -->
<div class="sign">
Authorized Signatory<br>
MSEDCL Billing Department
</div>

</div>

</body>
</html>
`;

  // ================= RENDER =================
  const bill = document.getElementById("bill");

  // 🔥 MOST IMPORTANT LINE
  bill.innerHTML = html;

  bill.style.display = "block";
  document.body.classList.add("pdf-mode");

  // ================= PDF =================
  setTimeout(() => {

    html2pdf()
      .set({
  margin: [3, 0, -15, 0],   // 🔥 TOP margin only
  filename: 'MSEDCL_Bill.pdf',
  image: { type: 'jpeg', quality: 1 },
  html2canvas: { scale: 2, useCORS: true },
  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
})
      .from(bill)
      .save()
      .then(() => {
        document.body.classList.remove("pdf-mode");
        bill.style.display = "none";
      });

  }, 200);

};


  /*********************************
  ✅ PROFESSIONAL DATA ENGINE
**********************************/

window.analysisDataset = window.analysisDataset || [];

// 🔥 SAFE PARSER
function safeParse(val){
  // 🔥 CSV AUTO SCALE ENGINE (ONLY FOR CSV MODE)
function autoScaleCSV(row){

  // ===== DEFAULT FALLBACK =====
  let v = row.voltage ?? 230;
  let c = row.current ?? 2;
  let f = row.frequency ?? 50;
  let pfVal = row.pf ?? 0.9;
  let temp = row.temperature ?? 30;

  // ===== DYNAMIC SCALING =====

  // Voltage scaling
  if(v > 250){
    dynamicLimits.voltMin = Math.max(180, v - 40);
    dynamicLimits.voltMax = v + 40;
  }

  // Current scaling
  if(c > 10){
    dynamicLimits.currentMax = c + 5;
  }

  // Frequency scaling
  if(f < 45 || f > 55){
    dynamicLimits.freqMin = f - 2;
    dynamicLimits.freqMax = f + 2;
  }

  // PF scaling
  if(pfVal < 0.7){
    dynamicLimits.pfMin = pfVal - 0.1;
  }

  // Temperature scaling
  if(temp > 60){
    dynamicLimits.tempMax = temp + 10;
  }

  // ===== APPLY SAFE CLAMP =====
  v = Math.min(v, dynamicLimits.voltMax);
  c = Math.min(c, dynamicLimits.currentMax);
  f = Math.min(f, dynamicLimits.freqMax);
  pfVal = Math.min(Math.max(pfVal, 0), 1);
  temp = Math.min(temp, dynamicLimits.tempMax);

  return {
    voltage: v,
    current: c,
    frequency: f,
    pf: pfVal,
    temperature: temp,
    power: row.power ?? (v * c * pfVal),
    humidity: row.humidity ?? 50
  };
}
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

/*********************************
  🔥 SMART DATA LOADER (FINAL PRO)
*********************************/

function loadAnalysisDataset(){

  const fileInput = document.getElementById("analysisFile");

  if (!fileInput || fileInput.files.length === 0){
    alert("⚠ Upload file first");
    return;
  }

  const file = fileInput.files[0];

  // 🔥 FILE TYPE CHECK
  const validTypes = [
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/pdf"
  ];

  if(!validTypes.includes(file.type)){
    alert("❌ Only CSV, Excel, PDF allowed");
    fileInput.value = "";
    return;
  }

  // 🔥 SIZE LIMIT
  if(file.size > 5 * 1024 * 1024){
    alert("⚠ File too large (max 5MB)");
    fileInput.value = "";
    return;
  }

  // 🔥 PDF SAFE BLOCK
  if(file.type === "application/pdf"){
    alert("⚠ PDF detected → convert to CSV for best results");
    return;
  }

  // 🔥 SMART NUMBER FINDER
  function findNumber(arr){
    for(let val of arr){
      const num = parseFloat(val);
      if(!isNaN(num)) return num;
    }
    return null;
  }

  // 🔥 NORMALIZER (AUTO STRUCTURE)
  function normalizeRow(cols){

    const clean = cols.map(c => c.trim());

    return {
  time: clean[0] || "",

  voltage: findNumber(clean.slice(0,3)) ?? 230,
  current: findNumber(clean.slice(1,4)) ?? 2,
  frequency: findNumber(clean.slice(2,5)) ?? 50,
  pf: findNumber(clean.slice(3,6)) ?? 0.9,
  power: findNumber(clean.slice(4,7)) ?? 0,
  temperature: findNumber(clean.slice(5,8)) ?? 30,
  humidity: findNumber(clean.slice(6,9)) ?? 50,

  status: generateCSVStatus(clean)
  };

  }

  // ================= CSV =================
  if(file.name.endsWith(".csv")){

    const reader = new FileReader();

    reader.onload = function(e){

      try{

        const text = e.target.result.trim();

        const rows = text.split(/\r?\n/);

        let dataset = [];

        // 🔥 SKIP HEADER AUTOMATIC
        for(let i = 0; i < rows.length; i++){

          const r = rows[i].trim();
          if(!r) continue;

          const cols = r.split(",");

          // 🔥 skip header row (text heavy)
          if(i === 0 && cols.some(c => isNaN(parseFloat(c)))) continue;

          const obj = normalizeRow(cols);

          // 🔥 FILTER GARBAGE
          if(obj.voltage === null && obj.current === null) continue;

          dataset.push(obj);
        }

        if(dataset.length === 0){
          alert("❌ Invalid CSV format");
          return;
        }

        window.analysisDataset = dataset;
        analysisIndex = 0;

        localStorage.setItem("analysisMode","csv");

        console.log("✅ CSV Loaded:", dataset.length);

        alert(`✅ CSV Loaded Successfully\nRecords: ${dataset.length}`);

        if(typeof updateExportPage === "function"){
          updateExportPage();
        }

      }catch(err){
        console.error(err);
        alert("❌ CSV parsing failed");
      }

    };

    reader.readAsText(file);
  }

  // ================= EXCEL =================
  else if(file.name.endsWith(".xlsx")){

    const reader = new FileReader();

    reader.onload = function(e){

      try{

        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: "array"});

        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        let json = XLSX.utils.sheet_to_json(sheet);

        let dataset = json.map(row => {

          const values = Object.values(row).map(v => String(v));

          return normalizeRow(values);
        });

        // 🔥 CLEAN
        dataset = dataset.filter(d => {
          return !(d.voltage === null && d.current === null);
        });

        if(dataset.length === 0){
          alert("❌ Invalid Excel format");
          return;
        }

        window.analysisDataset = dataset;
        analysisIndex = 0;

        localStorage.setItem("analysisMode","excel");

        console.log("✅ Excel Loaded:", dataset.length);

        alert(`✅ Excel Loaded Successfully\nRecords: ${dataset.length}`);

      }catch(err){
        console.error(err);
        alert("❌ Excel parsing failed");
      }

    };

    reader.readAsArrayBuffer(file);
  }

}


/*********************************
  🔥 CSV STATUS ENGINE (NEW)
*********************************/

function generateCSVStatus(cols){

  const voltage = safeParse(cols[1]);
  const current = safeParse(cols[2]);

  if(voltage === null) return "UNKNOWN";

  if(voltage < 200) return "LOW VOLTAGE";
  if(voltage > 250) return "OVER VOLTAGE";

  if(current && current > 10) return "OVERLOAD";

  return "SYSTEM HEALTHY";
}

/*********************************
  ✅ EXPORT PDF (UPGRADED SAFE)
*********************************/

function exportPDF(){

  const logs = JSON.parse(localStorage.getItem("micropmu_logs") || "[]");

  // 🔥 FALLBACK TO CSV DATA
  const data = logs.length > 0 ? logs : window.analysisDataset;

  if(data.length === 0){
    alert("⚠ No Data Available");
    return;
  }

  if(typeof window.jspdf === "undefined"){
    alert("❌ PDF library not loaded");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(14);
  doc.text("Micro-PMU System Report", 20, 20);

  doc.setFontSize(10);

  data.slice(0,50).forEach((l,i)=>{

    const row = `
${i+1}. ${l.timestamp ? new Date(l.timestamp).toLocaleString() : l.time}
V:${l.voltage || 0} | I:${l.current || 0} | PF:${l.pf || 0}
Temp:${l.temperature || 0}°C | Hum:${l.humidity || 0}%
Status: ${l.status || "N/A"}
`;

    doc.text(row, 20, 30 + (i*8));
  });

  doc.save("MicroPMU_Report.pdf");

  alert("✅ PDF Exported Successfully");
}



  /**************Export Timeline**********************/
  /*********************************************** */

  function clearFaultHistory() {
    localStorage.removeItem("micropmu_timeline");
    alert("Timeline Cleared");

    // 🔥 UI refresh bhi kar
    if (typeof updateTimelineUI === "function") {
      updateTimelineUI();
    }
  }
function exportTimeline() {

  let timeline = JSON.parse(localStorage.getItem("micropmu_timeline") || "[]");

  if (timeline.length === 0) {
    alert("No Timeline Data");
    return;
  }

  let csv = "Time,Type,Fault\n";

  timeline.forEach(e => {
    csv += `${e.time},${e.type},${e.fault}\n`;
  });

  // ===== GET FORMAT =====
  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
  const format = settings.exportFormat || "csv";

  // ===== FORMAT SWITCH =====
  if(format === "pdf"){

    exportChartsPDF();
    alert("📄 Exported as PDF (Charts)");

  }
  else if(format === "excel"){

    exportExcel();
    alert("📗 Exported as Excel File");

  }
  else{

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;

    a.download = `MicroPMU_Report_${new Date().toISOString().slice(0,10)}.csv`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);

    alert("⬇ CSV Export Successful");
  }
}
  // ===================================//
  // ===== FORCE GLOBAL BUTTON FIX =====//
  // ===================================//
  // ================= FORCE GLOBAL BUTTON FIX =================

  // Reset Energy
  window.secureResetEnergy = function () {
    if (sessionStorage.getItem("adminVerified") !== "true") {
      alert("⚠ Verify Admin First");
      return;
    }
    localStorage.removeItem("micropmu_energy");
    alert("✅ Energy Counter Reset");
  };


  /******************************************* */
  /* New Code Merging 
  /****************************************** */

  /***********FOR WINDOW******************* */
window.togglePass = function() {

  const input = document.getElementById("adminAccessPass");
  const icon = document.getElementById("adminEyeIcon");

  if (!input) return;

  if (input.type === "password") {
    input.type = "text";
    icon.innerHTML = '<i class="fas fa-eye-slash"></i>';
  } else {
    input.type = "password";
    icon.innerHTML = '<i class="fas fa-eye"></i>'; // pro show
  }
};

  window.logoutAccess = function () {

    // 🔥 clear session (main fix)
    sessionStorage.removeItem("syncVerified");
    sessionStorage.removeItem("cloudVerified");

    // optional (safe)
    sessionStorage.clear();

    alert("🚪 Logged Out Successfully");

    // 🔥 force reload (important)
    location.reload();
  };

  /*******FOR ADMIN PASS************ */
  function toggleAdminPass() {

    const input = document.getElementById("adminPass");
    const icon = document.getElementById("adminEye");

    if (input.type === "password") {
  input.type = "text";
  icon.innerHTML = '<i class="fas fa-eye-slash"></i>';
} else {
  input.type = "password";
  icon.innerHTML = '<i class="fas fa-eye"></i>'; // pro show
}
  }


/*************end main.js******************** */

function systemStress(){

  let last = history[history.length-1];
  if(!last) return 0;

  let stress = 0;

  // ===== SAFE LIMITS =====
  let cMax = dynamicLimits.currentMax || 1;
  let tMax = dynamicLimits.tempMax || 1;
  let vMin = dynamicLimits.voltMin || 200;
  let vMax = dynamicLimits.voltMax || 250;
  let pfMin = dynamicLimits.pfMin || 0.8;

  // ===== CURRENT =====
  let currentRatio = last.current / cMax;
  if(currentRatio > 1) stress += 30;
  else if(currentRatio > 0.8) stress += 15;

  // ===== TEMPERATURE =====
  let tempRatio = last.temperature / tMax;
  if(tempRatio > 1) stress += 25;
  else if(tempRatio > 0.8) stress += 10;

  // ===== PF =====
  if(last.pf < pfMin) stress += 15;
  else if(last.pf < pfMin + 0.05) stress += 8;

  // ===== VOLTAGE =====
  if(last.voltage < vMin || last.voltage > vMax){
    stress += 20;
  }
  else if(
    last.voltage < vMin + 5 ||
    last.voltage > vMax - 5
  ){
    stress += 10;
  }

  // ===== BASE STRESS (REALISTIC TOUCH) =====
  if(stress === 0){
    stress = Math.random() * 5; // 0–5% idle stress
  }

// 🔥 ADD HERE (IMPORTANT)
  stress = stress * (100 / 90);

  return Math.min(100, Math.round(stress));
}

function thermalStress(){
  let last = history[history.length-1];
  if(!last) return 0;

  return parseFloat(((last.temperature / dynamicLimits.tempMax) * 100).toFixed(1));
}

function loadStability(){

  if(history.length < 5) return 0;

  let values = history.map(h => h.current);

  let diff = Math.max(...values) - Math.min(...values);

  return parseFloat(diff.toFixed(2));
}


function updateDynamicLimits(){

  if(history.length < 4) return;

  const avg = arr => arr.reduce((a,b)=>a+b,0)/arr.length;

  let vAvg = avg(history.map(h=>h.voltage));
  let cAvg = avg(history.map(h=>h.current));
  let pfAvg = avg(history.map(h=>h.pf));
  let tAvg = avg(history.map(h=>h.temperature));

  dynamicLimits.voltMin = vAvg - 10;
  dynamicLimits.voltMax = vAvg + 10;

  dynamicLimits.currentMax = cAvg * 1.8;
  dynamicLimits.pfMin = pfAvg - 0.1;
  dynamicLimits.tempMax = tAvg + 15;
}

/**************** AI SYSTEM ***********************/

function predictFailure(){

  if(history.length < 10) return "Stable";

  let first = history[0];
  let last = history[history.length-1];

  let trend = last.current - first.current;

  if(trend > 2 && last.current > LIMITS.OVERLOAD_CURRENT){
    return "⚠ Overload Incoming";
  }

  if(last.temperature > LIMITS.TEMP_MAX - 5){
    return "⚠ Overheating Risk";
  }

  return "Stable";
}


window.runAIEngine = function(){

  updateDynamicLimits();

  const stress = systemStress();
  const thermal = thermalStress();
  const stability = loadStability();

  const status = evaluateStatus();

  let reason = "";
  let risk = 0;
  let prediction = "";
  let fix = "";
  let confidence = 0;  

  // ===== MULTI FAULT SUPPORT =====
  let faults = evaluateStatus(true);

  faults.forEach(f => {

    if(f === "SYSTEM HEALTHY"){
      reason = "All parameters normal";
      risk = 10;
      prediction = "Stable";
      fix = "No action";
      confidence = 95;
    }

    if(f === "LOW VOLTAGE"){
      reason += "Voltage below limit. ";
      risk += 25;
      prediction += "Current may increase. ";
      fix += "Reduce load or stabilize supply. ";
      confidence += 15;
    }

    if(f === "OVER VOLTAGE"){
      reason += "Voltage above safe limit. ";
      risk += 30;
      prediction += "Equipment stress possible. ";
      fix += "Check supply source. ";
      confidence += 18;
    }

    if(f === "OVERLOAD"){
      reason += "Load too high. ";
      risk += 40;
      prediction += "Temperature will rise. ";
      fix += "Disconnect extra load. ";
      confidence += 25;
    }

    if(f === "LOW POWER FACTOR"){
      reason += "Power factor is low. ";
      risk += 20;
      prediction += "System losses increasing. ";
      fix += "Add capacitor bank. ";
      confidence += 12;
    }

    if(f === "SHORT CIRCUIT"){
      reason += "Extreme current detected. ";
      risk += 90;
      prediction += "Immediate failure possible. ";
      fix += "Trip supply immediately. ";
      confidence += 40;
    }

    if(f === "OVER TEMPERATURE"){
      reason += "System overheating. ";
      risk += 35;
      prediction += "Thermal damage possible. ";
      fix += "Cooling required. ";
      confidence += 20;
    }

    if(f === "FREQUENCY FAULT"){
      reason += "Frequency instability detected. ";
      risk += 30;
      prediction += "Grid instability possible. ";
      fix += "Check generation/load balance. ";
      confidence += 18;
    }

    if(f === "HIGH CURRENT"){
      reason += "Current higher than normal. ";
      risk += 20;
      prediction += "May lead to overload. ";
      fix += "Monitor load. ";
      confidence += 12;
    }

    if(f === "UNDER FREQUENCY"){
      reason += "Frequency too low. ";
      risk += 25;
      prediction += "Load shedding possible. ";
      fix += "Reduce load. ";
      confidence += 15;
    }

    if(f === "OVER FREQUENCY"){
      reason += "Frequency too high. ";
      risk += 25;
      prediction += "Generator instability. ";
      fix += "Stabilize generation. ";
      confidence += 15;
    }

    if(f === "LINE DISTURBANCE"){
      reason += "Line fluctuation detected. ";
      risk += 20;
      prediction += "Voltage variation possible. ";
      fix += "Check line condition. ";
      confidence += 12;
    }

    if(f === "WARNING"){
      reason += "Voltage near threshold. ";
      risk += 10;
      prediction += "May turn into fault. ";
      fix += "Observe system. ";
      confidence += 10;
    }

  });

  // ===== SAFETY DEFAULT =====
  if(reason === ""){
    reason = "Analyzing system...";
    prediction = "Pending";
    fix = "Monitoring";
    confidence = 50;
  }

  // ===== LIMIT VALUES =====
  risk = Math.min(risk, 100);
  confidence = Math.min(confidence, 100);
  
  // 🔥 HIGH STRESS PREDICTION ADD
  if (stress > 80) {
  prediction += "⚠ High failure probability soon. ";
  } 

 // ===== FORMAT =====
  confidence = (confidence + Math.random()*3).toFixed(1) + "%";

  return {
    status,
    reason,
    risk: risk + "%",
    prediction,
    fix,
    confidence,
    stress,
    thermal,
    stability,
    predictionTrend: predictFailure(),
  };
};
/**************** AI POPUP FINAL FIX ****************/

// ✅ SAFE TEXT SETTER
function setAI(id, value){
  const el = document.getElementById(id);
  if(el) el.innerText = value;
}

// ✅ OPEN AI POPUP (MAIN)
window.openAI = function(){

  const popup = document.getElementById("aiPopup");
  if(!popup) return;

  const ai = runAIEngine();

  setAI("aiStress", ai.stress + "%");
  setAI("aiThermal", ai.thermal + "%");
  setAI("aiStability", ai.stability);

  setAI("aiStatus", ai.status);
  setAI("aiReason", ai.reason);
  setAI("aiRisk", ai.risk);
  setAI("aiPrediction", ai.prediction);
  setAI("aiPrediction", ai.prediction + " | " + ai.predictionTrend);
  setAI("aiFix", ai.fix);
  setAI("aiConfidence", ai.confidence);

  // 🔥 MAIN FIX
  popup.style.display = "flex";
  popup.style.alignItems = "center";
  popup.style.justifyContent = "center";

  setTimeout(()=>{
    popup.style.opacity = "1";
  },10);
};

window.closeAI = function(){
  const popup = document.getElementById("aiPopup");
  if(!popup) return;

  popup.style.opacity = "0";

  setTimeout(()=>{
    popup.style.display = "none";
  },200);
};

// ✅ REALTIME UPDATE (popup open ho tab hi)
function updateAIRealtime(){

  // 🔒 disable realtime (optional — agar enable karna ho toh yeh line hata dena)
  return;

  const popup = document.getElementById("aiPopup");
  if(!popup || popup.style.display !== "flex") return;

  const ai = runAIEngine();

  setAI("aiStress", ai.stress + "%");
  setAI("aiThermal", ai.thermal + "%");
  setAI("aiStability", ai.stability);
}

// 🔥 AUTO UPDATE EVERY 1s
//setInterval(updateAIRealtime, 1000);


function setActive(btn){
  document.querySelectorAll(".report-controls button")
    .forEach(b => b.classList.remove("active"));

  btn.classList.add("active");
}

function showLoader(){
  document.querySelectorAll(".chart-box").forEach(box=>{
    box.innerHTML = "<div class='loader'></div>";
  });
}

function updateReportHeader(range, count){

  const modeEl = document.getElementById("perfMode");
  const recEl = document.getElementById("reportRecords");
  const rateEl = document.getElementById("perfRate");
  const storageEl = document.getElementById("storageUsed");

  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
  const mode = settings.systemMode || "simulation";

  // ===== SYSTEM MODE =====
  if(modeEl){
    if(mode === "esp") modeEl.innerText = "ESP Live";
    else if(mode === "hybrid") modeEl.innerText = "CSV Analysis";
    else modeEl.innerText = "Simulation";
  }

  // ===== RECORD COUNT =====
  if(recEl){
    recEl.innerText = count + " records";
  }

  // ===== SAMPLING RATE =====
  if(rateEl){
    rateEl.innerText = (settings.samplingRate || 1000) + " ms";
  }

  // ===== STORAGE (🔥 FIXED PROPERLY) =====
  if(storageEl){

    let percent = getStoragePercent();

    storageEl.innerText = percent.toFixed(1) + "%";
    storageEl.style.animation = "none";

    if (percent < 25) {
      storageEl.style.color = "#4ade80";
    }
    else if (percent < 50) {
      storageEl.style.color = "#22c55e";
    }
    else if (percent < 70) {
      storageEl.style.color = "#f97316";
    }
    else if (percent < 90) {
      storageEl.style.color = "#dc2626";
    }
    else {
      storageEl.style.color = "#7f1d1d";
      storageEl.style.animation = "blink 1s infinite";
    }
  }
}

function updateExportButtons(){

  const mode = getSystemMode();

  const csvBtn = document.getElementById("exportBtn");
  const pdfBtn = document.getElementById("pdfBtn");
  const excelBtn = document.getElementById("excelBtn");

  // default enable
  csvBtn?.classList.remove("disabled");
  pdfBtn?.classList.remove("disabled");
  excelBtn?.classList.remove("disabled");

  // ESP not connected
  if(mode === "esp" && !window.espConnected){
    csvBtn?.classList.add("disabled");
    pdfBtn?.classList.add("disabled");
    excelBtn?.classList.add("disabled");
  }

  // CSV not uploaded
  if(mode === "hybrid" && (!window.analysisDataset || window.analysisDataset.length === 0)){
    csvBtn?.classList.add("disabled");
    pdfBtn?.classList.add("disabled");
    excelBtn?.classList.add("disabled");

    const row = window.analysisDataset[analysisIndex];

if(row){

  // 🔥 APPLY AUTO SCALE
  const scaled = autoScaleCSV(row);

  voltage = scaled.voltage;
  current = scaled.current;
  frequency = scaled.frequency;
  power = scaled.power;
  pf = scaled.pf;
  temperature = scaled.temperature;
  humidity = scaled.humidity;

  analysisIndex++;

  if(analysisIndex >= window.analysisDataset.length){
    analysisIndex = 0;
  }
}
  }

  // ✅ simulation ALWAYS enabled
}

document.addEventListener("DOMContentLoaded", () => {

   // 🔥 ADD THIS HERE
  setInterval(() => {

    if(getSystemMode() === "esp"){
      fetchESPData();
    }

  }, 1000);


  // existing code...
  loadFirebaseSafe();
  detectModeFromURL();

  // ===== STORAGE DISPLAY =====
  const storageEl = document.getElementById("storageUsed");
  if (storageEl) {
    storageEl.innerText = getStoragePercent().toFixed(1) + "%";
  }
   updateMemoryUsage();

  // ===== LOGGING BUTTON STATE =====
  const btn = document.getElementById("storageToggleBtn");
  if (btn) {
    if (loggingEnabled) {
      btn.innerText = "Disable Logging";
      btn.style.background = "#dc2626"; // 🔴 red
    } else {
      btn.innerText = "Enable Logging";
      btn.style.background = "#22c55e"; // 🟢 green
    }
  }

  // ===== SIDEBAR ACTIVE LINK =====
  let currentPage = window.location.pathname.split("/").pop();

  if (currentPage === "" || currentPage === "/") {
    currentPage = "index.html";
  }

  document.querySelectorAll(".sidebar a").forEach(link => {
    link.classList.remove("active");

    if (link.getAttribute("href") === currentPage) {
      link.classList.add("active");
    }
  });

});

// ===== AUTO SIDEBAR ACTIVE FIX =====
const links = document.querySelectorAll(".sidebar a");

let currentPage = window.location.pathname.split("/").pop();

links.forEach(link => {
  let linkPage = link.getAttribute("href");

  if(linkPage === currentPage){
    link.classList.add("active");
  }
});

// 🔥 BILL DETAILS TOGGLE
function toggleDetails(){
  const box = document.getElementById("billDetails");
  const arrow = document.getElementById("billArrow");

  if(!box) return;

  box.classList.toggle("hidden");

  // 🔥 arrow handling (optional but pro look)
  if(arrow){
    arrow.innerText = box.classList.contains("hidden") ? "▼" : "▲";
  }
}


// 🔥 SOLAR DETAILS TOGGLE
function toggleSolarDetails(){
  const box = document.getElementById("solarDetails");
  const arrow = document.getElementById("solarArrow");

  if(!box) return;

  box.classList.toggle("hidden");

  // 🔥 arrow toggle
  if(arrow){
    arrow.innerText = box.classList.contains("hidden") ? "▼" : "▲";
  }
}

function toggleCSVPlayback(){

  const icon = document.getElementById("csvPlayIcon");

  // 🔥 TOGGLE STATE
  csvPlaying = !csvPlaying;

  if(csvPlaying){
    if(icon) icon.className = "fas fa-pause";
    console.log("▶️ CSV PLAY");
  }else{
    if(icon) icon.className = "fas fa-play";
    console.log("⏸ CSV PAUSE");
  }
}

/*********************************
 FINAL CLEAN CSV + EXCEL HANDLER
*********************************/

// ===== GLOBAL =====
window.analysisDataset = [];
window.analysisIndex = 0;
window.csvPlaying = true;


// ================= NORMALIZE =================
function normalizeKey(key){
  return key.toLowerCase().replace(/[^a-z]/g, "");
}


// ================= COLUMN MAP =================
function mapColumn(key){

  const k = normalizeKey(key);

  if(["v","volt","voltage","vtg","vlt"].includes(k)) return "voltage";
  if(["c","curr","current","amp","amps"].includes(k)) return "current";
  if(["f","freq","frequency","hz"].includes(k)) return "frequency";
  if(["p","power","watt","kw"].includes(k)) return "power";
  if(["pf","powerfactor"].includes(k)) return "pf";
  if(["temp","temperature"].includes(k)) return "temperature";
  if(["hum","humidity"].includes(k)) return "humidity";
  if(["t","time","timestamp","timer"].includes(k)) return "time";

  return null;
}


// ================= HEADER DETECT =================
function findHeaderRow(rows){

  for(let i=0; i<Math.min(5, rows.length); i++){

    const cols = rows[i].split(",");
    let match = 0;

    cols.forEach(c=>{
      if(mapColumn(c)) match++;
    });

    if(match >= 2) return i;
  }

  return 0;
}


// ================= CSV LOADER =================
function openCSVLoader(file){

  const reader = new FileReader();

  reader.onload = function(e){

    const text = e.target.result;

    const rows = text.split("\n")
      .map(r => r.trim())
      .filter(r => r);

    if(rows.length === 0){
      alert("❌ Empty CSV");
      return;
    }

    const headerIndex = findHeaderRow(rows);
    const headers = rows[headerIndex].split(",");
    const mapped = headers.map(h => mapColumn(h));

    const data = [];

    for(let i = headerIndex + 1; i < rows.length; i++){

      const values = rows[i].split(",");
      let obj = {};

      mapped.forEach((key, j)=>{
        if(!key) return;

        const val = parseFloat(values[j]);
        if(!isNaN(val)){
          obj[key] = val;
        }
      });

      if(Object.keys(obj).length >= 2){
        data.push(obj);
      }
    }

    window.analysisDataset = data;
    localStorage.setItem("analysisDataset", JSON.stringify(data));
    window.analysisIndex = 0;
    window.csvPlaying = true;

    console.log("✅ CSV Loaded:", data.length);
  };

  reader.readAsText(file);
}


// ================= EXCEL LOADER =================
function openExcelLoader(file){

  const reader = new FileReader();

  reader.onload = function(e){

    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, {type: "array"});
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const raw = XLSX.utils.sheet_to_json(sheet, {header:1});

    const finalData = [];

    raw.forEach(row => {

      if(!row || row.length === 0) return;

      let obj = {};

      row.forEach(cell => {

        const val = parseFloat(cell);
        if(isNaN(val)) return;

        if(val >= 180 && val <= 300 && !obj.voltage) obj.voltage = val;
        else if(val > 0 && val <= 100 && !obj.current) obj.current = val;
        else if(val >= 45 && val <= 55 && !obj.frequency) obj.frequency = val;
        else if(val > 0 && val <= 1 && !obj.pf) obj.pf = val;
        else if(val >= 20 && val <= 100 && !obj.temperature) obj.temperature = val;
        else if(val >= 0 && val <= 24 && !obj.time) obj.time = val;

      });

      if(obj.voltage || obj.current){
        finalData.push(obj);
      }
    });

    window.analysisDataset = finalData;
    localStorage.setItem("analysisDataset", JSON.stringify(finalData));
    window.analysisIndex = 0;
    window.csvPlaying = true;

    console.log("🔥 Excel Extracted:", finalData.length);
  };

  reader.readAsArrayBuffer(file);
}


// ================= FILE HANDLER =================
function handleFileUpload(file){

  if(!file){
    alert("No file selected");
    return;
  }

  const name = file.name.toLowerCase();

  if(name.endsWith(".csv")){
    openCSVLoader(file);
  }
  else if(name.endsWith(".xlsx")){
    openExcelLoader(file);
  }
  else{
    alert("❌ Unsupported file");
  }
}


// 🔥 GLOBAL ACCESS FIX
window.handleFileUpload = handleFileUpload;


function clearCSVFile(){

  // 🔥 clear dataset
  window.analysisDataset = [];
  localStorage.removeItem("analysisDataset");

  // 🔥 reset index
  window.analysisIndex = 0;

  // 🔥 hide icon
  const removeBtn = document.getElementById("removeCSVBtn");
  if(removeBtn) removeBtn.style.display = "none";

  // 🔥 reset input
  const input = document.getElementById("analysisFile");
  if(input){
    input.value = "";
    input.title = "";
  }

  // 🔥 switch to simulation
  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
  settings.systemMode = "simulation";
  localStorage.setItem("micropmu_settings", JSON.stringify(settings));

  showToast("🗑 CSV Removed");

}




function updateConnectBtn(){
  const btn = document.querySelector(".connect-btn");
  if(!btn) return;

  btn.innerText = window.espConnected 
    ? "✅ Connected" 
    : "🔌 Connect ESP";
}

// 🔥 CONTINUOUS ESP FETCH LOOP
setInterval(() => {
  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");

  if(settings.systemMode === "esp"){
    fetchESPData();
  }
}, 1000); // 1 sec

function saveIP(ip){
  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
  settings.deviceIP = ip;
  localStorage.setItem("micropmu_settings", JSON.stringify(settings));
}


// 🔥 SAFE DIRECT IP CHECK (FIXED)
async function checkDirectIP(){

  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
  const directIP = settings.deviceIP;

  if(!directIP) return null;

  try{
    const res = await fetch(`http://${directIP}/data`);

    if(res.ok){
      return directIP;
    }

  }catch(e){
    console.warn("Direct IP failed");
  }

  return null;
}