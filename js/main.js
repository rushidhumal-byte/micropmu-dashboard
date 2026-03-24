/*********************************
 MICRO-PMU CORE ENGINE (STABLE)
**********************************/

/* ================= GLOBAL STATE ================= */
/* ===== FINAL SYSTEM LIMITS ===== */
const deviceId = localStorage.getItem("deviceId") || ("dev_" + Math.random().toString(36).substr(2, 9));
localStorage.setItem("deviceId", deviceId);
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
let phaseAngle = 0;
let energy = 0;
let lastEnergyTime = Date.now();
let isFetching = false;


let buzzerMuted = false;
let buzzerPlaying = false;

let systemMode = "simulation";   // simulation | esp | hybrid
let samplingTimer = null;
let connectedDevices = 1;
let isAdminDevice = false;
let analysisIndex = 0;
let faultDuration = 0;
let faultStart = 0;
let activeFaultType = "NORMAL";
let faultHoldTime = 0;
let faultTimer = 0;
let faultCooldown = 0;
let lastFaultEnd = 0;
let accessMode = "";
  let attemptsLeft = 3;
  let energyCharge = 0;
  let breakdown = [];

// ===== ML HISTORY + DYNAMIC LIMITS =====
let history = [];

let dynamicLimits = {
  voltMin: 210,
  voltMax: 240,
  currentMax: 10,
  pfMin: 0.85,
  tempMax: 60
};


// ===== EVENT TIMELINE STATE =====
let lastStatus = "SYSTEM HEALTHY";
let faultStartTime = null;
let activeFault = null;



  window.showAccessPopup = function(mode) {

    accessMode = mode;
    attemptsLeft = 3;

    const popup = document.getElementById("accessPopup");
if (!popup) return;

popup.style.display = "flex";
    document.getElementById("accessPass").value = "";

    document.getElementById("accessModeText").innerText =
      mode === "mirror" ? "🔁 Sync Mode Access" : "☁ Cloud Mode Access";

    document.getElementById("attemptInfo").innerText = "Attempts left: 3";

    setTimeout(() => {
      document.getElementById("accessPopup").style.opacity = "1";
    }, 10);

    setTimeout(() => {
      document.getElementById("accessPass")?.focus();
    }, 200);
  }


 window.submitAccess = function() {

    const input = document.getElementById("accessPass").value;
    const ACCESS_KEY = btoa("Rushii");

    if (btoa(input) === ACCESS_KEY) {

      if (accessMode === "mirror") {
        sessionStorage.setItem("syncVerified", "true");
      }
      else if (accessMode === "remote") {
        sessionStorage.setItem("cloudVerified", "true");
      }

      const popup = document.getElementById("accessPopup");
      popup.style.display = "none";
      popup.style.opacity = "0";

      return;
    }

    attemptsLeft--;

    if (attemptsLeft > 0) {
      document.getElementById("attemptInfo").innerText =
        "Attempts left: " + attemptsLeft;
      alert("❌ Wrong Password");
    }
    else {
      document.body.innerHTML =
        "<h2 style='text-align:center;margin-top:100px'>⛔ Access Denied</h2>";
    }
  }

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
 BUZZER SYSTEM
*********************************/

const buzzer = new Audio("buzzer.mp3");
buzzer.loop = true;


/* ================= BUZZER BUTTON ================= */

function toggleBuzzerMute() {

  const icon = document.getElementById("buzzerBox");

  buzzerMuted = !buzzerMuted;

  if (buzzerMuted) {

    // stop sound instantly
    buzzer.pause();
    buzzer.currentTime = 0;
    buzzerPlaying = false;

    if (icon) {
      icon.innerText = "🔕";
      icon.classList.add("buzzer-muted");
    }

  }
  else {

    if (icon) {
      icon.innerText = "🔊";
      icon.classList.remove("buzzer-muted");
    }

    // resume alarm only if fault
    if (evaluateStatus() !== "SYSTEM HEALTHY") {
      playBuzzer();
    }

  }

}


/* ================= PLAY BUZZER ================= */

function playBuzzer() {

  if (buzzerMuted) return;

  if (!buzzerPlaying) {

    buzzer.play().catch(() => { });
    buzzerPlaying = true;

  }

}


/* ================= STOP BUZZER ================= */

function stopBuzzer() {

  buzzer.pause();
  buzzer.currentTime = 0;
  buzzerPlaying = false;

}

/* Unlock audio once */
document.addEventListener("click", function enableAudio() {
  buzzer.play().then(() => {
    buzzer.pause();
    buzzer.currentTime = 0;
  }).catch(() => { });
  document.removeEventListener("click", enableAudio);
});

