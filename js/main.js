/*********************************
 MICRO-PMU CORE ENGINE (STABLE)
**********************************/

/* ================= GLOBAL STATE ================= */
/* ===== FINAL SYSTEM LIMITS ===== */
const deviceId = localStorage.getItem("deviceId") || ("dev_" + Math.random().toString(36).substr(2,9));
localStorage.setItem("deviceId", deviceId);
const LIMITS = {

  
  VOLT_MIN:210,
  VOLT_WARN:215,
  VOLT_MAX:240,

  OVERLOAD_CURRENT:10,
  SHORT_CURRENT:15,

  PF_MIN:0.85,

  FREQ_MIN:49,
  FREQ_MAX:51,

  TEMP_MAX:60

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

// ===== EVENT TIMELINE STATE =====
let lastStatus = "SYSTEM HEALTHY";
let faultStartTime = null;
let activeFault = null;

function applyProtectionSettings(){

const s = getSettings();

if(s.vmin) LIMITS.VOLT_MIN = parseFloat(s.vmin);
if(s.vmax) LIMITS.VOLT_MAX = parseFloat(s.vmax);

if(s.overloadLimit)
LIMITS.OVERLOAD_CURRENT = parseFloat(s.overloadLimit);

if(s.shortLimit)
LIMITS.SHORT_CURRENT = parseFloat(s.shortLimit);

if(s.pfMin)
LIMITS.PF_MIN = parseFloat(s.pfMin);

if(s.fmin)
LIMITS.FREQ_MIN = parseFloat(s.fmin);

if(s.fmax)
LIMITS.FREQ_MAX = parseFloat(s.fmax);

if(s.tempMax)
LIMITS.TEMP_MAX = parseFloat(s.tempMax);

}

/*********************************
 BUZZER SYSTEM
*********************************/

const buzzer = new Audio("buzzer.mp3");
buzzer.loop = true;


/* ================= BUZZER BUTTON ================= */

function toggleBuzzerMute(){

  const icon = document.getElementById("buzzerBox");

  buzzerMuted = !buzzerMuted;

  if(buzzerMuted){

    // stop sound instantly
    buzzer.pause();
    buzzer.currentTime = 0;
    buzzerPlaying = false;

    if(icon){
      icon.innerText = "🔕";
      icon.classList.add("buzzer-muted");
    }

  }
  else{

    if(icon){
      icon.innerText = "🔊";
      icon.classList.remove("buzzer-muted");
    }

    // resume alarm only if fault
    if(evaluateStatus() !== "SYSTEM HEALTHY"){
      playBuzzer();
    }

  }

}


/* ================= PLAY BUZZER ================= */

function playBuzzer(){

  if(buzzerMuted) return;

  if(!buzzerPlaying){

    buzzer.play().catch(()=>{});
    buzzerPlaying = true;

  }

}


/* ================= STOP BUZZER ================= */

function stopBuzzer(){

  buzzer.pause();
  buzzer.currentTime = 0;
  buzzerPlaying = false;

}

/* Unlock audio once */
document.addEventListener("click", function enableAudio(){
  buzzer.play().then(()=>{
    buzzer.pause();
    buzzer.currentTime = 0;
  }).catch(()=>{});
  document.removeEventListener("click", enableAudio);
});

/* ================= RANDOM ================= */

function random(min,max){
  return Math.floor(Math.random()*(max-min)+min);
}

/* ================= SETTINGS ================= */

function getSettings(){
  return JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
}
/* ================= STATUS ENGINE ================= */

function evaluateStatus(){

  const sensitivity = getSettings().alarmSensitivity || "medium";

let overloadLimit = LIMITS.OVERLOAD_CURRENT;

if(sensitivity === "low") overloadLimit += 2;
if(sensitivity === "high") overloadLimit -= 2;

  if(current >= LIMITS.SHORT_CURRENT)
    return "SHORT CIRCUIT";

  if(current >= overloadLimit)
    return "OVERLOAD";

  if(voltage < LIMITS.VOLT_MIN)
    return "LOW VOLTAGE";

  if(voltage >= LIMITS.VOLT_MIN && voltage < LIMITS.VOLT_WARN)
    return "WARNING";

  if(voltage > LIMITS.VOLT_MAX)
    return "OVER VOLTAGE";

  if(pf < LIMITS.PF_MIN)
    return "LOW POWER FACTOR";

  if(frequency < LIMITS.FREQ_MIN || frequency > LIMITS.FREQ_MAX)
    return "FREQUENCY FAULT";

  if(temperature > LIMITS.TEMP_MAX)
    return "OVER TEMPERATURE";

  return "SYSTEM HEALTHY";

}

/*********************************
 EVENT TIMELINE ENGINE
*********************************/

function trackTimeline(){

  const currentStatus = evaluateStatus();

  // ===== NEW FAULT DETECTED =====
  if(currentStatus !== "SYSTEM HEALTHY" && lastStatus === "SYSTEM HEALTHY"){

    faultStartTime = new Date();
    activeFault = currentStatus;

    saveTimeline("FAULT START", currentStatus, faultStartTime);
  }

  // ===== FAULT RECOVERED =====
  if(currentStatus === "SYSTEM HEALTHY" && lastStatus !== "SYSTEM HEALTHY"){

    const recoveryTime = new Date();

    saveTimeline("RECOVERED", activeFault, recoveryTime);

    faultStartTime = null;
    activeFault = null;
  }

  lastStatus = currentStatus;
}


function saveTimeline(type, fault, time){

  let timeline = JSON.parse(localStorage.getItem("micropmu_timeline") || "[]");

  timeline.push({
  type,
  fault,
  time: time.toLocaleString()
});

// 🔥 LIMIT TO LAST 200 EVENTS
if(timeline.length > 200){
  timeline.shift();
}
  localStorage.setItem("micropmu_timeline", JSON.stringify(timeline));
}

/*********************************
 SYSTEM MODE DISPLAY
*********************************/

function updateSystemModeUI(){

  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");
  systemMode = settings.systemMode || "simulation";

  const elements = document.querySelectorAll("#liveMode, #systemModeLabel, #perfMode");

  elements.forEach(el=>{
    if(!el) return;

    if(systemMode === "esp"){
      el.innerText = "ESP Mode";
    }
    else if(systemMode === "hybrid"){
      el.innerText = "Hybrid Mode";
    }
    else{
      el.innerText = "Simulation";
    }
  });

}

/* ================= DASHBOARD UPDATE ================= */

function updateDashboard() {

  // ===== FAULT TIME DISPLAY =====
  if(document.getElementById("faultTime")){

    if(faultStartTime){
      document.getElementById("faultTime").innerText =
        faultStartTime.toLocaleTimeString();

      document.getElementById("faultTimeBox").style.display = "block";
    }
    else{
      document.getElementById("faultTime").innerText = "--";
      document.getElementById("faultTimeBox").style.display = "none";
    }
  }

  // ===== FAULT DURATION =====
  if(faultStartTime){
    const now = new Date();
    faultDuration = ((now - faultStartTime)/1000).toFixed(1);

    if(document.getElementById("faultDuration")){
      document.getElementById("faultDuration").innerText =
        faultDuration + " sec";
    }
  }

  // ===== NETWORK MODE =====
  if(document.getElementById("modeLabel")){
    const mode = localStorage.getItem("networkMode") || "local";

    if(mode === "local") document.getElementById("modeLabel").innerText = "Admin Mode";
    else if(mode === "mirror") document.getElementById("modeLabel").innerText = "Sync Mode";
    else document.getElementById("modeLabel").innerText = "Cloud Mode";
  }

  // ===== SYSTEM MODE =====
  if(document.getElementById("liveMode")){
    if(systemMode === "esp") document.getElementById("liveMode").innerText = "ESP Mode";
    else if(systemMode === "hybrid") document.getElementById("liveMode").innerText = "Hybrid Mode";
    else document.getElementById("liveMode").innerText = "Simulation";
  }

  // ===== VALUES =====
  if(document.getElementById("v")){
    document.getElementById("v").innerText = voltage + " V";
    document.getElementById("c").innerText = current + " A";
    document.getElementById("f").innerText = frequency + " Hz";
    document.getElementById("p").innerText = power + " W";
    document.getElementById("pfVal").innerText = pf;

    if(document.getElementById("pfPerf")){
      document.getElementById("pfPerf").innerText = pf;
    }

    document.getElementById("temp").innerText = temperature + " °C";
  }

  // ===== PERFORMANCE =====
  if(document.getElementById("phaseAngleVal")){
    document.getElementById("phaseAngleVal").innerText = phaseAngle + "°";
  }

  // ===== STATUS =====
  const status = evaluateStatus();

  if(document.getElementById("statusText")){
    document.getElementById("statusText").innerText = status;

    const statusCard = document.getElementById("statusCard");

    if(status === "SYSTEM HEALTHY"){
      statusCard.className = "card status normal";
      stopBuzzer();
    } else {
      statusCard.className = "card status danger";

      const settings = getSettings();
      const buzzerMode = settings.dashBuzzerMode || "auto";

      if(buzzerMode === "auto" && !buzzerMuted){
        playBuzzer();
      }
    }
  }

  // ================= 🔥 TIMELINE ENGINE =================
  trackTimeline();

  // ===== OPTIMIZED UI UPDATE =====
  if(!window._timelineUIThrottle){
    window._timelineUIThrottle = true;

    setTimeout(()=>{
      updateTimelineUI();
      window._timelineUIThrottle = false;
    },2000);
  }

}

/* ================= SAMPLING ENGINE ================= */

function startSampling(){

  if(samplingTimer) clearInterval(samplingTimer);

  const settings = getSettings();
  const rate = parseInt(settings.samplingRate) || 1000;

  samplingTimer = setInterval(updateSystem, rate);
}

/* Start when page loads */
window.addEventListener("load", startSampling);

/*********************************
 GRAPH ENGINE (GLOBAL SYNCED)
**********************************/

let dashboardCharts = {};
let liveCharts = {};
let performanceCharts = {};

let graphTimer = null;

/* ================= DASHBOARD GRAPHS ================= */

function initDashboardCharts(){

  if(!document.getElementById("voltageChart")) return;

  dashboardCharts.voltage = new Chart(
    document.getElementById("voltageChart"),
    {
      type:"line",
      data:{
        labels:[],
        datasets:[{
          label:"Voltage",
          data:[],
          borderColor:"#38bdf8",
          tension:0.3
        }]
      }
    }
  );

  dashboardCharts.current = new Chart(
    document.getElementById("currentChart"),
    {
      type:"line",
      data:{
        labels:[],
        datasets:[{
          label:"Current",
          data:[],
          borderColor:"#22c55e",
          tension:0.3
        }]
      }
    }
  );
}

/* ================= LIVE PAGE GRAPHS ================= */

function initLiveCharts(){

  if(!document.getElementById("liveVoltage")) return;

  const ids = ["liveVoltage","liveCurrent","liveFrequency","livePower"];

  ids.forEach(id=>{
    liveCharts[id] = new Chart(
      document.getElementById(id),
      {
        type:"line",
        data:{
          labels:[],
          datasets:[{
            label:id,
            data:[],
            borderColor:"#38bdf8",
            tension:0.3
          }]
        }
      }
    );
  });
}

/* ================= PERFORMANCE GRAPHS ================= */

function initPerformanceCharts(){

  if(!document.getElementById("pfChart")) return;

  performanceCharts.phaseAngle = new Chart(
    document.getElementById("pfChart"),
    {
      type:"line",
      data:{ labels:[], datasets:[{ label:"Phase Angle", data:[], borderColor:"#38bdf8", tension:0.3 }] }
    }
  );

  performanceCharts.load = new Chart(
    document.getElementById("loadChart"),
    {
      type:"line",
      data:{ labels:[], datasets:[{ label:"Load (kW)", data:[], borderColor:"#22c55e", tension:0.3 }] }
    }
  );

  performanceCharts.energy = new Chart(
    document.getElementById("energyChart"),
    {
      type:"line",
      data:{ labels:[], datasets:[{ label:"Energy (kWh)", data:[], borderColor:"#a855f7", tension:0.3 }] }
    }
  );

  performanceCharts.eff = new Chart(
    document.getElementById("effChart"),
    {
      type:"line",
      data:{ labels:[], datasets:[{ label:"Efficiency (%)", data:[], borderColor:"#f97316", tension:0.3 }] }
    }
  );
}

/* ================= GLOBAL GRAPH UPDATE ================= */

function startGraphEngine(){

  if(graphTimer) clearInterval(graphTimer);

  graphTimer = setInterval(()=>{

    /* ===== Dashboard ===== */
    if(dashboardCharts.voltage){

      pushData(dashboardCharts.voltage, voltage);
      pushData(dashboardCharts.current, current);
    }

    /* ===== Live ===== */
    if(liveCharts.liveVoltage){

      pushData(liveCharts.liveVoltage, voltage);
      pushData(liveCharts.liveCurrent, current);
      pushData(liveCharts.liveFrequency, frequency);
      pushData(liveCharts.livePower, power);
    }

    /* ===== Performance ===== */
    if(performanceCharts.phaseAngle){

      let loadKW = parseFloat((voltage*current*pf/1000).toFixed(2));
      let efficiency = Math.floor(pf*100);
      let freqStability = 100 - Math.abs(frequency-50)*8;
freqStability = Math.max(0,Math.min(100,freqStability));

if(document.getElementById("freqStability")){
document.getElementById("freqStability").innerText = freqStability.toFixed(1)+" %";
}

      pushData(performanceCharts.phaseAngle, phaseAngle);
      pushData(performanceCharts.load, loadKW);
      energy += loadKW/3600;
pushData(performanceCharts.energy, energy);
      pushData(performanceCharts.eff, efficiency);

      // update performance numbers
      updateSyncStatus();
      if(document.getElementById("load")){
        document.getElementById("load").innerText = loadKW+" kW";
      }
      if(document.getElementById("energy")){
        document.getElementById("energy").innerText = energy.toFixed(3) + " kWh";
      }
      if(document.getElementById("efficiency")){
        document.getElementById("efficiency").innerText = efficiency+" %";
      }
    }
drawPhasor();
  }, parseInt(getSettings().samplingRate) || 1000);
}

function resetGraphs(){

Object.values(dashboardCharts).forEach(c=>{
c.data.labels=[];
c.data.datasets[0].data=[];
c.update();
});

Object.values(liveCharts).forEach(c=>{
c.data.labels=[];
c.data.datasets[0].data=[];
c.update();
});

Object.values(performanceCharts).forEach(c=>{
c.data.labels=[];
c.data.datasets[0].data=[];
c.update();
});

alert("Graphs Reset");

}
/* ================= PUSH DATA SAFE ================= */

function pushData(chart,value){

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

function startLogger(){

  if(logTimer) clearInterval(logTimer);

  const settings = getSettings();
  const interval = parseInt(settings.logInterval) || 1000;

  logTimer = setInterval(()=>{

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

    if(logs.length > 5000) logs.shift();

    localStorage.setItem("micropmu_logs", JSON.stringify(logs));

  }, interval);
}
function loadSettings(){

  const settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");

  Object.entries(settings).forEach(([key,value])=>{

    const el = document.getElementById(key);

    if(el){
      if(el.type === "checkbox"){
        el.checked = value === "on" || value === true;
      }else{
        el.value = value;
      }
    }

  });

}

window.addEventListener("load", ()=>{

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
function updateTimelineUI(){

  const container = document.getElementById("timelineList");
  if(!container) return;

  let timeline = JSON.parse(localStorage.getItem("micropmu_timeline") || "[]");

  container.innerHTML = "";

  timeline.slice().reverse().forEach(e=>{

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

function updateMemoryUsage(){

  if(!document.getElementById("memoryBar")) return;

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
  if(percent < 25){
    bar.style.background = "#4ade80";  // light green
    container.style.border = "2px solid #4ade80";
  }
  else if(percent < 50){
    bar.style.background = "#22c55e";  // dark green
    container.style.border = "2px solid #22c55e";
  }
  else if(percent < 70){
    bar.style.background = "#f97316";  // orange
    container.style.border = "2px solid #f97316";
  }
  else if(percent < 95){
    bar.style.background = "#dc2626";  // dark red
    container.style.border = "2px solid #dc2626";
  }

  // ================= ALERT (95%) =================
  if(percent >= 95 && percent < 98){

    if(!window._memWarned){
      alert("⚠ Storage Almost Full!");
      playBuzzer();
      window._memWarned = true;
    }
  }

  // ================= AUTO RESET (98%) =================
  if(percent >= 98){

    alert("🚨 Storage Critical! Auto Resetting Logs...");

    localStorage.removeItem("micropmu_logs");
    bar.style.width = "0%";
    text.innerText = "0%";

    stopBuzzer();
    window._memWarned = false;
  }

}

setInterval(updateMemoryUsage,2000);


/*********************************
 ADVANCED EXPORT CSV (FIXED)
**********************************/

function exportCSV(){

  let timeline = JSON.parse(localStorage.getItem("micropmu_timeline") || "[]");
  let logs = JSON.parse(localStorage.getItem("micropmu_logs") || "[]");

  if(logs.length === 0){
    alert("No Data Available");
    return;
  }

  // Get filters safely
  const startDate = document.getElementById("startDate")?.value;
  const endDate   = document.getElementById("endDate")?.value;
  const mode      = document.getElementById("exportMode")?.value || "full";
  const param     = document.getElementById("paramSelect")?.value || "all";
  const compareA  = document.getElementById("compareA")?.value || "";
  const compareB  = document.getElementById("compareB")?.value || "";

  // ===== Date Filtering =====
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

    if(mode === "fault"){
      keep = keep && (l.status !== "SYSTEM HEALTHY");
    }

    return keep;
  });

  if(filtered.length === 0){
    alert("No Records Match Filters");
    return;
  }

  // ===== Build Header =====
  let header = ["Timestamp"];

  if(param === "all"){
    header.push("Voltage","Current","Frequency","Power","PF","PhaseAngle","Temperature","Status");
  }else{
    header.push(param.charAt(0).toUpperCase()+param.slice(1));
  }

  if(compareA && compareB){
    header.push(compareA.toUpperCase()+" vs "+compareB.toUpperCase());
  }

  let csv = header.join(",") + "\n";

  // ===== Build Rows =====
  filtered.forEach(l=>{

    let row = [l.timestamp];

    if(param === "all"){
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
    }else{
      row.push(l[param]);
    }

    if(compareA && compareB){
      row.push(`${l[compareA]} | ${l[compareB]}`);
    }

    csv += row.join(",") + "\n";
  });

  // ===== Download =====
  const blob = new Blob([csv], {type:"text/csv"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "MicroPMU_Advanced_Report.csv";
  a.click();
}

/*********************************
 GPS CONNECTION 
**********************************/
function testGPS(){

  const enabled = document.getElementById("gpsEnable").checked;
  const lat = document.getElementById("gpsLat").value;
  const lng = document.getElementById("gpsLng").value;

  if(!enabled){
    alert("⚠ Enable GPS first");
    return;
  }

  if(!lat || !lng){
    alert("⚠ Enter Latitude & Longitude");
    return;
  }

  alert(`📍 GPS OK\nLat: ${lat}\nLng: ${lng}`);
}

/*************************************************
 REPORTS PAGE ENGINE
*************************************************/

if(document.getElementById("reportVoltage")){

  const ctxV = new Chart(document.getElementById("reportVoltage"),{
    type:"line",
    data:{labels:[],datasets:[{label:"Voltage",data:[],borderColor:"#38bdf8"}]}
  });

  const ctxC = new Chart(document.getElementById("reportCurrent"),{
    type:"line",
    data:{labels:[],datasets:[{label:"Current",data:[],borderColor:"#22c55e"}]}
  });

  const ctxP = new Chart(document.getElementById("reportPower"),{
    type:"line",
    data:{labels:[],datasets:[{label:"Power",data:[],borderColor:"#f97316"}]}
  });

  const ctxPF = new Chart(document.getElementById("reportPF"),{
    type:"line",
    data:{labels:[],datasets:[{label:"Power Factor",data:[],borderColor:"#a855f7"}]}
  });

  function loadReportData(range){

    const logs = JSON.parse(localStorage.getItem("micropmu_logs") || "[]");

    if(logs.length === 0){
      alert("No Data Available");
      return;
    }

    // Clear old data
    [ctxV,ctxC,ctxP,ctxPF].forEach(chart=>{
      chart.data.labels = [];
      chart.data.datasets[0].data = [];
    });

    logs.forEach(log=>{
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
  }

  window.showDaily = function(){
    loadReportData("Daily");
  };

  window.showWeekly = function(){
    loadReportData("Weekly");
  };

  window.showMonthly = function(){
    loadReportData("Monthly");
  };
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

function startFirebaseSync(){

  if(firebaseListenerStarted) return;

  try{

    const db = firebase.database();
    const ref = db.ref("micropmu/live");

    ref.on("value",(snapshot)=>{

      const data = snapshot.val();
      if(!data) return;

      const start = performance.now();

      let newV = parseFloat(data.voltage) || 0;
      let newI = parseFloat(data.current) || 0;
      let newF = parseFloat(data.frequency) || 50;
      let newPF = parseFloat(data.pf) || 0.95;
      let newTemp = parseFloat(data.temperature) || 0;

      // 🔥 ULTRA SMOOTH FILTER (FAST RESPONSE)
      const alpha = 0.4;

      voltage = voltage*(1-alpha) + newV*alpha;
      current = current*(1-alpha) + newI*alpha;

      frequency = newF;
      pf = Math.min(Math.max(newPF,0),1);
      temperature = newTemp;

      power = parseFloat((voltage * current * pf).toFixed(2));

      // ⚡ ENERGY CALCULATION
      let now = Date.now();
      let hours = (now - lastEnergyTime) / 3600000;

      energy = parseFloat((energy + (power/1000)*hours).toFixed(4));
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

  }catch(e){

    console.error("Firebase Sync Error:", e);
  }
}

/*********************************
 WIFI STATUS ENGINE
*********************************/

function updateWiFiStatus(){

  const led = document.getElementById("wifiLed");
  const bars = document.querySelectorAll("#signalBars .bar");
  const latencyText = document.getElementById("wifiLatency");

  if(!led || !latencyText) return;

  const latency = espLatency;

  latencyText.innerText = latency + " ms";

  bars.forEach(b=>b.style.background="#1e293b");

  if(latency < 40){
    led.style.background="#22c55e";

    bars[0].style.background="#22c55e";
    bars[1].style.background="#22c55e";
    bars[2].style.background="#22c55e";
    bars[3].style.background="#22c55e";
  }
  else if(latency < 80){

    led.style.background="#facc15";

    bars[0].style.background="#facc15";
    bars[1].style.background="#facc15";
    bars[2].style.background="#facc15";
  }
  else{

    led.style.background="#ef4444";

    bars[0].style.background="#ef4444";
  }
}

/*********************************
 SYNC STATUS ENGINE
*********************************/

function updateSyncStatus(){

  const el = document.getElementById("syncStatus");
  if(!el) return;

  if(systemMode==="esp" && espConnected)
    el.innerHTML="<span style='color:#22c55e'>● Connected</span>";

  else if(systemMode==="esp")
    el.innerHTML="<span style='color:#f97316'>● Searching</span>";

  else
    el.innerHTML="<span style='color:#94a3b8'>● Simulation</span>";
}

/* =====Test ESP Connection ===== */
function testESPConnection(){
  alert("ESP Connection Test Triggered");
}
/* ===== MODEL BUZZER CONTROL ===== */

function toggleModelBuzzer(){

  const settings = getSettings();
  const mode = settings.modelBuzzerMode || "auto";

  if(mode === "off"){
    alert("Model buzzer disabled");
    return;
  }

  if(mode === "auto"){
    alert("Auto mode active (triggered on faults)");
    return;
  }

  const ip = settings.deviceIP || "192.168.4.1";

  fetch(`http://${ip}/buzzer`)
    .then(()=>alert("Model buzzer toggled"))
    .catch(()=>alert("ESP not reachable"));
}

/* ================= SIGNAL BARS ================= */

function activateBars(count){

  const bars = document.querySelectorAll("#signalBars .bar");

  bars.forEach(bar=>bar.classList.remove("active"));

  for(let i=0;i<count;i++){
    if(bars[i]) bars[i].classList.add("active");
  }
}

/* ================= MODE SWITCHING ================= */

function applyModeFromSettings(){

  const settings = getSettings();
  systemMode = settings.systemMode || "simulation";

  if(document.getElementById("liveMode")){
    document.getElementById("liveMode").innerText =
      systemMode === "esp" ? "ESP Live Data" : "Simulation";
  }
}


// ================= SAFE MODE SWITCH WRAPPER =================

const originalUpdateSystem = updateSystem;

updateSystem = function(){

  const settings = getSettings();
  systemMode = settings.systemMode || "simulation";

  /* ===== ESP MODE ===== */
  if(systemMode === "esp"){
    updateDashboard();   // only UI update
    return;
  }

  /* ===== HYBRID SAFETY ===== */
  if(systemMode === "hybrid"){
    if(!window.analysisDataset || window.analysisDataset.length === 0){
      console.warn("No CSV dataset");
      return;
    }
  }

  /* ===== NORMAL FLOW ===== */
  originalUpdateSystem();
};
/* ================= SETTINGS AUTO APPLY ================= */

document.addEventListener("DOMContentLoaded",()=>{

  applyModeFromSettings();
  if(typeof firebase !== "undefined"){
  startFirebaseSync();
}
  if(typeof startSampling === "function"){
    startSampling();
  }
const settings = getSettings();

if(settings.systemMode === "esp"){
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

function loadFirebaseSafe(){

  if(!FIREBASE_ENABLED) return;

  try{

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

    script1.onload = ()=>{
      script2.onload = ()=>{
        firebase.initializeApp(firebaseConfig);
        initCloudSync();
      };
      document.head.appendChild(script2);
    };

    document.head.appendChild(script1);

  }catch(e){
    console.warn("Firebase load skipped.");
  }
}

/* ================= CLOUD SYNC ================= */

function initCloudSync(){

  try{

    const db = firebase.database();
    dbRef = db.ref("micropmu/live");

    setInterval(()=>{

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

    dbRef.on("value",(snapshot)=>{

      const data = snapshot.val();
      if(!data) return;

      voltage = data.voltage;
      current = data.current;
      frequency = data.frequency;
      power = data.power;
      pf = data.pf;
      phaseAngle = data.phaseAngle;
      temperature = data.temperature;

      updateDashboard();

    });

  }catch(e){
    console.warn("Cloud sync failed safely.");
  }
}

// ===== DEVICE HEARTBEAT =====
if(typeof firebase !== "undefined"){

  const deviceRef = firebase.database().ref("micropmu/devices/" + deviceId);

  setInterval(()=>{
    deviceRef.set({
      lastSeen: Date.now()
    });
  }, 2000);

  firebase.database().ref("micropmu/devices").on("value",(snap)=>{

    const devices = snap.val() || {};
    const now = Date.now();

    let active = 0;

    Object.values(devices).forEach(d=>{
      if(now - d.lastSeen < 5000){
        active++;
      }
    });

    connectedDevices = active;

    if(document.getElementById("deviceCount")){
      document.getElementById("deviceCount").innerText = active;
    }

  });

  window.addEventListener("beforeunload", ()=>{
    firebase.database().ref("micropmu/devices/" + deviceId).remove();
  });

}
/* =====================================
   DASHBOARD ACCESS CONTROL (FINAL CLEAN)
===================================== */

window.isAdminDevice = false;

function checkDashboardAccess(){

  const mode = localStorage.getItem("networkMode") || "local";
  const isAdmin = sessionStorage.getItem("adminVerified") === "true";

  const ACCESS_KEY = btoa("Rushii");

  function verifyAccess(input){
    return btoa(input) === ACCESS_KEY;
  }

  // ================= ADMIN MODE =================
  if(mode === "local"){
  return true;   // 🔥 NO PASSWORD for admin mode
}
  //             ===== SYNC MODE =====
else if(mode === "mirror"){

  // 🔥 already verified?
  if(sessionStorage.getItem("syncVerified") === "true"){
    return true;
  }

  showAccessPopup("mirror");
return false;

  // ✅ SAVE SESSION
  sessionStorage.setItem("syncVerified","true");

  return true;
}

  // ================= CLOUD MODE =================
  else if(mode === "remote"){

    if(sessionStorage.getItem("cloudVerified") === "true"){
      return true;
    }
    showAccessPopup("remote");
return false;

    return true;
  }

  return true;
}
/* =====================================
   QR GENERATOR (OPTIMIZED + SAFE)
===================================== */

function loadQRSafe(){

  const qrContainer = document.getElementById("qrCode");
  const linkBox = document.getElementById("shareLink");

  if(!qrContainer || !linkBox) return;

  try{

    const currentURL = window.location.origin;
    linkBox.value = currentURL;

    // Clear old QR (important)
    qrContainer.innerHTML = "";

    // Check if QR library already loaded
    if(typeof QRCode !== "undefined"){

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

    script.onload = ()=>{
  try{
    new QRCode(qrContainer, {
      text: currentURL,
      width: 180,
      height: 180
    });
      }catch(e){
        console.warn("QR generation failed.");
      }
    };

    document.head.appendChild(script);

  }catch(e){
    console.warn("QR module safe skip.");
  }
}
/* ================= INIT SAFE ================= */

document.addEventListener("DOMContentLoaded",()=>{

if(!checkDashboardAccess()) return;

loadFirebaseSafe();
loadQRSafe();

});

/*********************************
 SETTINGS + MODE + QR ENGINE
*********************************/

// Load saved settings
document.addEventListener("DOMContentLoaded", ()=>{

 let settings = JSON.parse(localStorage.getItem("micropmu_settings") || "{}");

 if(settings.systemMode){
   const modeEl = document.getElementById("systemMode");
   if(modeEl){
      modeEl.value = settings.systemMode;
   }
}

});


/* ================= LINK GENERATOR ================= */

function generateLink(){

 const linkBox = document.getElementById("shareLink");
 if(!linkBox) return;

 const currentURL = window.location.origin;
 linkBox.value = currentURL;
}

/* ================= QR GENERATOR ================= */

function generateQR(){

 const qrContainer = document.getElementById("qrCode");
 if(!qrContainer) return;

 qrContainer.innerHTML = "";

 const script = document.createElement("script");
 script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";

 script.onload = ()=>{
   new QRCode(qrContainer, window.location.origin);
 };

 document.head.appendChild(script);
}

/*************************************************
 FINAL GLOBAL SETTINGS BUTTONS FIX
*************************************************/

(function(){

// Prevent duplicate loading
if(window.__settingsButtonsLoaded) return;
window.__settingsButtonsLoaded = true;

/* ================= VERIFY ================= */

window.verifyAdmin = function(){

  const input = document.getElementById("adminPass");
  if(!input) return;

  if(input.value === "Rushii"){
    sessionStorage.setItem("adminVerified","true");
    alert("✅Admin Verified Successfully");
    input.value="";
  }else{
    alert("Wrong Password");
  }
};

/* ================= RESET ENERGY ================= */

window.secureResetEnergy = function(){

  if(sessionStorage.getItem("adminVerified") !== "true"){
    alert("Verify Admin First");
    return;
  }

  localStorage.removeItem("micropmu_energy");
  alert("Energy Counter Reset");
};

/* ================= CLEAR LOGS ================= */

window.secureClearLogs = function(){

  if(sessionStorage.getItem("adminVerified") !== "true"){
    alert("Verify Admin First");
    return;
  }

  localStorage.removeItem("micropmu_logs");
  alert("Logs Cleared");
};

/* ================= TEST BUZZER ================= */

window.testBuzzer = function(){

  if(typeof buzzer !== "undefined"){
    buzzer.play().then(()=>{
      setTimeout(()=>buzzer.pause(),1500);
    }).catch(()=>{});
  }else{
    alert("Buzzer not initialized");
  }
};

/* ================= LINK GENERATOR ================= */

window.generateLink = function(){

  const linkBox = document.getElementById("shareLink");
  if(!linkBox) return;

  linkBox.value = window.location.origin;
};

/* ================= QR GENERATOR ================= */

window.generateQR = function(){

  const qrContainer = document.getElementById("qrCode");
  if(!qrContainer) return;

  qrContainer.innerHTML = "";

  const script = document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";

  script.onload = function(){
    new QRCode(qrContainer, window.location.origin);
  };

  document.head.appendChild(script);
};

})();

// ========= START SAMPLING =========
startSampling();

function updateSystem(){

  const settings = getSettings();
  const mode = settings.systemMode || "simulation";

  // ================= SIMULATION =================
  if(mode === "simulation"){

    const vMode = random(1,10);

    if(vMode <= 7) voltage = random(218,235);
    else if(vMode === 8) voltage = random(190,210);
    else voltage = random(240,255);

    const cMode = random(1,10);

    if(cMode <= 3) current = 0;
    else if(cMode <= 7) current = parseFloat((Math.random()*2.5 + 0.3).toFixed(2));
    else if(cMode <= 9) current = random(3,8);
    else current = random(10,15);

    frequency = parseFloat((49.8 + Math.random()*0.4).toFixed(2));
    pf = parseFloat((0.90 + Math.random()*0.08).toFixed(2));
    temperature = parseFloat((32 + Math.random()*13).toFixed(1));

    power = parseFloat((voltage * current * pf).toFixed(1));
    phaseAngle = parseFloat((Math.acos(pf) * 180 / Math.PI).toFixed(1));

    updateDashboard();
  }

  // ================= ESP MODE =================
  else if(mode === "esp"){
    // 🔥 Firebase handles real-time data
    return;
  }

  // ================= HYBRID (CSV ANALYSIS) =================
  else if(mode === "hybrid"){

    if(!window.analysisDataset || window.analysisDataset.length === 0){
      console.warn("No CSV dataset loaded");
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

    if(analysisIndex >= window.analysisDataset.length){
      analysisIndex = 0;
    }

    updateDashboard();
  }
}
// ==============================================
// GLOBAL SAVE SETTINGS (CLEAN VERSION)
// ==============================================
window.saveSettings = function(){

  try{

    if(sessionStorage.getItem("adminVerified") !== "true"){
      alert("⚠ Verify Admin First");
      return;
    }

    const getVal = (id)=>{
      const el = document.getElementById(id);
      return el ? el.value : null;
    };

    const processingMode = document.getElementById("processingMode")?.value;

    if(processingMode === "analysis"){

      const fileInput = document.getElementById("analysisFile");

      if(!fileInput || fileInput.files.length === 0){
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
      networkMode: getVal("networkMode"),
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

    if(typeof applyProtectionSettings === "function") applyProtectionSettings();
    if(typeof applyModeFromSettings === "function") applyModeFromSettings();
    if(typeof updateSystemModeUI === "function") updateSystemModeUI();

    if(typeof startSampling === "function") startSampling();
    if(typeof startLogger === "function") startLogger();
    if(typeof startGraphEngine === "function") startGraphEngine();

    // ✅ SAFE ACCESS APPLY
    const mode = settings.networkMode;
    if(mode !== "local"){
      if(typeof checkDashboardAccess === "function") checkDashboardAccess();
    }

    if(typeof updateDashboard === "function") updateDashboard();

    applyProtectionSettings();
    applyModeFromSettings();
    updateSystemModeUI();
    updateDashboard();   // 🔥 IMPORTANT
    alert("✅ Settings Saved Successfully");

  }catch(e){

    console.error("Settings Error:", e);
    alert("❌ Error Saving Settings");

  }

};

/*************************************************
 PROFESSIONAL MSEDCL BILL CALCULATION (FINAL)
*************************************************/

window.calculateBill = function(){

  const powerKW = parseFloat(document.getElementById("calcPower")?.value) || 0;
  const pf = parseFloat(document.getElementById("calcPF")?.value) || 1;
  const hours = parseFloat(document.getElementById("calcHours")?.value) || 0;

  const tariffType = document.getElementById("consumerType")?.value || "res";
  const supplyPhase = document.getElementById("supplyPhase")?.value || "1";
  const supplyType = document.getElementById("supplyType")?.value || "LT";

  const units = powerKW * hours * pf;

  let breakdown = [];
  let energyCharge = 0;

  function slabCalc(u, slabs){
    let remaining = u;
    let total = 0;

    slabs.forEach(s=>{
      if(remaining > 0){
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

  // ENERGY SLABS (MSEDCL 2026 as per your structure)
  if(tariffType === "res"){
    energyCharge = slabCalc(units,[
      {limit:100, rate:4.43},
      {limit:200, rate:9.64},
      {limit:200, rate:12.83},
      {limit:Infinity, rate:14.33}
    ]);
  }else{
    energyCharge = slabCalc(units,[
      {limit:100, rate:5.88},
      {limit:200, rate:11.46},
      {limit:200, rate:15.72},
      {limit:Infinity, rate:17.81}
    ]);
  }

  // FIXED CHARGES
  let fixedCharge = 0;

  if(tariffType === "res"){
    if(supplyPhase === "1"){
      fixedCharge = (supplyType === "LT") ? 30 : 60;
    }else{
      fixedCharge = (supplyType === "LT") ? 100 : 155;
    }
  }else{
    if(supplyPhase === "1"){
      fixedCharge = (supplyType === "LT") ? 50 : 100;
    }else{
      fixedCharge = (supplyType === "LT") ? 120 : 200;
    }
  }

  // GST 18%
  const gst = (energyCharge + fixedCharge) * 0.18;

  // Electricity Duty 16% (typical Maharashtra)
  const electricityDuty = energyCharge * 0.16;

  const totalBill = energyCharge + fixedCharge + gst + electricityDuty;

  document.getElementById("unitResult").innerText =
      units.toFixed(2) + " kWh";

  document.getElementById("billResult").innerText =
      "₹ " + totalBill.toFixed(2);


  // STORE FOR DOWNLOAD
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



/*************************************************
 MSEDCL PROFESSIONAL BILL DOWNLOAD (FINAL)
*************************************************/

window.downloadBill = function(){

  if(!window._billData){
    alert("Please calculate bill first.");
    return;
  }

  const d = window._billData;

  const safe = (v) => Number(v || 0).toFixed(2);

  const billNumber = "MS-2026-" + Math.floor(100000 + Math.random()*900000);
  const billingDate = new Date().toLocaleString();

  const content =
`========================================================
 MAHARASHTRA STATE ELECTRICITY DISTRIBUTION CO. LTD.
                        (MSEDCL)
                ELECTRICITY BILL - 2026
========================================================

Bill Number      : ${billNumber}
Billing Date     : ${billingDate}

Consumer Type    : ${d.tariffType === "res" ? "Residential" : "Commercial"}
Supply Phase     : ${d.supplyPhase === "1" ? "Single Phase" : "Three Phase"}
Supply Type      : ${d.supplyType}

--------------------------------------------------------
Units Consumed   : ${safe(d.units)} kWh
--------------------------------------------------------

ENERGY CHARGE BREAKDOWN:
${d.breakdown.join("\n")}

--------------------------------------------------------
Energy Charge        : ₹${safe(d.energyCharge)}
Fixed Charge         : ₹${safe(d.fixedCharge)}
GST (18%)            : ₹${safe(d.gst)}
Electricity Duty 16% : ₹${safe(d.electricityDuty)}
--------------------------------------------------------
TOTAL AMOUNT PAYABLE : ₹${safe(d.totalBill)}
--------------------------------------------------------

Generated by Industrial Micro-PMU Billing System
========================================================`;

  const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "MSEDCL_Energy_Bill_2026.txt";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};


/*********************************
 PHASOR DIAGRAM
*********************************/

function drawPhasor(){

  const canvas = document.getElementById("phasorCanvas");
  if(!canvas) return;

  const ctx = canvas.getContext("2d");

  const w = canvas.width;
  const h = canvas.height;
  const cx = w/2;
  const cy = h/2;
  const radius = 100;

  ctx.clearRect(0,0,w,h);

  ctx.strokeStyle="#334155";
  ctx.beginPath();
  ctx.arc(cx,cy,radius,0,Math.PI*2);
  ctx.stroke();

  // voltage reference
  ctx.strokeStyle="#38bdf8";
  ctx.beginPath();
  ctx.moveTo(cx,cy);
  ctx.lineTo(cx+radius,cy);
  ctx.stroke();

  // current phasor
  const angle = phaseAngle * Math.PI/180;

  ctx.strokeStyle="#22c55e";
  ctx.beginPath();
  ctx.moveTo(cx,cy);
  ctx.lineTo(cx+radius*Math.cos(angle),cy-radius*Math.sin(angle));
  ctx.stroke();

}

setInterval(updateWiFiStatus,2000);
window.addEventListener("load", updateSystemModeUI);

/*********************************
 EXPORT SECTION AND UPLOAD PDF SECTION
*********************************/
function exportPDF(){

let logs = JSON.parse(localStorage.getItem("micropmu_logs") || "[]");

if(logs.length===0){
alert("No Fault Data");
return;
}

alert("Fault report exported.");
}

function exportBilling(){

alert("Billing audit exported.");
}

function loadAnalysisDataset(){

const fileInput = document.getElementById("analysisFile");

if(!fileInput || fileInput.files.length === 0) return;

const file = fileInput.files[0];

const reader = new FileReader();

reader.onload = function(e){

const text = e.target.result;

const rows = text.split("\n").slice(1);

const dataset = rows.map(r=>{

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

};

reader.readAsText(file);
analysisIndex = 0; // ✅ correct place
}

/**************Export Timeline**********************/
/*********************************************** */

function clearFaultHistory(){
  localStorage.removeItem("micropmu_timeline");
  alert("Timeline Cleared");

  // 🔥 UI refresh bhi kar
  if(typeof updateTimelineUI === "function"){
    updateTimelineUI();
  }
} 

function exportTimeline(){

  let timeline = JSON.parse(localStorage.getItem("micropmu_timeline") || "[]");

  if(timeline.length === 0){
    alert("No Timeline Data");
    return;
  }

  let csv = "Time,Type,Fault\n";

  timeline.forEach(e=>{
    csv += `${e.time},${e.type},${e.fault}\n`;
  });

  const blob = new Blob([csv], {type:"text/csv"});
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
window.testBuzzer = function(){
  if(typeof buzzer !== "undefined"){
    buzzer.play().then(()=>{
      setTimeout(()=>buzzer.pause(),1500);
    }).catch(()=>{});
  }else{
    alert("Buzzer not initialized");
  }
};

// Reset Energy
window.secureResetEnergy = function(){
  if(sessionStorage.getItem("adminVerified") !== "true"){
    alert("Verify Admin First");
    return;
  }
  localStorage.removeItem("micropmu_energy");
  alert("Energy Counter Reset");
};

// Clear Logs
window.secureClearLogs = function(){
  if(sessionStorage.getItem("adminVerified") !== "true"){
    alert("Verify Admin First");
    return;
  }
  localStorage.removeItem("micropmu_logs");
  alert("Logs Cleared");
};

// Verify Admin
window.verifyAdmin = function(){

  const input = document.getElementById("adminPass");

  if(input.value === "Rushii"){
    sessionStorage.setItem("adminVerified","true");
    alert("Admin Verified Successfully");
    input.value="";
  }else{
    alert("Wrong Password");
  }
};

/******************************************* */
/* New Code Merging 
/****************************************** */

let accessMode = "";
let attemptsLeft = 3;

function showAccessPopup(mode){

  accessMode = mode;
  attemptsLeft = 3;

  document.getElementById("accessPopup").style.display = "flex";
  document.getElementById("accessPass").value = "";

  document.getElementById("accessModeText").innerText =
    mode === "mirror" ? "🔁 Sync Mode Access" : "☁ Cloud Mode Access";

  document.getElementById("attemptInfo").innerText = "Attempts left: 3";

  setTimeout(()=>{
    document.getElementById("accessPopup").style.opacity = "1";
  },10);

  setTimeout(()=>{
    document.getElementById("accessPass")?.focus();
  },200);
}

function submitAccess(){

  const input = document.getElementById("accessPass").value;
  const ACCESS_KEY = btoa("Rushii");

  if(btoa(input) === ACCESS_KEY){

    if(accessMode === "mirror"){
      sessionStorage.setItem("syncVerified","true");
    }
    else if(accessMode === "remote"){
      sessionStorage.setItem("cloudVerified","true");
    }

    const popup = document.getElementById("accessPopup");
    popup.style.opacity = "0";

    setTimeout(()=>{
      popup.style.display = "none";
      location.reload();
    },300);

    return;
  }

  attemptsLeft--;

  if(attemptsLeft > 0){
    document.getElementById("attemptInfo").innerText =
      "Attempts left: " + attemptsLeft;
    alert("❌ Wrong Password");
  }
  else{
    document.body.innerHTML =
      "<h2 style='text-align:center;margin-top:100px'>⛔ Access Denied</h2>";
  }
}

function togglePass(){
  const input = document.getElementById("accessPass");
  const icon = document.getElementById("eyeIcon");

  if(input.type === "password"){
    input.type = "text";
    if(icon) icon.innerText = "🙈";
  } else {
    input.type = "password";
    if(icon) icon.innerText = "👁";
  }
}

window.logoutAccess = function(){

  // 🔥 clear session (main fix)
  sessionStorage.removeItem("syncVerified");
  sessionStorage.removeItem("cloudVerified");

  // optional (safe)
  sessionStorage.clear();

  alert("🚪 Logged Out Successfully");

  // 🔥 force reload (important)
  location.reload();
};