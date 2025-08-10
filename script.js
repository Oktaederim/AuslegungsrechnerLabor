// --- Konstanten / Hilfsfunktionen (Deutsch) ---
const CP_AIR = 1.005; // kJ/kgK
const H_FG = 2500;    // kJ/kg (vereinfachend)
function p_ws_Pa(Tc){ return 610.94 * Math.exp((17.625*Tc)/(Tc+243.04)); }
function x_from_pw(pw, p){ return 0.62198 * pw / (p - pw); }
function pw_from_x(x, p){ return (x * p) / (0.62198 + x); }
function relhum_from_T_x(Tc, x, p){ const pw = pw_from_x(x, p); return Math.max(0, Math.min(1, pw / p_ws_Pa(Tc))); }
function x_from_T_RH(Tc, RH, p){ const pw = RH * p_ws_Pa(Tc); return x_from_pw(pw, p); }
function Tdp_from_pw(pw){ const ln = Math.log(pw/610.94); return (243.04*ln)/(17.625 - ln); }
function Tdp_from_x(x, p){ return Tdp_from_pw(pw_from_x(x,p)); }
function abs_humidity_gm3(Tc, x, p){ const Rv=461.5; const T=Tc+273.15; const pw=pw_from_x(x,p); const rho_v = pw/(Rv*T); return rho_v*1e3; }
function fix(n, d=2){ return Number.isFinite(n) ? n.toFixed(d) : "–"; }
function clamp(n, a, b){ return Math.min(Math.max(n, a), b); }

// --- DOM Referenzen ---
const el = (id)=>document.getElementById(id);

const fields = [
  "L","B","H","T_room","x_room_gpkg","RH_room_pct","T_supply",
  "T_OA","RH_OA_pct","OA_frac_pct","Vdot_user","rho_air","p_bar_hPa",
  "n_persons","P_sens_pp_W","m_lat_pp_kgph","Q_int_sens_kW","m_int_lat_kgph",
  "ACH_min","OA_per_person","OA_min_m3ph"
];

const radios = {
  feuchteMode: () => document.querySelector('input[name="feuchteMode"]:checked').value,
  sizeMode: () => document.querySelector('input[name="sizeMode"]:checked').value
};

// Szenarien (lokal)
const STORAGE_KEY = "lab_auslegung_szenarien_v3";