/* ================= RANDOM CONTROL ================= */

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function applyFault(type) {

  switch (type) {

    case "NORMAL":
      voltage = random(220, 235);
      current = parseFloat((Math.random() * 3 + 1).toFixed(2));
      frequency = parseFloat((49.9 + Math.random() * 0.2).toFixed(2));
      pf = parseFloat((0.92 + Math.random() * 0.06).toFixed(2));
      temperature = parseFloat((30 + Math.random() * 10).toFixed(1));
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
}

/* ================= SETTINGS ================= */

function getSettings() {
  return JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
}
/* ================= STATUS ENGINE ================= */

function evaluateStatus() {

  const sensitivity = getSettings().alarmSensitivity || "medium";

  let overloadLimit = LIMITS.OVERLOAD_CURRENT;

  if (sensitivity === "low") overloadLimit += 2;
  if (sensitivity === "high") overloadLimit -= 2;

  // ===== ALL FAULTS COLLECT =====
  const faults = [];

  if (current >= LIMITS.SHORT_CURRENT)
    faults.push("SHORT CIRCUIT");

  if (current >= overloadLimit)
    faults.push("OVERLOAD");

  if (voltage < LIMITS.VOLT_MIN)
    faults.push("LOW VOLTAGE");

  if (voltage >= LIMITS.VOLT_MIN && voltage < LIMITS.VOLT_WARN)
    faults.push("WARNING");

  if (voltage > LIMITS.VOLT_MAX)
    faults.push("OVER VOLTAGE");

  if (pf < LIMITS.PF_MIN)
    faults.push("LOW POWER FACTOR");

  if (frequency < LIMITS.FREQ_MIN || frequency > LIMITS.FREQ_MAX)
    faults.push("FREQUENCY FAULT");

  if (temperature > LIMITS.TEMP_MAX)
    faults.push("OVER TEMPERATURE");

  if (current > 8 && current < LIMITS.OVERLOAD_CURRENT)
    faults.push("HIGH CURRENT");

  if (frequency < 49)
    faults.push("UNDER FREQUENCY");

  if (frequency > 51)
    faults.push("OVER FREQUENCY");

  // ===== PRIORITY ORDER (MOST IMPORTANT) =====
  const priority = [
    "SHORT CIRCUIT",
    "OVERLOAD",
    "OVER VOLTAGE",
    "LOW VOLTAGE",
    "FREQUENCY FAULT",
    "OVER TEMPERATURE",
    "LOW POWER FACTOR",
    "WARNING"
  ];

  // ===== RETURN HIGHEST PRIORITY FAULT =====
  for (let p of priority) {
    if (faults.includes(p)) {
      return p;
    }
  }

  return "SYSTEM HEALTHY";
}
/*********************************
 EVENT TIMELINE ENGINE
*********************************/

function trackTimeline() {

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

    if (systemMode === "esp") {
      el.innerText = "ESP Mode";
    }
    else if (systemMode === "hybrid") {
      el.innerText = "Hybrid Mode";
    }
    else {
      el.innerText = "Simulation";
    }
  });


