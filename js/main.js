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
   /************* AI BUTTON*******************/

  const aiBtn = document.getElementById("aiBtn");

if(aiBtn){
  const status = evaluateStatus();   // 🔥 ADD THIS
  if(status !== "SYSTEM HEALTHY"){
    aiBtn.style.background = "#603272";
  } else {
    aiBtn.style.background = "#603272";
  }
}

 
function updateAIRealtime(){

  const popup = document.getElementById("aiPopup");

  // popup open nahi hai toh skip (performance save)
  if(!popup || popup.style.display !== "flex") return;

  const ai = runAIEngine();

  document.getElementById("aiStress").innerText = ai.stress + "%";
  document.getElementById("aiThermal").innerText = ai.thermal + "%";
  document.getElementById("aiStability").innerText = ai.stability.toFixed(2);

}

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
  window.addEventListener("load", () => {

    // ✅ start system
    startSampling();

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

  });

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

  /* ================= GLOBAL GRAPH UPDATE ================= */

  function startGraphEngine() {

    if (graphTimer) clearInterval(graphTimer);

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
        let freqStability = 100 - Math.abs(frequency - 50) * 8;
        freqStability = Math.max(0, Math.min(100, freqStability));

        if (document.getElementById("freqStability")) {
          document.getElementById("freqStability").innerText = freqStability.toFixed(1) + " %";
        }

        pushData(performanceCharts.phaseAngle, phaseAngle);
        pushData(performanceCharts.load, loadKW);
        energy += loadKW / 3600;
        pushData(performanceCharts.energy, energy);
        pushData(performanceCharts.eff, efficiency);

        // update performance numbers
        updateSyncStatus();
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
    }, parseInt(getSettings().samplingRate) || 1000);
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

  function pushData(chart, value) {

    const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
    const maxPoints = parseInt(settings.graphPoints) || 20;

    if (chart.data.labels.length >= maxPoints) {
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
    const interval = parseInt(settings.logInterval) || 1000;

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

      if (logs.length > 5000) logs.shift();

      localStorage.setItem("micropmu_logs", JSON.stringify(logs));

    }, interval);
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

    const logs = localStorage.getItem("micropmu_logs") || "";
    const usedBytes = new Blob([logs]).size;
    const maxBytes = 5 * 1024 * 1024;

    let percent = ((usedBytes / maxBytes) * 100);
    percent = Math.min(percent, 100); // limit

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
        alert("⚠ Storage Almost Full!");
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
    }

  }

  setInterval(updateMemoryUsage, 2000);


  /*********************************
   ADVANCED EXPORT CSV (FIXED)
  **********************************/

 function exportCSV(){

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

    const ctxV = new Chart(document.getElementById("reportVoltage"), {
      type: "line",
      data: { labels: [], datasets: [{ label: "Voltage", data: [], borderColor: "#38bdf8" }] }
    });

    const ctxC = new Chart(document.getElementById("reportCurrent"), {
      type: "line",
      data: { labels: [], datasets: [{ label: "Current", data: [], borderColor: "#22c55e" }] }
    });

    const ctxP = new Chart(document.getElementById("reportPower"), {
      type: "line",
      data: { labels: [], datasets: [{ label: "Power", data: [], borderColor: "#f97316" }] }
    });

    const ctxPF = new Chart(document.getElementById("reportPF"), {
      type: "line",
      data: { labels: [], datasets: [{ label: "Power Factor", data: [], borderColor: "#a855f7" }] }
    });

    function loadReportData(range) {

      const logs = JSON.parse(localStorage.getItem("micropmu_logs") || "[]");

      if (logs.length === 0) {
        alert("No Data Available");
        return;
      }

      // Clear old data
      [ctxV, ctxC, ctxP, ctxPF].forEach(chart => {
        chart.data.labels = [];
        chart.data.datasets[0].data = [];
      });

      logs.forEach(log => {
        ctxV.data.labels.push("");
        ctxV.data.datasets[0].data.push(log.voltage);

        ctxC.data.labels.push("");
        ctxC.data.datasets[0].data.push(log.current);

        ctxP.data.labels.push("");
        ctxP.data.datasets[0].data.push(log.power);

        ctxPF.data.labels.push("");
        ctxPF.data.datasets[0].data.push(log.pf);
      });

      ctxV.update();
      ctxC.update();
      ctxP.update();
      ctxPF.update();

        document.getElementById("reportTitle").innerText =
        "Voltage vs Time (" + range + ")";
    

        document.getElementById("reportTitle").innerText =
        "Current vs Time (" + range + ")";
    

        document.getElementById("reportTitle").innerText =
        "Power vs Time (" + range + ")";

        document.getElementById("reportTitle").innerText =
        "Power Factor vs Time (" + range + ")";
    }

    window.showDaily = function () {
  setLoading("Daily");
};

window.showWeekly = function () {
  setLoading("Weekly");
};

window.showMonthly = function () {
  setLoading("Monthly");
};

function setLoading(type){
  document.getElementById("reportVoltageTitle").innerText = "Loading " + type + "...";
  document.getElementById("reportCurrentTitle").innerText = "Loading " + type + "...";
  document.getElementById("reportPowerTitle").innerText = "Loading " + type + "...";
  document.getElementById("reportPFTitle").innerText = "Loading " + type + "...";

  setTimeout(()=>loadReportData(type),300);
}
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


  /* ================= SETTINGS AUTO APPLY ================= */

  document.addEventListener("DOMContentLoaded", () => {

    applyModeFromSettings();
    if (typeof firebase !== "undefined") {
      startFirebaseSync();
    }
    if (typeof startSampling === "function") {
      startSampling();
    }
    const settings = getSettings();

    if (settings.systemMode === "esp") {
    }
  });



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
          initCloudSync();
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
  /* ================= INIT SAFE ================= */

  document.addEventListener("DOMContentLoaded", () => {

    if (!checkDashboardAccess()) return;

    loadFirebaseSafe();
    detectModeFromURL(); 

  });

  /*********************************
   SETTINGS + MODE 
  *********************************/

  // Load saved settings
  document.addEventListener("DOMContentLoaded", () => {

    let settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");

    if (settings.systemMode) {
      const modeEl = document.getElementById("systemMode");
      if (modeEl) {
        modeEl.value = settings.systemMode;
      }
    }

  });


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
        alert("Verify Admin First");
        return;
      }

      localStorage.removeItem("micropmu_energy");
      alert("Energy Counter Reset");
    };

    /* ================= CLEAR LOGS ================= */

    window.secureClearLogs = function () {

      if (sessionStorage.getItem("adminVerified") !== "true") {
        alert("Verify Admin First");
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

  // ========= START SAMPLING =========
  startSampling();

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

  /*************************************************
   PROFESSIONAL MSEDCL BILL CALCULATION (FINAL)
  *************************************************/
window.calculateBill = function () {

  // ===== GET VALUES =====
  const powerKW = parseFloat(document.getElementById("calcPower")?.value);
  const pf = parseFloat(document.getElementById("calcPF")?.value);
  const hours = parseFloat(document.getElementById("calcHours")?.value);

  const tariffType = document.getElementById("consumerType")?.value || "res";
  const supplyPhase = document.getElementById("supplyPhase")?.value || "1";
  const supplyType = document.getElementById("supplyType")?.value || "LT";

  // 🔥 NEW (Dynamic Inputs)
  const gstPercent = parseFloat(document.getElementById("gstInput")?.value);
  const dutyPercent = parseFloat(document.getElementById("dutyInput")?.value);

  // ===== VALIDATION =====
  if(isNaN(powerKW) || isNaN(hours) || isNaN(pf)){
    alert("⚠ Enter all required values");
    return;
  }

  if(powerKW <= 0 || hours <= 0){
    alert("⚠ Enter valid load and usage hours");
    return;
  }

  if(pf <= 0 || pf > 1){
    alert("⚠ Power Factor must be between 0 and 1");
    return;
  }

  if(powerKW > 1000){
    alert("⚠ Load value too high (check input)");
    return;
  }

  if(hours > 24){
    alert("⚠ Usage hours cannot exceed 24 per day");
    return;
  }

  // 🔥 VALIDATE GST / DUTY
  if(isNaN(gstPercent) || gstPercent < 0 || gstPercent > 50){
    alert("⚠ Enter valid GST (0–50%)");
    return;
  }

  if(isNaN(dutyPercent) || dutyPercent < 0 || dutyPercent > 50){
    alert("⚠ Enter valid Electricity Duty (0–50%)");
    return;
  }

  // ===== CALCULATION =====
  const units = powerKW * hours * pf;

  let breakdown = [];
  let energyCharge = 0;

  function slabCalc(u, slabs) {
    let remaining = u;
    let total = 0;

    slabs.forEach(s => {
      if (remaining > 0) {
        const used = Math.min(remaining, s.limit);
        const cost = used * s.rate;

        breakdown.push(
          `${used.toFixed(2)} Units × ₹${s.rate} = ₹${cost.toFixed(2)}`
        );

        total += cost;
        remaining -= used;
      }
    });

    return total;
  }

  // ===== SLAB LOGIC =====
  if (tariffType === "res") {
    energyCharge = slabCalc(units, [
      { limit: 100, rate: 4.43 },
      { limit: 200, rate: 9.64 },
      { limit: 200, rate: 12.83 },
      { limit: Infinity, rate: 14.33 }
    ]);
  } else {
    energyCharge = slabCalc(units, [
      { limit: 100, rate: 5.88 },
      { limit: 200, rate: 11.46 },
      { limit: 200, rate: 15.72 },
      { limit: Infinity, rate: 17.81 }
    ]);
  }

  // ===== FIXED CHARGE =====
  let fixedCharge = 0;

  if (tariffType === "res") {
    fixedCharge = (supplyPhase === "1")
      ? (supplyType === "LT" ? 30 : 60)
      : (supplyType === "LT" ? 100 : 155);
  } else {
    fixedCharge = (supplyPhase === "1")
      ? (supplyType === "LT" ? 50 : 100)
      : (supplyType === "LT" ? 120 : 200);
  }

  // ===== DYNAMIC TAXES =====
  const gst = (energyCharge + fixedCharge) * (gstPercent / 100);
  const electricityDuty = energyCharge * (dutyPercent / 100);

  const totalBill = energyCharge + fixedCharge + gst + electricityDuty;

  // ===== OUTPUT =====
  document.getElementById("unitResult").innerText =
    units.toFixed(2) + " kWh";

  document.getElementById("billResult").innerText =
    "₹ " + totalBill.toFixed(2);

  // 🔥 FULL BREAKDOWN
  const breakdownEl = document.getElementById("billBreakdown");
  if(breakdownEl){
    breakdownEl.innerText =
      `Energy: ₹${energyCharge.toFixed(2)} | Fixed: ₹${fixedCharge.toFixed(2)} | GST: ₹${gst.toFixed(2)} | Duty: ₹${electricityDuty.toFixed(2)}`;
  }

  // ===== STORE DATA =====
  window._billData = {
    tariffType,
    supplyPhase,
    supplyType,
    units,
    energyCharge,
    fixedCharge,
    gst,
    electricityDuty,
    totalBill,
    breakdown
  };

};
/************BILL AUTO UPDATE******************* */

document.getElementById("calcPower")?.addEventListener("input", calculateBill);
document.getElementById("calcHours")?.addEventListener("input", calculateBill);
document.getElementById("calcPF")?.addEventListener("input", calculateBill);

  /*************************************************
   MSEDCL PROFESSIONAL BILL DOWNLOAD (FINAL)
  *************************************************/
window.downloadBill = function () {

  if (!window._billData) {
    alert("Please calculate bill first.");
    return;
  }

  const d = window._billData;
  const safe = (v) => Number(v || 0).toFixed(2);

  const billNumber = "MS-" + Date.now();
  const billingDate = new Date().toLocaleString();

  // 🔥 HTML BILL TEMPLATE
  const billHTML = `
  <html>
  <head>
    <title>MSEDCL Bill</title>
    <style>
      body{
        font-family: Arial;
        padding:20px;
        background:#f5f5f5;
      }

      .bill{
        max-width:700px;
        margin:auto;
        background:white;
        padding:20px;
        border-radius:10px;
        box-shadow:0 0 15px rgba(0,0,0,0.2);
      }

      .header{
        text-align:center;
        border-bottom:2px solid #000;
        padding-bottom:10px;
      }

      .logo{
        width:120px;
        margin-bottom:10px;
      }

      .title{
        font-weight:bold;
        font-size:18px;
      }

      .section{
        margin-top:15px;
        font-size:14px;
      }

      .row{
        display:flex;
        justify-content:space-between;
        margin:4px 0;
      }

      .total{
        font-size:18px;
        font-weight:bold;
        color:#dc2626;
        border-top:2px solid black;
        margin-top:10px;
        padding-top:10px;
      }

      .green{ color:#16a34a; }
      .blue{ color:#2563eb; }
    </style>
  </head>

  <body>

    <div class="bill">

      <div class="header">
  <img src="./assets/msedcl-logo.png" class="logo">
  <div class="title">Maharashtra State Electricity Distribution Co. Ltd.</div>
  <div>ELECTRICITY BILL</div>
</div>

      <div class="section">
        <div class="row"><span>Bill No:</span><span>${billNumber}</span></div>
        <div class="row"><span>Date:</span><span>${billingDate}</span></div>
        <div class="row"><span>Consumer:</span><span>${d.tariffType}</span></div>
      </div>

      <div class="section">
        <div class="row"><span>Units:</span><span>${safe(d.units)} kWh</span></div>
        <div class="row"><span>Energy Charge:</span><span class="blue">₹${safe(d.energyCharge)}</span></div>
        <div class="row"><span>Fixed Charge:</span><span>₹${safe(d.fixedCharge)}</span></div>
        <div class="row"><span>GST:</span><span>₹${safe(d.gst)}</span></div>
        <div class="row"><span>Duty:</span><span>₹${safe(d.electricityDuty)}</span></div>
      </div>

      <div class="section total">
        Total Bill: ₹${safe(d.totalBill)}
      </div>

      <div class="section green">
        ✔ Generated by Micro-PMU Smart Billing System
      </div>

    </div>

  </body>
  </html>
  `;

 const opt = {
  margin: 0.5,
  filename: 'MSEDCL_Bill.pdf',
  image: { type: 'jpeg', quality: 1 },
  html2canvas: { scale: 2 },
  jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
};

html2pdf().set(opt).from(billHTML).save();
};

  /*********************************
   PHASOR DIAGRAM
  *********************************/

  function drawPhasor() {

    const canvas = document.getElementById("phasorCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = 100;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "#334155";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // voltage reference
    ctx.strokeStyle = "#f62727";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.stroke();

    // current phasor
    const angle = phaseAngle * Math.PI / 180;

    ctx.strokeStyle = "#26f50e";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + radius * Math.cos(angle), cy - radius * Math.sin(angle));
    ctx.stroke();

  }

  setInterval(updateWiFiStatus, 2000);
  window.addEventListener("load", updateSystemModeUI);

  /*********************************
   EXPORT SECTION AND UPLOAD PDF SECTION
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
      alert("Verify Admin First");
      return;
    }
    localStorage.removeItem("micropmu_energy");
    alert("Energy Counter Reset");
  };

  // Clear Logs
  window.secureClearLogs = function () {
    if (sessionStorage.getItem("adminVerified") !== "true") {
      alert("Verify Admin First");
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

  let accessMode = "";
  let attemptsLeft = 3;

  function showAccessPopup(mode) {

    accessMode = mode;
    attemptsLeft = 3;

    document.getElementById("accessPopup").style.display = "flex";
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

  function submitAccess() {

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
      popup.style.opacity = "0";

      setTimeout(() => {
        popup.style.display = "none";
        location.reload();
      }, 300);

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

  /***********FOR WINDOW******************* */

  function togglePass() {
    const input = document.getElementById("accessPass");
    const icon = document.getElementById("eyeIcon");

    if (input.type === "password") {
      input.type = "text";
      if (icon) icon.innerText = "🙈";
    } else {
      input.type = "password";
      if (icon) icon.innerText = "👁";
    }
  }

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

function runAIEngine(){

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

  // ===== MAIN LOGIC =====
  if(status === "SYSTEM HEALTHY"){
    reason = "All parameters normal";
    risk = 10;
    prediction = "Stable";
    fix = "No action";
  }

  else if(status === "LOW VOLTAGE"){
    reason = "Voltage below 210V";
    risk = 60;
    prediction = "Current may increase";
    fix = "Reduce load";
  }

  else if(status === "OVER VOLTAGE"){
    reason = "Voltage above 240V";
    risk = 65;
    prediction = "Equipment stress";
    fix = "Check source";
  }

  else if(status === "OVERLOAD"){
    reason = "Load too high";
    risk = 80;
    prediction = "Temp will rise";
    fix = "Disconnect load";
  }

  else if(status === "LOW POWER FACTOR"){
    reason = "PF is low";
    risk = 55;
    prediction = "Losses increase";
    fix = "Add capacitor";
  }

  else if(status === "SHORT CIRCUIT"){
    reason = "Extreme current flow";
    risk = 99;
    prediction = "Immediate failure";
    fix = "Trip supply";
  }
   
const statusCard = document.querySelector(".ai-card"); // cleaner

if(statusCard){

  if(status === "SYSTEM HEALTHY"){
    statusCard.style.borderLeft = "3px solid #22c55e";
  }
  else if(status === "OVERLOAD" || status === "SHORT CIRCUIT"){
    statusCard.style.borderLeft = "3px solid #ef4444";
  }
  else{
    statusCard.style.borderLeft = "3px solid #f97316";
  }

}

  // ===== SMART CONFIDENCE =====
  if(status === "SYSTEM HEALTHY") confidence = 95;
  else if(status === "LOW VOLTAGE") confidence = 92;
  else if(status === "OVER VOLTAGE") confidence = 93;
  else if(status === "HIGH CURRENT") confidence = 90;
  else if(status === "OVERLOAD") confidence = 94;
  else if(status === "LOW POWER FACTOR") confidence = 88;
  else if(status === "FREQUENCY FAULT") confidence = 91;
  else if(status === "SHORT CIRCUIT") confidence = 99;

  // 🔥 realistic variation
  confidence = (confidence + Math.random()*3).toFixed(1) + "%";

  // ===== FINAL RETURN (END ME HOGA) =====
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

}
window.openAI = function(){

  const ai = runAIEngine();

  document.getElementById("aiStatus").innerText = ai.status;
  document.getElementById("aiReason").innerText = ai.reason;
  document.getElementById("aiRisk").innerText = ai.risk;
  document.getElementById("aiPrediction").innerText = ai.prediction;
  document.getElementById("aiFix").innerText = ai.fix;
  document.getElementById("aiConfidence").innerText = ai.confidence;
  document.getElementById("aiStress").innerText = ai.stress + "%";
document.getElementById("aiThermal").innerText = ai.thermal + "%";
document.getElementById("aiStability").innerText = ai.stability;

  document.getElementById("aiPopup").style.display = "flex";
}

window.closeAI = function(){
  document.getElementById("aiPopup").style.display = "none";
}