function loadScenarios(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch{ return {}; }
}
function saveScenarios(db){ localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
function scenarioFromUI(){
  const data = {};
  fields.forEach(k => data[k] = parseFloat(el(k).value));
  data.feuchteMode = radios.feuchteMode();
  data.sizeMode = radios.sizeMode();
  return data;
}
function applyScenario(data){
  fields.forEach(k => { if(k in data){ el(k).value = data[k]; }});
  document.querySelector(`input[name="feuchteMode"][value="${data.feuchteMode||'abs'}"]`).checked = true;
  document.querySelector(`input[name="sizeMode"][value="${data.sizeMode||'auto'}"]`).checked = true;
  el("Vdot_user").disabled = data.sizeMode !== "fixed";
  toggleFeuchteInputs();
  compute();
}
function refreshScenarioSelect(){
  const db = loadScenarios();
  const sel = el("scenarioSelect");
  sel.innerHTML = '<option value="">Szenario laden …</option>';
  Object.keys(db).forEach(k => {
    const opt = document.createElement("option");
    opt.value = k; opt.textContent = k;
    sel.appendChild(opt);
  });
}

function toggleFeuchteInputs(){
  const mode = radios.feuchteMode();
  el("labelAbs").classList.toggle("hidden", mode !== "abs");
  el("labelRel").classList.toggle("hidden", mode !== "rel");
}

function compute(){
  const status = el("status");
  status.textContent = "";

  const L = parseFloat(el("L").value);
  const B = parseFloat(el("B").value);
  const H = parseFloat(el("H").value);
  const T_room = parseFloat(el("T_room").value);
  const feuchteMode = radios.feuchteMode();
  const x_room_gpkg = parseFloat(el("x_room_gpkg").value);
  const RH_room_pct = parseFloat(el("RH_room_pct").value);
  const T_supply = parseFloat(el("T_supply").value);

  const T_OA = parseFloat(el("T_OA").value);
  const RH_OA_pct = parseFloat(el("RH_OA_pct").value);
  const OA_frac_pct = clamp(parseFloat(el("OA_frac_pct").value), 0, 100);
  el("OA_frac_pct").value = OA_frac_pct;
  const rho_air = parseFloat(el("rho_air").value);
  const p_bar_hPa = parseFloat(el("p_bar_hPa").value);

  const n_persons = Math.max(0, parseInt(el("n_persons").value,10) || 0);
  const P_sens_pp_W = parseFloat(el("P_sens_pp_W").value);
  const m_lat_pp_kgph = parseFloat(el("m_lat_pp_kgph").value);

  const Q_int_sens_kW = parseFloat(el("Q_int_sens_kW").value);
  const m_int_lat_kgph = parseFloat(el("m_int_lat_kgph").value);

  const sizeMode = radios.sizeMode();
  const Vdot_user = parseFloat(el("Vdot_user").value);

  const ACH_min = Math.max(0, parseFloat(el("ACH_min").value));
  const OA_per_person = Math.max(0, parseFloat(el("OA_per_person").value));
  const OA_min_m3ph = Math.max(0, parseFloat(el("OA_min_m3ph").value));

  const P = p_bar_hPa * 100; // Pa
  const V_room = L*B*H;
  el("Vroom").textContent = fix(V_room,2);

  // Raumfeuchte x
  const x_room = (feuchteMode === "abs")
    ? (x_room_gpkg/1000)
    : x_from_T_RH(T_room, RH_room_pct/100, P);

  const RH_room_calc = relhum_from_T_x(T_room, x_room, P)*100;
  el("RH_room_calc").textContent = fix(RH_room_calc,1);

  // Außenluft
  const x_OA = x_from_T_RH(T_OA, RH_OA_pct/100, P);
  el("x_oa_label").textContent = fix(x_OA*1000,2);

  // Interne Lasten inkl. Personen
  const Q_people_kW = (n_persons * P_sens_pp_W) / 1000;
  const Q_int_total_sens_kW = Q_people_kW + Q_int_sens_kW;

  const m_people_lat_kgph = n_persons * m_lat_pp_kgph;
  const m_int_total_lat_kgph = m_people_lat_kgph + m_int_lat_kgph;
  const m_int_lat_kgps = Math.max(0, m_int_total_lat_kgph)/3600;

  // --- Stabile Auto-Auslegung ---
  const Vdot_ACH_m3ph = ACH_min * V_room; // m³/h
  const m_dot_ACH = (rho_air * Vdot_ACH_m3ph) / 3600; // kg/s

  const OA_frac_input = clamp(OA_frac_pct / 100, 0, 1);
  const Vdot_guess = Vdot_ACH_m3ph;
  const Vdot_OA_min_persons = n_persons * OA_per_person; // m³/h
  const Vdot_OA_by_frac_guess = Vdot_guess * OA_frac_input;
  const Vdot_OA_eff_guess = Math.max(Vdot_OA_by_frac_guess, Vdot_OA_min_persons, OA_min_m3ph);
  const OA_frac_eff_guess = Vdot_guess > 0 ? (Vdot_OA_eff_guess / Vdot_guess) : 0;

  const DT_room_supply = (T_room - T_supply);
  const DT_OA_room = (T_OA - T_room);
  const DT_eff_guess = DT_room_supply - OA_frac_eff_guess * DT_OA_room;

  const EPS = 0.2; // K
  let m_dot_auto = NaN;
  let governing = "";
  if (DT_eff_guess <= EPS) {
    m_dot_auto = m_dot_ACH;
    governing = "ACH (ΔT/AL unzulässig)";
  } else {
    m_dot_auto = (Q_int_total_sens_kW) / (CP_AIR * DT_eff_guess);
    if (!Number.isFinite(m_dot_auto) || m_dot_auto <= 0) m_dot_auto = m_dot_ACH;
    governing = "sensibel/ACH";
    if (m_dot_auto < m_dot_ACH) { m_dot_auto = m_dot_ACH; governing = "ACH"; }
  }

  // Modus wählen
  let governingMode = "";
  let m_dot;
  if (sizeMode === "auto") {
    m_dot = m_dot_auto;
    governingMode = governing;
  } else {
    m_dot = (rho_air * Vdot_user) / 3600;
    governingMode = "fix";
  }

  // Endgültiger effektiver Außenluftanteil
  const Vdot_m3ph = Number.isFinite(m_dot) ? (m_dot*3600)/rho_air : NaN;
  const Vdot_OA_by_frac = Number.isFinite(Vdot_m3ph) ? Vdot_m3ph * OA_frac_input : NaN;
  const Vdot_OA_eff = Number.isFinite(Vdot_m3ph)
    ? Math.max(Vdot_OA_by_frac, Vdot_OA_min_persons, OA_min_m3ph)
    : Math.max(Vdot_OA_min_persons, OA_min_m3ph);
  const OA_frac_eff = (Number.isFinite(Vdot_m3ph) && Vdot_m3ph>0) ? (Vdot_OA_eff / Vdot_m3ph) : 0;

  // Ausgabe Luftmengen
  el("m_dot").textContent = fix(m_dot,3);
  el("Vdot").textContent = fix(Vdot_m3ph,0);
  el("Vdot_OA").textContent = Number.isFinite(Vdot_OA_eff) ? fix(Vdot_OA_eff,0) : "–";
  el("governing").textContent = governingMode;

  // Referenz: nur sensibel ohne Nebenbedingungen
  const DT_eff_only = (T_room - T_supply) - OA_frac_input*(T_OA - T_room);
  let Vdot_sensible_only = NaN;
  if (DT_eff_only > 0.2) {
    const m_dot_only = Q_int_total_sens_kW / (CP_AIR * DT_eff_only);
    Vdot_sensible_only = (m_dot_only*3600)/rho_air;
  }
  el("Vdot_sensible_only").textContent = fix(Vdot_sensible_only,0);

  // Erforderliche Zuluftfeuchte (mit OA_frac_eff)
  const x_supply_needed = Number.isFinite(m_dot)
    ? (x_room - (m_int_lat_kgps / m_dot) - OA_frac_eff * (x_OA - x_room))
    : NaN;

  // Register-Taupunkt
  const Tdp_coil = Number.isFinite(x_supply_needed) ? Tdp_from_x(x_supply_needed, P) : NaN;

  // Leistungen (sensibel, latent)
  const Q_sens_kW = Number.isFinite(m_dot) ? (m_dot*CP_AIR*(T_room - T_supply)) : NaN;
  const Q_sens_OA_kW = Number.isFinite(m_dot) ? (m_dot*CP_AIR*OA_frac_eff*(T_OA - T_room)) : NaN;

  const Lat_OA_kW = (Number.isFinite(m_dot) && Number.isFinite(x_supply_needed))
    ? (m_dot * OA_frac_eff * Math.max(0, x_OA - x_supply_needed) * H_FG)
    : NaN;
  const Lat_internal_kW = m_int_lat_kgps * H_FG;
  const Q_lat_kW = (Number.isFinite(Lat_OA_kW) ? Lat_OA_kW : 0) + Lat_internal_kW;

  const Q_total_kW = (Number.isFinite(Q_sens_kW) ? Q_sens_kW : 0) + Q_lat_kW;

  // Nacherwärmung
  const Q_reheat_kW = (Number.isFinite(m_dot) && Number.isFinite(Tdp_coil))
    ? Math.max(0, m_dot*CP_AIR*(T_supply - Tdp_coil))
    : NaN;

  // Kondensat
  const m_cond_kgph = (Q_lat_kW * 3600) / H_FG;

  // Befeuchtungsbedarf (Winterannahme: keine Entfeuchtung)
  let m_hum_kgps = NaN;
  if (Number.isFinite(m_dot)) {
    const deficit = OA_frac_eff * (x_room - x_OA); // kg/kg
    m_hum_kgps = m_dot * Math.max(0, deficit) - m_int_lat_kgps;
    if (!Number.isFinite(m_hum_kgps)) m_hum_kgps = NaN;
  }
  const m_hum_kgph = Number.isFinite(m_hum_kgps) ? (m_hum_kgps * 3600) : NaN;
  const Q_hum_kW = Number.isFinite(m_hum_kgps) ? (Math.max(0, m_hum_kgps) * H_FG) : NaN;

  // Ausgabe Leistungen/Feuchten
  el("Q_sens").textContent = fix(Q_sens_kW,2);
  el("Q_sens_OA").textContent = fix(Q_sens_OA_kW,2);
  el("Q_sens_int").textContent = fix(Q_int_total_sens_kW,2);

  el("Q_lat_OA").textContent = fix(Lat_OA_kW,2);
  el("Q_lat_int").textContent = fix(Lat_internal_kW,2);
  el("Q_lat").textContent = fix(Q_lat_kW,2);

  el("Q_total").textContent = fix(Q_total_kW,2);
  el("x_supply").textContent = Number.isFinite(x_supply_needed) ? fix(x_supply_needed*1000,2) : "–";
  el("x_supply_gm3").textContent = (Number.isFinite(x_supply_needed) && Number.isFinite(T_supply)) ? fix(abs_humidity_gm3(T_supply, x_supply_needed, P),2) : "–";
  el("Tdp_coil").textContent = fix(Tdp_coil,2);
  el("Q_reheat").textContent = fix(Q_reheat_kW,2);
  el("m_cond").textContent = fix(m_cond_kgph,2);

  el("m_hum").textContent = fix(Math.max(0, m_hum_kgph),2);
  el("Q_hum").textContent = fix(Math.max(0, Q_hum_kW),2);

  el("x_room_label").textContent = fix(x_room*1000,2);
  el("x_room_gm3").textContent = fix(abs_humidity_gm3(T_room, x_room, P),2);
  el("rh_room_label").textContent = fix(RH_room_calc,1);
  el("tdp_room_label").textContent = fix(Tdp_from_x(x_room, P),2);
  el("x_oa_label_2").textContent = fix(x_OA*1000,2);
  el("x_oa_gm3").textContent = fix(abs_humidity_gm3(T_OA, x_OA, P),2);
  el("tdp_oa_label").textContent = fix(Tdp_from_x(x_OA, P),2);

  // Warnungen
  const warns = [];
  if(Number.isFinite(Vdot_m3ph) && Vdot_m3ph < Vdot_ACH_m3ph){
    warns.push(`Zuluft unterschreitet Mindest-ACH (${fix(ACH_min,1)} 1/h) – automatisch auf ${fix(Vdot_ACH_m3ph,0)} m³/h angehoben.`);
  }
  if(Number.isFinite(Vdot_OA_eff) && Number.isFinite(Vdot_m3ph) && (Vdot_OA_eff > Vdot_m3ph)){
    warns.push("Erforderliche Außenluft übersteigt die Gesamt-Zuluft. Bitte Volumenstrom erhöhen oder Außenluftanforderung reduzieren.");
  }
  if(Number.isFinite(x_supply_needed) && x_supply_needed > x_room + 1e-6){
    warns.push("Erforderliche Zuluft wäre feuchter als der Raum – Feuchteeinträge / Außenluftanteil prüfen.");
  }
  if(Number.isFinite(x_supply_needed) && x_supply_needed < 0.001){
    warns.push("Sehr niedrige erforderliche Zuluft-Feuchte – sehr tiefer Register-Taupunkt erforderlich.");
  }
  if(Number.isFinite(m_hum_kgph) && m_hum_kgph > 0){
    warns.push(`Befeuchtung erforderlich: ca. ${fix(m_hum_kgph,2)} kg/h (≈ ${fix(Q_hum_kW,2)} kW).`);
  }
  el("warnings").innerHTML = warns.map(w => `<div>• ${w}</div>`).join("");
}

function bind(){
  // Eingaben neu berechnen
  fields.forEach(id => el(id).addEventListener("input", compute));
  document.querySelectorAll('input[name="feuchteMode"]').forEach(r => r.addEventListener("change", ()=>{ toggleFeuchteInputs(); compute(); }));
  document.querySelectorAll('input[name="sizeMode"]').forEach(r => r.addEventListener("change", ()=>{
    el("Vdot_user").disabled = (radios.sizeMode() !== "fixed");
    compute();
  }));

  // Buttons
  el("btnReset").addEventListener("click", ()=>{
    const defaults = {
      L:5,B:5,H:3,T_room:21,x_room_gpkg:5.4,RH_room_pct:35,T_supply:16,
      T_OA:30,RH_OA_pct:50,OA_frac_pct:15,Vdot_user:2600,rho_air:1.2,p_bar_hPa:1013,
      n_persons:2,P_sens_pp_W:70,m_lat_pp_kgph:0.05,Q_int_sens_kW:1.0,m_int_lat_kgph:0.3,
      ACH_min:6, OA_per_person:20, OA_min_m3ph:100, feuchteMode:"abs", sizeMode:"auto"
    };
    applyScenario(defaults);
    el("status").textContent = "Zurückgesetzt.";
  });

  el("btnSave").addEventListener("click", ()=>{
    const name = prompt("Szenarioname (eindeutig):");
    if(!name) return;
    const db = loadScenarios();
    db[name] = scenarioFromUI();
    saveScenarios(db);
    refreshScenarioSelect();
    el("scenarioSelect").value = name;
    el("status").textContent = "Szenario gespeichert.";
  });

  el("btnDelete").addEventListener("click", ()=>{
    const sel = el("scenarioSelect").value;
    if(!sel) return;
    const db = loadScenarios();
    delete db[sel];
    saveScenarios(db);
    refreshScenarioSelect();
    el("scenarioSelect").value = "";
    el("status").textContent = "Szenario gelöscht.";
  });

  el("scenarioSelect").addEventListener("change", (e)=>{
    const key = e.target.value;
    if(!key) return;
    const db = loadScenarios();
    if(db[key]) applyScenario(db[key]);
  });

  // Einfach/Erweitert
  const adv = document.getElementById("toggleAdvanced");
  if (adv){
    const apply = ()=>{
      document.querySelectorAll(".advanced").forEach(n=>{
        n.style.display = adv.checked ? "" : "none";
      });
    };
    adv.addEventListener("change", apply);
    apply();
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  bind();
  refreshScenarioSelect();
  toggleFeuchteInputs();
  compute();
});