// limit size (important)
if(history.length > 30){
  history.shift();
}

}
/* ==================================================== */
/* ================= DASHBOARD UPDATE ================= */
/* ==================================================== */
function updateDashboard(forcedStatus = null) {

    let level = "NORMAL";
    let color = "#22c55e";

  const status = forcedStatus || evaluateStatus();

// ===== AI HISTORY UPDATE (FIXED) =====
history.push({
  voltage,
  current,
  frequency,
  pf,
  temperature
});

if(history.length > 30){
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
    if (systemMode === "esp") liveModeEl.innerText = "ESP Mode";
    else if (systemMode === "hybrid") liveModeEl.innerText = "Hybrid Mode";
    else liveModeEl.innerText = "Simulation";
  }

  // ===== VALUES =====
  if (document.getElementById("v")) {
    document.getElementById("v").innerText = voltage + " V";
    document.getElementById("c").innerText = current + " A";
    document.getElementById("f").innerText = frequency + " Hz";
    document.getElementById("p").innerText = power + " W";
    document.getElementById("pfVal").innerText = pf.toFixed(2);

    const pfPerf = document.getElementById("pfPerf");
    if (pfPerf) {
      pfPerf.innerText = pf;
    }

    document.getElementById("temp").innerText = temperature.toFixed(1) + " °C";
  }

  // ===== PERFORMANCE =====
  const phaseEl = document.getElementById("phaseAngleVal");
  if (phaseEl) {
    phaseEl.innerText = phaseAngle + "°";
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

    if (current < 20) {
      level = "CRITICAL";
      color = "#f97316";
    }
    else if (current < 35) {
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
    trackTimeline();

    if (!window._timelineUIThrottle) {
      window._timelineUIThrottle = true;

      setTimeout(() => {
        updateTimelineUI();
        window._timelineUIThrottle = false;
      }, 2000);
    }
   
  }
/************* AI BUTTON + INIT *******************/
document.addEventListener("DOMContentLoaded", () => {

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
      aiBtn.style.background = "#ef4444"; // red (fault)
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
    const rate = parseInt(settings.samplingRate) || 1000;

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


    // ✅ fault timer engine
    setInterval(() => {

      const ft = document.getElementById("faultTimeNew");
      const fd = document.getElementById("faultDurationNew");

      if (!ft || !fd) return;

      if (faultStartTime) {

        const diffMs = new Date() - faultStartTime;

        const seconds = Math.floor(diffMs / 1000);
        const ms = diffMs % 1000;

        ft.innerText = faultStartTime.toLocaleTimeString();
        fd.innerText = `${seconds}s ${ms.toString().padStart(3, '0')}ms`;

      } else {

        ft.innerText = "--";
        fd.innerText = "0s 0ms";
      }

    }, 100);



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
            tension: 0.3
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
  const cy = h / 2;
  const radius = 100;

  ctx.clearRect(0, 0, w, h);

  // circle
  ctx.strokeStyle = "#334155";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // voltage reference (red)
  ctx.strokeStyle = "#f62727";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.stroke();

  // current phasor (green)
  const angle = phaseAngle * Math.PI / 180;

  ctx.strokeStyle = "#26f50e";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + radius * Math.cos(angle), cy - radius * Math.sin(angle));
  ctx.stroke();
};

  setInterval(updateWiFiStatus, 2000);


  /* ================= GLOBAL GRAPH UPDATE ================= */

  function startGraphEngine() {

  if (graphTimer) clearInterval(graphTimer);

  const settings = getSettings();

  // 🔥 AUTO REFRESH OFF
  if (settings.autoRefresh === "off") {
    console.log("Graph Auto Refresh OFF");
    return;
  }

  graphTimer = setInterval(() => {

    /* ===== Dashboard ===== */
    if (dashboardCharts.voltage) {
      pushData(dashboardCharts.voltage, voltage);
      pushData(dashboardCharts.current, current);
    }

    /* ===== Live ===== */
    if (liveCharts.liveVoltage) {
      pushData(liveCharts.liveVoltage, voltage);
      pushData(liveCharts.liveCurrent, current);
      pushData(liveCharts.liveFrequency, frequency);
      pushData(liveCharts.livePower, power);
    }

    /* ===== Performance ===== */
    if (performanceCharts.phaseAngle) {

      let loadKW = parseFloat((voltage * current * pf / 1000).toFixed(2));
      let efficiency = Math.floor(pf * 100);

      pushData(performanceCharts.phaseAngle, phaseAngle);
      pushData(performanceCharts.load, loadKW);

      energy += loadKW / 3600;
      pushData(performanceCharts.energy, energy);

      pushData(performanceCharts.eff, efficiency);

      if (document.getElementById("load")) {
        document.getElementById("load").innerText = loadKW + " kW";
      }

      if (document.getElementById("energy")) {
        document.getElementById("energy").innerText = energy.toFixed(3) + " kWh";
      }

      if (document.getElementById("efficiency")) {
        document.getElementById("efficiency").innerText = efficiency + " %";
      }
    }

    drawPhasor();

  }, parseInt(settings.samplingRate) || 1000);
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

  function startLogger() {

  if (logTimer) clearInterval(logTimer);

  const settings = getSettings();
  const value = parseInt(settings.logValue) || 1;
  const unit = settings.logUnit || "sec";

  let interval = 1000;

  if(unit === "sec") interval = value * 1000;
  else if(unit === "min") interval = value * 60000;
  else if(unit === "hr") interval = value * 3600000;

  logTimer = setInterval(() => {

    let logs = JSON.parse(localStorage.getItem("micropmu_logs") || "[]");

    logs.push({
      timestamp: new Date().toISOString(),
      voltage,
      current,
      frequency,
      power,
      pf,
      phaseAngle,
      temperature,
      status: evaluateStatus()
    });

    // 🔥 LIMIT (SAFE)
    if (logs.length > 5000) logs.shift();

    // 🔥 SAVE OPTIMIZED
    if (logs.length % 5 === 0) {
      localStorage.setItem("micropmu_logs", JSON.stringify(logs));
    }

  }, interval);
}

  function showStorageWarning(){

  let popup = document.getElementById("storagePopup");

  if(!popup){
    popup = document.createElement("div");
    popup.id = "storagePopup";

    popup.style.position = "fixed";
    popup.style.top = "20px";
    popup.style.right = "20px";
    popup.style.background = "#dc2626";
    popup.style.color = "#fff";
    popup.style.padding = "12px 18px";
    popup.style.borderRadius = "10px";
    popup.style.fontWeight = "600";
    popup.style.zIndex = "9999";
    popup.style.animation = "blink 1s infinite";

    popup.innerText = "⚠ SYSTEM STORAGE GETTING FULL";

    document.body.appendChild(popup);
  }
}

  function loadSettings() {

    const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");

    Object.entries(settings).forEach(([key, value]) => {

      const el = document.getElementById(key);

      if (el) {
        if (el.type === "checkbox") {
          el.checked = value === "on" || value === true;
        } else {
          el.value = value;
          
        }

      }

    });

  }

  window.addEventListener("load", () => {

    loadSettings();

    applyProtectionSettings();   // ✅ ADD THIS

    applyModeFromSettings();     // ✅ ADD THIS

    startSampling();
    startLogger();

    initDashboardCharts();
    initLiveCharts();
    initPerformanceCharts();

    startGraphEngine();

  });

  /********************
   Update Timeline
  ***********************/
  function updateTimelineUI() {

    const container = document.getElementById("timelineList");
    if (!container) return;

    let timeline = JSON.parse(localStorage.getItem("micropmu_timeline") || "[]");

    container.innerHTML = "";

    timeline.slice().reverse().forEach(e => {

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
   MEMORY USAGE MONITOR
  **********************************/

 function updateMemoryUsage() {

  if (!document.getElementById("memoryBar")) return;

  const logs = JSON.parse(localStorage.getItem("micropmu_logs") || "[]");

  const jsonString = JSON.stringify(logs);
  const usedBytes = new TextEncoder().encode(jsonString).length;

  // ✅ FIX (order correct)
  const maxBytes = 4.5 * 1024 * 1024;

  let percent = ((usedBytes / maxBytes) * 100);
  percent = Math.min(percent, 100);

  const bar = document.getElementById("memoryBar");
  const text = document.getElementById("memoryText");
  const container = bar.parentElement;

  bar.style.width = percent + "%";
  text.innerText = percent.toFixed(1) + "%";


    // ================= COLOR LOGIC =================
    if (percent < 25) {
      bar.style.background = "#4ade80";  // light green
      container.style.border = "2px solid #4ade80";
    }
    else if (percent < 50) {
      bar.style.background = "#22c55e";  // dark green
      container.style.border = "2px solid #22c55e";
    }
    else if (percent < 70) {
      bar.style.background = "#f97316";  // orange
      container.style.border = "2px solid #f97316";
    }
    else if (percent < 95) {
      bar.style.background = "#dc2626";  // dark red
      container.style.border = "2px solid #dc2626";
    }

    // ================= ALERT (95%) =================
    if (percent >= 95 && percent < 98) {

      if (!window._memWarned) {
       showStorageWarning();
       playBuzzer();
        window._memWarned = true;
      }
    }

    // ================= AUTO RESET (98%) =================
    if (percent >= 98) {

      alert("🚨 Storage Critical! Auto Resetting Logs...");

      localStorage.removeItem("micropmu_logs");
      bar.style.width = "0%";
      text.innerText = "0%";

      stopBuzzer();
      window._memWarned = false;

      const popup = document.getElementById("storagePopup");
      if(popup) popup.remove();

    }

  }

  setInterval(updateMemoryUsage, 2000);


  /*********************************
   ADVANCED EXPORT CSV (FIXED)
  **********************************/

 function exportCSV(){

  const logs = JSON.parse(localStorage.getItem("micropmu_logs") || "[]");
  const btn = event.target;
  btn.innerText = "⏳ Exporting...";

  setTimeout(()=>{
    // existing export code
    btn.innerText = "⬇ Export Advanced CSV";
  },500);


    // Get filters safely
    const startDate = document.getElementById("startDate")?.value;
    const endDate = document.getElementById("endDate")?.value;
    const mode = document.getElementById("exportMode")?.value || "full";
    const param = document.getElementById("paramSelect")?.value || "all";
    const compareA = document.getElementById("compareA")?.value || "";
    const compareB = document.getElementById("compareB")?.value || "";

    // ===== Date Filtering =====
    let filtered = logs.filter(l => {

      let logDate = new Date(l.timestamp);
      let keep = true;

      if (startDate) {
        keep = keep && (logDate >= new Date(startDate));
      }

      if (endDate) {
        let end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        keep = keep && (logDate <= end);
      }

      if (mode === "fault") {
        keep = keep && (l.status !== "SYSTEM HEALTHY");
      }
      
      if(!startDate && !endDate){
  console.warn("No date filter applied");
}

      return keep;
    });

    if (filtered.length === 0) {
      alert("No Records Match Filters");
      return;
    }

    // ===== Build Header =====
    let header = ["Timestamp"];

    if (param === "all") {
      header.push("Voltage", "Current", "Frequency", "Power", "PF", "PhaseAngle", "Temperature", "Status");
    } else {
      header.push(param.charAt(0).toUpperCase() + param.slice(1));
    }

    if (compareA && compareB) {
      header.push(compareA.toUpperCase() + " vs " + compareB.toUpperCase());
    }

    let csv = header.join(",") + "\n";

    // ===== Build Rows =====
    filtered.forEach(l => {

      let row = [l.timestamp];

      if (param === "all") {
        row.push(
          l.voltage,
          l.current,
          l.frequency,
          l.power,
          l.pf,
          l.phaseAngle,
          l.temperature,
          l.status
        );
      } else {
        row.push(l[param]);
      }

      if (compareA && compareB) {
        row.push(`${l[compareA]} | ${l[compareB]}`);
      }

      csv += row.join(",") + "\n";
    });

    // ===== Download =====
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "MicroPMU_Advanced_Report.csv";
    a.click();
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
      alert("No Data Available");
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

    if(filtered.length === 0){
      alert("No Data in selected range");
      return;
    }

    // CLEAR
    allCharts.forEach(c=>{
      c.data.labels = [];
      c.data.datasets[0].data = [];
    });

    let energyCalc = 0;

    // FILL DATA
    filtered.forEach(log => {

      const time = new Date(log.timestamp).toLocaleTimeString();

      ctxV.data.labels.push(time);
      ctxV.data.datasets[0].data.push(log.voltage || 0);

      ctxC.data.labels.push(time);
      ctxC.data.datasets[0].data.push(log.current || 0);

      ctxP.data.labels.push(time);
      ctxP.data.datasets[0].data.push(log.power || 0);

      ctxPF.data.labels.push(time);
      ctxPF.data.datasets[0].data.push(log.pf || 0);

      // NEW FIX 🔥
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

  function startFirebaseSync() {

    if (firebaseListenerStarted) return;

    try {

      const db = firebase.database();
      const ref = db.ref("micropmu/live");

      ref.on("value", (snapshot) => {

        const data = snapshot.val();
        if (!data) return;

        const start = performance.now();

        let newV = parseFloat(data.voltage) || 0;
        let newI = parseFloat(data.current) || 0;
        let newF = parseFloat(data.frequency) || 50;
        let newPF = parseFloat(data.pf) || 0.95;
        let newTemp = parseFloat(data.temperature) || 0;

        // 🔥 ULTRA SMOOTH FILTER (FAST RESPONSE)
        const alpha = 0.4;

        voltage = voltage * (1 - alpha) + newV * alpha;
        current = current * (1 - alpha) + newI * alpha;

        frequency = newF;
        pf = Math.min(Math.max(newPF, 0), 1);
        temperature = newTemp;

        power = parseFloat((voltage * current * pf).toFixed(2));

        // ⚡ ENERGY CALCULATION
        let now = Date.now();
        let hours = (now - lastEnergyTime) / 3600000;

        energy = parseFloat((energy + (power / 1000) * hours).toFixed(4));
        lastEnergyTime = now;

        phaseAngle = parseFloat((Math.acos(pf) * 180 / Math.PI).toFixed(1));

        espConnected = true;

        const end = performance.now();
        espLatency = Math.round(end - start);

        updateDashboard();
        updateWiFiStatus();
        updateSyncStatus();

      });

      firebaseListenerStarted = true;

      console.log("🔥 Firebase Ultra Sync Started");

    } catch (e) {

      console.error("Firebase Sync Error:", e);
    }
  }

  /*********************************
   WIFI STATUS ENGINE
  *********************************/

  function updateWiFiStatus() {

    const led = document.getElementById("wifiLed");
    const bars = document.querySelectorAll("#signalBars .bar");
    const latencyText = document.getElementById("wifiLatency");

    if (!led || !latencyText) return;

    const latency = espLatency;

    latencyText.innerText = latency + " ms";

    bars.forEach(b => b.style.background = "#1e293b");

    if (latency < 40) {
      led.style.background = "#22c55e";

      bars[0].style.background = "#22c55e";
      bars[1].style.background = "#22c55e";
      bars[2].style.background = "#22c55e";
      bars[3].style.background = "#22c55e";
    }
    else if (latency < 80) {

      led.style.background = "#facc15";

      bars[0].style.background = "#facc15";
      bars[1].style.background = "#facc15";
      bars[2].style.background = "#facc15";
    }
    else {

      led.style.background = "#ef4444";

      bars[0].style.background = "#ef4444";
    }
  }

  /*********************************
   SYNC STATUS ENGINE
  *********************************/

  function updateSyncStatus() {

    const el = document.getElementById("syncStatus");
    if (!el) return;

    if (systemMode === "esp" && espConnected)
      el.innerHTML = "<span style='color:#22c55e'>● Connected</span>";

    else if (systemMode === "esp")
      el.innerHTML = "<span style='color:#f97316'>● Searching</span>";

    else
      el.innerHTML = "<span style='color:#94a3b8'>● Simulation</span>";
  }

  /* =====Test ESP Connection ===== */
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

    const ip = settings.deviceIP || "192.168.4.1";

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
        systemMode === "esp" ? "ESP Live Data" : "Simulation";
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
          status: evaluateStatus(),
          timestamp: Date.now()
        });

      }, parseInt(getSettings().samplingRate) || 1000);

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

        updateDashboard();

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

      if (input.value === "Rushii") {
        sessionStorage.setItem("adminVerified", "true");
        alert("✅Admin Verified Successfully");
        input.value = "";
      } else {
        alert("Wrong Password");
      }
    };

    /* ================= RESET ENERGY ================= */

    window.secureResetEnergy = function () {

      if (sessionStorage.getItem("adminVerified") !== "true") {
        alert("⚠ Verify Admin First");
        return;
      }

      localStorage.removeItem("micropmu_energy");
      alert("Energy Counter Reset");
    };

    /* ================= CLEAR LOGS ================= */

    window.secureClearLogs = function () {

      if (sessionStorage.getItem("adminVerified") !== "true") {
        alert("⚠ Verify Admin First");
        return;
      }

      localStorage.removeItem("micropmu_logs");
      alert("Logs Cleared");
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
      QR ENGINE
    *********************************/

    /*********************************
 SMART LINK GENERATOR (FINAL FIX)
*********************************/

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

    alert("✅ QR Generated Successfully");
  };

  document.head.appendChild(script);
};
  })();


  function getRandomFaultDuration() {
    return Math.floor(Math.random() * 3000) + 1000;
    // 🔥 1s to 4s realistic fault duration
  }

  function updateSystem() {

   
  const settings = getSettings();
  const mode = settings.systemMode || "simulation";

  // ===== ESP MODE =====
  if (mode === "esp") {
    updateDashboard();
    return;
  }

  // ===== HYBRID MODE =====
  if (mode === "hybrid") {

    if (!window.analysisDataset || window.analysisDataset.length === 0) {
      console.warn("No CSV dataset");
      return;
    }

    const d = window.analysisDataset[analysisIndex];

    voltage = d.voltage || 0;
    current = d.current || 0;
    frequency = d.frequency || 50;
    pf = d.pf || 0.95;
    power = d.power || 0;

    temperature = 35;
    phaseAngle = parseFloat((Math.acos(pf) * 180 / Math.PI).toFixed(1));

    analysisIndex++;

    if (analysisIndex >= window.analysisDataset.length) {
      analysisIndex = 0;
    }

    updateDashboard();
    return;
  }

  
    // ================= SIMULATION =================

      const now = Date.now();

      // ===== CONTINUE SAME EVENT =====
      if ((now - faultStart) < faultHoldTime) {
        faultHoldTime = Math.floor(Math.random() * 5000) + 100; 
// 👉 100ms to 5 sec (ultra realistic)

        applyFault(activeFaultType);

      }
      else {

        // ===== REALISTIC GRID ENGINE =====
        const event = random(1, 100);

        // BASE SYSTEM
        let baseVoltage = random(225, 235);
        let basePF = parseFloat((0.94 + Math.random() * 0.04).toFixed(2));
        let baseFreq = 50 + (Math.random() - 0.5) * 0.02;
            baseFreq = parseFloat(baseFreq.toFixed(2));
        let loadKW = parseFloat((Math.random() * 2 + 1).toFixed(2));

        // ===== CLEAN NUMBERS =====
        pf = parseFloat(pf.toFixed(2));
        current = parseFloat(current.toFixed(2));
        voltage = parseFloat(voltage.toFixed(1));
        temperature = parseFloat(temperature.toFixed(1));
        frequency = parseFloat(frequency.toFixed(2));

        // ===== TEMP LIMIT =====
        temperature = Math.min(temperature, 60);
        temperature = Math.max(28, temperature);

        // INITIAL
        voltage = baseVoltage;
        pf = basePF;
        frequency = baseFreq;

        
        // SMOOTH CURRENT 🔥
        // ===== ULTRA STABLE CURRENT =====
           let targetCurrent = (loadKW * 1000) / (voltage * pf);

        // smoothing (real load inertia)
           current = current * 0.85 + targetCurrent * 0.15;

        // avoid zero / garbage values
           if (current < 0.05) current = 0;

          current = parseFloat(current.toFixed(2));

        // SMOOTH TEMPERATURE 🔥
         // ===== REALISTIC TEMPERATURE (ULTRA STABLE) 🔥
            // ===== INDUSTRY LEVEL TEMP MODEL 🔥
              let ambient = 28;
              let heating = current * 1.5;

          // very slow thermal inertia
              let targetTemp = ambient + heating;
            
           
          // very slow thermal response (real transformer behavior)
            temperature = temperature * 0.95 + targetTemp * 0.05;

          // clamp
              temperature = Math.max(28, Math.min(temperature, 60));

          // clean
              temperature = parseFloat(temperature.toFixed(1));


        // limit range (no crazy jumps)
            temperature = Math.max(28, Math.min(temperature, 60));

        // clean display
            temperature = parseFloat(temperature.toFixed(1));

        // ===== PF LOCK + CLEAN =====
             pf = Math.min(Math.max(pf, 0.7), 1);
             pf = parseFloat(pf.toFixed(2));    
        

        
        // ===== FAULT INJECTION (70% NORMAL / 30% FAULT) =====
         if (event <= 70) {
        // NORMAL (70%)
         }

          else if (event <= 78) {   // 8%
           voltage = random(180, 208);
           current = parseFloat((loadKW * 1000 / (voltage * pf)).toFixed(2)) + 1;
           temperature += 5;
           }

          else if (event <= 84) {   // 6%
           voltage = random(240, 255);
           current = parseFloat((loadKW * 1000 / (voltage * pf)).toFixed(2)) - 0.5;
           }

           else if (event <= 89) {   // 5%
           current = random(8, 10);
           voltage -= 5;
           temperature += 8;
           }

           else if (event <= 93) {   // 4%
           current = random(11, 14);
           voltage -= 10;
           pf -= 0.05;
           temperature += 15;
           }

           else if (event <= 96) {   // 3%
           pf = parseFloat((0.6 + Math.random() * 0.15).toFixed(2));
           current = parseFloat((loadKW * 1000 / (voltage * pf)).toFixed(2)) + 2;
           temperature += 10;
           }

           else if (event <= 98) {   // 2%
           frequency = random(47, 48.8);
           voltage -= 5;
           current += 1;
           }

           else if (event <= 99) {   // 1%
           frequency = random(50, 51.1);
           voltage += 1;
           current -= 0.5;
           }

           else {                    // 1% 🔥 SHORT CIRCUIT (RARE)
           voltage = random(180, 210);

           const scLevel = random(1, 3);

            if (scLevel === 1) current = random(15, 20);
              else if (scLevel === 2) current = random(20, 35);
               else current = random(35, 50);

             pf = 0.6;
             temperature += 20;
              }

  
          // PF LIMIT + FORMAT (ADD HERE 🔥)
           pf = Math.min(Math.max(pf, 0), 1);
           pf = parseFloat(pf.toFixed(2));

           power = parseFloat((voltage * current * pf).toFixed(1));
           phaseAngle = parseFloat((Math.acos(pf) * 180 / Math.PI).toFixed(1));

        // 🔥 NO FORCED STATUS
      


        updateDashboard();
      }
    }

    
    // ===== FAULT TIMER TRACK =====
    const currentStatus = evaluateStatus();

    if (currentStatus !== "SYSTEM HEALTHY") {

      if (!faultStartTime) {
        faultStartTime = new Date();
      }

    } else {

      setTimeout(() => {
        if (evaluateStatus() === "SYSTEM HEALTHY") {
          faultStartTime = null;
        }
      }, 200);
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
        logUnit: getVal("logUnit")

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

      if (typeof updateDashboard === "function") updateDashboard();

      applyProtectionSettings();
      applyModeFromSettings();
      updateSystemModeUI();
      updateDashboard();   // 🔥 IMPORTANT
      alert("✅ Settings Saved Successfully");

    } catch (e) {

      console.error("Settings Error:", e);
      alert("❌ Error Saving Settings");

    }

  };



