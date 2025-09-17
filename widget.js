// Leaders Widget (Buteurs & Passeurs) – two Tabulator tables + synced dropdowns

let divisions = []; // [{id, name}]
let leadersByDivision = {}; // { [id]: { topButs: Player[], topPasses: Player[] } }

let tableScorers = null;
let tableAssists = null;

let domReady = false;
let initReceived = false;
let pendingPayload = null;

// Fallback sample for standalone preview
const SAMPLE = {
  divisions: [
    { id: "Tr1", name: "Club Tomohawk" },
    { id: "Tr2", name: "Marie-Victorin" },
  ],
  leadersByDivision: {
    Tr1: {
      topButs: samplePlayers().sort((a,b)=>b.but-a.but).slice(0,5),
      topPasses: samplePlayers().sort((a,b)=>b.passes-a.passes).slice(0,5),
    },
    Tr2: {
      topButs: samplePlayers("T2").sort((a,b)=>b.but-a.but).slice(0,5),
      topPasses: samplePlayers("T2").sort((a,b)=>b.passes-a.passes).slice(0,5),
    },
  }
};

window.addEventListener("message", onMessageFromHost);
document.addEventListener("DOMContentLoaded", () => {
  domReady = true;
  if (pendingPayload){ processInitPayload(pendingPayload); pendingPayload = null; }

  // Standalone preview
  setTimeout(() => {
    if (!initReceived && !divisions.length){
      processInitPayload(SAMPLE);
    }
  }, 250);
});

function onMessageFromHost(event){
  const { type, payload } = event.data || {};
  if (!type) return;

  if (type === "INIT_WIDGET"){
    initReceived = true;
    if (!domReady) { pendingPayload = payload; return; }
    processInitPayload(payload);
  }

  if (type === "UPDATE_LEADERS" && payload?.divisionId){
    leadersByDivision[payload.divisionId] = payload.leaders || leadersByDivision[payload.divisionId] || {};
    // If current selects point to this division, refresh
    const current = getCurrentDivisionId();
    if (current === payload.divisionId){
      setScorers(current);
      setAssists(current);
    }
  }

  if (type === "SELECT_DIVISION" && payload?.divisionId){
    syncDropdowns(payload.divisionId);
    setScorers(payload.divisionId);
    setAssists(payload.divisionId);
  }
}

function processInitPayload(payload){
  divisions = Array.isArray(payload?.divisions) ? payload.divisions : [];
  leadersByDivision = payload?.leadersByDivision || {};
  if (!divisions.length) return;

  // Choose the first division that actually has data; else fallback to first.
  const firstWithData = divisions.find(d => {
    const pack = leadersByDivision[d.id];
    const has = !!(pack && ((pack.topButs && pack.topButs.length) || (pack.topPasses && pack.topPasses.length)));
    return has;
  });
  const initialId = firstWithData?.id || divisions[0].id;

  // Build dropdowns
  const selSc = document.getElementById("selectScorers");
  const selAs = document.getElementById("selectAssists");
  fillSelect(selSc, divisions);
  fillSelect(selAs, divisions);

  // Seed data for initial division
  const seedPack = leadersByDivision[initialId] || {};
  const seedScorers = (seedPack.topButs || []).map(sanitizeRow);
  const seedAssists = (seedPack.topPasses || []).map(sanitizeRow);

  // Build tables WITH initial data (prevents the “empty until change” defect)
  tableScorers = buildTable("#tableScorers", "but", seedScorers);
  tableAssists = buildTable("#tableAssists", "passes", seedAssists);

  // Reflect selection in both dropdowns
  selSc.value = initialId;
  selAs.value = initialId;

  // Keep both dropdowns in sync going forward
  const onChange = (e) => {
    const val = e.target.value;
    syncDropdowns(val);
    setScorers(val);
    setAssists(val);
  };
  selSc.addEventListener("change", onChange);
  selAs.addEventListener("change", onChange);
}

function getCurrentDivisionId(){
  return document.getElementById("selectScorers")?.value || document.getElementById("selectAssists")?.value;
}

function fillSelect(selectEl, items){
  selectEl.innerHTML = "";
  for (const d of items){
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.name || d.id;
    selectEl.appendChild(opt);
  }
}