//***************BILL CALCULATION ****************************//

  window.calculateBill = function () {
    breakdown = [];

  let load = parseFloat(document.getElementById("calcPower")?.value);
  const pf = parseFloat(document.getElementById("calcPF")?.value);
  const hours = parseFloat(document.getElementById("calcHours")?.value);

  const tariffType = document.getElementById("consumerType")?.value || "res";
  const tariff = parseFloat(document.getElementById("tariff")?.value);

  const gstPercent = parseFloat(document.getElementById("gstInput")?.value) || 0;
  const dutyPercent = parseFloat(document.getElementById("dutyInput")?.value) || 0;

  const supplyPhase = document.getElementById("supplyPhase")?.value || "1";
  const supplyType = document.getElementById("supplyType")?.value || "LT";

  const loadType = document.getElementById("loadType")?.value || "kW";
  const fixedCharge = parseFloat(document.getElementById("fixedCharge")?.value) || 0;

  const mode = document.getElementById("billingMode")?.value || "daily";


// ===== SMART VALIDATION =====

if(isNaN(load)){
  alert("⚠ Please enter Load");
  document.getElementById("calcPower").focus();
  return;
}

if(isNaN(hours)){
  alert("⚠ Please enter Usage Hours");
  document.getElementById("calcHours").focus();
  return;
}

if(loadType === "kVA" && isNaN(pf)){
  alert("⚠ Please enter Power Factor");
  document.getElementById("calcPF").focus();
  return;
}

if(load <= 0){
  alert("⚠ Load must be greater than 0");
  return;
}

if(hours <= 0){
  alert("⚠ Hours must be greater than 0");
  return;
}

if(loadType === "kVA" && (pf <= 0 || pf > 1)){
  alert("⚠ Power Factor must be between 0–1");
  return;
}

// 🔥 NEW: TARIFF VALIDATION (ONLY FOR CUSTOM MODE)
if(tariffType !== "res" && isNaN(tariff)){
  alert("⚠ Please enter Tariff (₹/kWh)");
  document.getElementById("tariff").focus();
  return;
}

if(tariffType !== "res" && tariff <= 0){
  alert("⚠ Tariff must be greater than 0");
  return;
}


// 🔥 Auto fix if user entered big value (assume W)
if(loadType === "kW" && load > 100){
  load = load / 1000;
}

let units = 0;
let loadKW = 0;

// 🔥 Convert all inputs to kW (standard)
if(loadType === "W"){
  loadKW = load / 1000;
}
else if(loadType === "kVA"){
  loadKW = load * pf;
}
else{
  loadKW = load; // already kW
}

// 🔥 Smart safety (optional but useful)
if(loadKW > 100){
  console.warn("⚠ High load detected:", loadKW, "kW");
}

// 🔥 Units calculation
if(mode === "daily"){
  units = loadKW * hours;
}
else{
  units = loadKW * hours * 30;
}

// 🔥 Round off
units = Number(units.toFixed(2));

// 🔥 Debug (remove later if needed)
console.log("Load (kW):", loadKW);
console.log("Units:", units);


  if (tariffType === "res") {

    function slabCalc(u, slabs) {
      let remaining = u;
      let total = 0;

      slabs.forEach(s => {
        if (remaining > 0) {
          const used = Math.min(remaining, s.limit);
          const cost = used * s.rate;

          breakdown.push(`${used.toFixed(0)} × ₹${s.rate} = ₹${cost.toFixed(2)}`);
          total += cost;
          remaining -= used;
        }
      });

      return total;
    }

    energyCharge = slabCalc(units, [
      { limit: 100, rate: 4.43 },
      { limit: 200, rate: 9.64 },
      { limit: 200, rate: 12.83 },
      { limit: Infinity, rate: 14.33 }
    ]);

  } else {

    if(isNaN(tariff)){
      alert("⚠ Enter Tariff");
      return;
    }

    energyCharge = units * tariff;
    breakdown.push(`${units.toFixed(0)} × ₹${tariff} = ₹${energyCharge.toFixed(2)}`);
  }

  const electricityDuty = energyCharge * (dutyPercent / 100);
  const gst = (energyCharge + fixedCharge) * (gstPercent / 100);

  const totalBill = energyCharge + fixedCharge + electricityDuty + gst;

  document.getElementById("unitResult").innerText =
    units.toFixed(2) + " kWh";

  document.getElementById("billResult").innerText =
    "₹ " + totalBill.toFixed(2);

    document.getElementById("energyResult").innerText =
  "₹ " + energyCharge.toFixed(2);

document.getElementById("gstResult").innerText =
  "₹ " + gst.toFixed(2);

  const breakdownEl = document.getElementById("billBreakdown");
  if(breakdownEl){
    breakdownEl.innerText =
      `Energy: ₹${energyCharge.toFixed(2)} | Fixed: ₹${fixedCharge.toFixed(2)} | GST: ₹${gst.toFixed(2)} | Duty: ₹${electricityDuty.toFixed(2)}`;
  }

  window._billData = {
    tariffType,
    units,
    energyCharge,
    fixedCharge,
    gst,
    electricityDuty,
    totalBill,
    breakdown,
    supplyPhase,
    supplyType,
    loadType,
    mode
  };

  
  }