function syncDropdowns(val){
  const a = document.getElementById("selectScorers");
  const b = document.getElementById("selectAssists");
  if (a && a.value !== val) a.value = val;
  if (b && b.value !== val) b.value = val;
}

function setScorers(divisionId){
  const pack = leadersByDivision[divisionId] || {};
  const rows = (pack.topButs || []).map(sanitizeRow);
  tableScorers.replaceData(rows);
}

function setAssists(divisionId){
  const pack = leadersByDivision[divisionId] || {};
  const rows = (pack.topPasses || []).map(sanitizeRow);
  tableAssists.replaceData(rows);
}

function buildTable(rootSelector, primaryField, initialData = []){
  return new Tabulator(rootSelector, {
    data: initialData,
    layout: getLayout(),
    index: "id",
    reactiveData: false,
    height: "auto",
    rowHeight: 88, // match --row-h for crisp sizing
    selectable: 0,
    responsiveLayout: false,
    headerSort: true,
    columnDefaults: { headerSort: true, resizable: false, headerHozAlign: "center", hozAlign: "center", widthGrow: 0 },
    columns: [
      playerColumn(),
      metricColumn(primaryField),
    ],
  });
}

function getLayout(){
  // Always fit columns to the available width (esp. on mobile)
  return "fitColumns";
}

function playerColumn(){
  return {
    title: "Joueur", field: "nom", minWidth: 200, widthGrow: 1,
    hozAlign: "left", headerHozAlign: "left", frozen: false, sorter: "string",
    formatter: (cell) => {
      const d = cell.getRow().getData();
      const name = escapeHtml(d.nom || d.title || "");
      const url  = d.playerUrl || d.dPLink || "";
      const photo = d.photo || "";
      const numero = d.numero || d.no || "";

      const initials = name.substring(0,2).toUpperCase();
      const photoHtml = photo
        ? `<div class="player-photo-wrap" title="${name}">
             <img src="${escapeAttr(photo)}" alt="${name}" class="player-photo" onerror="this.style.display='none'">
           </div>`
        : `<div class="player-photo-wrap initials" title="${name}">${initials}</div>`;
      const numeroHtml = numero ? `<span class="jersey-number">#${escapeHtml(numero)}</span>` : "";

      const content = `${photoHtml}
        <div>
          <div class="player-name">${name}</div>
          ${numeroHtml}
        </div>`;

      return url
        ? `<div class="player-link" data-href="${escapeAttr(url)}">${content}</div>`
        : `<div class="player-text">${content}</div>`;
    },
    cellClick: (_e, cell) => {
      const d = cell.getRow().getData();
      const url = d.playerUrl || d.dPLink;
      if (url){
        // Let host (Wix page) handle navigation
        window.parent?.postMessage({
          type: "PLAYER_CLICK",
          payload: { playerName: d.nom || d.title, url }
        },"*");
      }
    }
  };
}

function metricColumn(field){
  const title = field === "but" ? "Buts" : "Passes";
  return {
    title, field, sorter: "number", headerSortStartingDir: "desc",
    formatter: (c) => `<div class="stats-cell">${toNum(c.getValue())}</div>`
  };
}

// --------- helpers ---------
function sanitizeRow(r){
  const out = {...r};
  out.nom = out.nom || out.title || "";
  out.but = toNum(out.but);
  out.passes = toNum(out.passes);
  out.id = out._id || `${out.nom}-${out.numero || ""}-${Math.random().toString(36).slice(2,8)}`;
  return out;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }
function escapeAttr(s){ return String(s).replace(/"/g,'&quot;'); }
function toNum(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
function samplePlayers(suffix=""){
  return [
    { nom:`Alex Johnson${suffix}`, numero:"9",  but:12, passes:3,  photo:"", dPLink:"#"},
    { nom:`John Doe${suffix}`,     numero:"10", but:8,  passes:7,  photo:"", dPLink:"#"},
    { nom:`Mike Smith${suffix}`,   numero:"7",  but:6,  passes:8,  photo:"", dPLink:"#"},
    { nom:`Chris Wilson${suffix}`, numero:"4",  but:2,  passes:12, photo:"", dPLink:"#"},
    { nom:`David Brown${suffix}`,  numero:"1",  but:1,  passes:1,  photo:"", dPLink:"#"},
  ];
}