// INITIAL TYPE

//*********DOWNLOAD BILL********************** */

window.downloadBill = function () {

  const gstPercent = parseFloat(document.getElementById("gstInput")?.value) || 0;
  const dutyPercent = parseFloat(document.getElementById("dutyInput")?.value) || 0;

  if (!window._billData) { 
    alert("⚠ Please calculate bill first"); 
    return; 
  }

  const d = window._billData;   // 🔥 FIRST DEFINE THIS

  const billNumber = "BILL-" + Date.now();
  const billingDate = new Date().toLocaleDateString();

  const consumerLabel = d.tariffType === "res" ? "Residential" : "Commercial";
  const phaseLabel = d.supplyPhase === "3" ? "Three Phase" : "Single Phase";

  function safe(val){
    return val !== undefined ? Number(val).toFixed(2) : "0.00";
  }

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
  max-width:800px;
  margin:auto;
  border:2px solid #000;
  padding:20px;
}

.header{
  display:flex;
  align-items:center;
  justify-content:space-between;
}

.logo{
  width:70px;
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
  margin-top:10px;
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

.ai-box{
  background:#f0f8ff;
  padding:10px;
  border-left:4px solid #2196f3;
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
<div class="header">
<img src="Assest/msedcl_logo.png" class="logo">

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
<td>₹${(b.split("₹")[1] || "0")}</td>
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
• Estimated Daily Usage: ${(d.units/30).toFixed(1)} kWh/day<br>
• Cost per Unit: ₹${d.units ? (d.totalBill/d.units).toFixed(2) : "0.00"}
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

  const element = document.createElement("div");
  element.innerHTML = html;

document.body.appendChild(element);

html2pdf()
  .set({
    margin: 10,
    filename: "MSEDCL_Bill.pdf",
    html2canvas: { scale: 2 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
  })
  .from(element)
  .save()
  .finally(() => {
    // ✅ ALWAYS REMOVE (even if error happens)
    document.body.removeChild(element);
  });

}
  /*********************************
   //EXPORT SECTION AND UPLOAD PDF SECTION
  *********************************/
  function exportPDF(){

  const logs = JSON.parse(localStorage.getItem("micropmu_logs") || "[]");

  if(logs.length === 0){
    alert("No Data Available");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.text("Micro-PMU Fault Report", 20, 20);

  logs.slice(0,20).forEach((l,i)=>{
    doc.text(
      `${i+1}. ${l.timestamp} | ${l.status}`,
      20,
      30 + (i*6)
    );
  });


  doc.save("MicroPMU_Report.pdf");
}

  function loadAnalysisDataset() {

    const fileInput = document.getElementById("analysisFile");

    if (!fileInput || fileInput.files.length === 0) return;

    const file = fileInput.files[0];

    const reader = new FileReader();

    reader.onload = function (e) {

      const text = e.target.result;

      const rows = text.split("\n").slice(1);

      const dataset = rows.map(r => {

        const cols = r.split(",");

        return {

          time: cols[0],

          voltage: parseFloat(cols[1]),

          current: parseFloat(cols[2]),

          frequency: parseFloat(cols[3]),

          pf: parseFloat(cols[4]),

          power: parseFloat(cols[5])

        };

      });

      window.analysisDataset = dataset;

      console.log("Analysis dataset loaded:", dataset);
      console.table(dataset);
    };

    reader.readAsText(file);
    analysisIndex = 0; // ✅ correct place
  }

  function quickExport(type){

  const now = new Date();

  let start = new Date();

  if(type === "week"){
    start.setDate(now.getDate()-7);
  }
  else if(type === "month"){
    start.setMonth(now.getMonth()-1);
  }

  document.getElementById("startDate").value = start.toISOString().split("T")[0];
  document.getElementById("endDate").value = now.toISOString().split("T")[0];
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

    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Fault_Timeline.csv";
    a.click();
  }

  // ===================================//
  // ===== FORCE GLOBAL BUTTON FIX =====//
  // ===================================//
  // ================= FORCE GLOBAL BUTTON FIX =================

  // Dashboard Buzzer
  window.testBuzzer = function () {
    if (typeof buzzer !== "undefined") {
      buzzer.play().then(() => {
        setTimeout(() => buzzer.pause(), 1500);
      }).catch(() => { });
    } else {
      alert("Buzzer not initialized");
    }
  };

  // Reset Energy
  window.secureResetEnergy = function () {
    if (sessionStorage.getItem("adminVerified") !== "true") {
      alert("⚠ Verify Admin First");
      return;
    }
    localStorage.removeItem("micropmu_energy");
    alert("Energy Counter Reset");
  };

  // Clear Logs
  window.secureClearLogs = function () {
    if (sessionStorage.getItem("adminVerified") !== "true") {
      alert("⚠ Verify Admin First");
      return;
    }
    localStorage.removeItem("micropmu_logs");
    alert("Logs Cleared");
  };

  // Verify Admin
  window.verifyAdmin = function () {

    const input = document.getElementById("adminPass");

    if (input.value === "Rushii") {
      sessionStorage.setItem("adminVerified", "true");
      alert("Admin Verified Successfully");
      input.value = "";
    } else {
      alert("Wrong Password");
    }
  };

  /******************************************* */
  /* New Code Merging 
  /****************************************** */

  /***********FOR WINDOW******************* */
window.togglePass = function() {

  const input = document.getElementById("accessPass");
  const icon = document.getElementById("eyeIcon");

  if (!input) return;

  if (input.type === "password") {
    input.type = "text";
    if (icon) icon.innerText = "🙈";
  } else {
    input.type = "password";
    if (icon) icon.innerText = "👁";
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
      icon.innerText = "🙈";  // hide
    } else {
      input.type = "password";
      icon.innerText = "👁";  // show
    }
  }


/*************end main.js******************** */

  function systemStress(){

  let last = history[history.length-1];
  if(!last) return 0;

  let stress = 0;

  if(last.current > dynamicLimits.currentMax) stress += 30;
  if(last.temperature > dynamicLimits.tempMax) stress += 25;
  if(last.pf < dynamicLimits.pfMin) stress += 15;
  if(last.voltage < dynamicLimits.voltMin || last.voltage > dynamicLimits.voltMax) stress += 20;

  return Math.min(100, stress);
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

  if(status === "SYSTEM HEALTHY"){
    reason = "All parameters normal";
    risk = 10;
    prediction = "Stable";
    fix = "No action";
    confidence = 95;
  }

  else if(status === "LOW VOLTAGE"){
    reason = "Voltage below 210V";
    risk = 60;
    prediction = "Current may increase";
    fix = "Reduce load";
    confidence = 92;
  }

  else if(status === "OVER VOLTAGE"){
    reason = "Voltage above 240V";
    risk = 65;
    prediction = "Equipment stress";
    fix = "Check source";
    confidence = 93;
  }

  else if(status === "OVERLOAD"){
    reason = "Load too high";
    risk = 80;
    prediction = "Temp will rise";
    fix = "Disconnect load";
    confidence = 94;
  }

  else if(status === "LOW POWER FACTOR"){
    reason = "PF is low";
    risk = 55;
    prediction = "Losses increase";
    fix = "Add capacitor";
    confidence = 88;
  }

  else if(status === "SHORT CIRCUIT"){
    reason = "Extreme current flow";
    risk = 99;
    prediction = "Immediate failure";
    fix = "Trip supply";
    confidence = 99;
  }

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
    stability
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
function updateAIRealtime(){function updateAIRealtime(){
  return; // 🔒 disable realtime
}

  const popup = document.getElementById("aiPopup");
  if(!popup || popup.style.display !== "flex") return;

  const ai = runAIEngine();

  setAI("aiStress", ai.stress + "%");
  setAI("aiThermal", ai.thermal + "%");
  setAI("aiStability", ai.stability);
}

// 🔥 AUTO UPDATE EVERY 1s
//setInterval(updateAIRealtime, 1000);

