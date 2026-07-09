import { startRealtimeListener } from "./firestoreService.js?v=20260708-4";
import { demoRecords } from "../data/demoData.js?v=20260708-4";
import { updateCharts } from "./charts.js?v=20260708-9";
import { PLANT_AREA, buildPlantRecords, getWorstState, normalizeStateClass, renderProcessMap } from "./processMap.js?v=20260708-5";
import { getAlarmConfig, initAlarmAdmin, onAlarmConfigChange, updateAdminStats } from "./alarmAdmin.js?v=20260708-4";

const state = {
  records: [],
  sourceLabel: "Inicializando",
  selectedArea: PLANT_AREA,
  selectedPeriodHours: 24,
  connected: false
};

const elements = {
  plantStatusDot: document.getElementById("plantStatusDot"),
  plantStatusLabel: document.getElementById("plantStatusLabel"),
  lastUpdated: document.getElementById("lastUpdated"),
  currentShift: document.getElementById("currentShift"),
  processMap: document.getElementById("processMap"),
  historyTableBody: document.getElementById("historyTableBody"),
  alarmsList: document.getElementById("alarmsList"),
  alarmCount: document.getElementById("alarmCount"),
  periodFilter: document.getElementById("periodFilter"),
  countPila1: document.getElementById("countPila1"),
  countPila2: document.getElementById("countPila2"),
  countPila3: document.getElementById("countPila3")
};

bindControls();
initAlarmAdmin();
onAlarmConfigChange(() => render());

startRealtimeListener((records) => {
  const hasRecords = records.length > 0;

  state.records = normalizeRecords(hasRecords ? records : demoRecords);
  state.sourceLabel = hasRecords ? "Firestore en tiempo real" : "Demo local: Firestore vacio";
  updateAdminStats({
    count: records.length,
    lastRecord: records[0]?.timestampCreacion?.toDate?.()?.toISOString?.() || records[0]?.timestampCreacion || null,
    connected: state.connected
  });

  render();
}, (connected) => {
  state.connected = connected;
  updateAdminStats({ connected });
});

function bindControls() {
  elements.periodFilter.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-period]");
    if (!button) return;

    state.selectedPeriodHours = Number(button.dataset.period);
    setActiveButton(elements.periodFilter, button);
    render();
  });
}

function setActiveButton(group, activeButton) {
  group.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("is-active", button === activeButton);
  });
}

function render() {
  const latest = state.records[0];
  const recentRecords = filterByPeriod(state.records, state.selectedPeriodHours);
  const filteredRecords = filterByArea(recentRecords, state.selectedArea);
  const alarmConfig = getAlarmConfig();
  const plantState = getWorstState(recentRecords, alarmConfig);

  elements.plantStatusLabel.textContent = plantState;
  elements.plantStatusDot.className = `status-dot ${normalizeStateClass(plantState)}`;
  elements.lastUpdated.textContent = `Ultima actualizacion: ${latest ? formatDateTime(latest.timestampCreacion) : "--"}`;
  elements.currentShift.textContent = `Turno actual: ${latest?.turno || "--"}`;

  renderProcessMap(elements.processMap, state.records, state.selectedArea, handleProcessSelection, alarmConfig);
  renderAlarms(recentRecords);
  renderHistoryTable(state.records.slice(0, 30));
  renderMobileSummary(state.records);
  updateCharts(filteredRecords, {
    selectedArea: state.selectedArea,
    sourceRecords: recentRecords,
    alarmConfig
  });
}

function handleProcessSelection(area) {
  state.selectedArea = area;
  render();
}

function renderAlarms(records) {
  const alarms = records.flatMap(expandRecordAlarms)
    .slice(0, window.matchMedia("(max-width: 820px)").matches ? 5 : 8);

  elements.alarmCount.textContent = `${alarms.length} eventos`;

  if (!alarms.length) {
    elements.alarmsList.innerHTML = `<p class="empty-state">Sin alarmas activas recientes.</p>`;
    return;
  }

  elements.alarmsList.innerHTML = alarms.map((alarm) => {
    const stateClass = normalizeStateClass(alarm.severidad);

    return `
      <article class="alarm-row">
        <time>${escapeHtml(alarm.hora)}</time>
        <strong>${escapeHtml(alarm.activo)}</strong>
        <span>${escapeHtml(alarm.variable)}${alarm.valor !== "" ? `: ${escapeHtml(alarm.valor)} ${escapeHtml(alarm.unidad)}` : ""}<br>${escapeHtml(alarm.limite)}</span>
        <span class="state-pill ${stateClass}">${escapeHtml(alarm.severidad)}</span>
        <p>${escapeHtml(alarm.observacion || "Sin observacion")}</p>
      </article>
    `;
  }).join("");
}

function expandRecordAlarms(record) {
  if (Array.isArray(record.alarmasActivas) && record.alarmasActivas.length) {
    return record.alarmasActivas.map((alarm) => ({
      hora: record.hora || formatTime(record.timestampCreacion),
      activo: alarm.activo || alarm.subarea || record.subarea || "--",
      variable: alarm.variable || alarm.nombre || "Variable",
      valor: alarm.valor ?? "",
      unidad: alarm.unidad || "",
      limite: alarm.limiteSuperado || alarm.limite || "",
      severidad: normalizeStateLabel(alarm.severidad || alarm.estado || record.estado),
      observacion: alarm.observacion || record.observacion || ""
    })).sort((a, b) => severityRank(b.severidad) - severityRank(a.severidad));
  }
  if (!["alerta", "critico"].includes(normalizeStateClass(record.estado))) return [];
  return [{
    hora: record.hora || formatTime(record.timestampCreacion),
    activo: record.subarea || "--",
    variable: getDominantVariable(record),
    valor: "",
    unidad: "",
    limite: "",
    severidad: record.estado,
    observacion: record.observacion
  }];
}

function severityRank(value) {
  const stateClass = normalizeStateClass(value);
  return stateClass === "critico" ? 3 : stateClass === "alerta" ? 2 : 1;
}

function renderHistoryTable(records) {
  elements.historyTableBody.innerHTML = records.map((record) => {
    const stateClass = normalizeStateClass(record.estado);

    return `
      <tr>
        <td>${escapeHtml(record.fecha || formatDate(record.timestampCreacion))}</td>
        <td>${escapeHtml(record.hora || formatTime(record.timestampCreacion))}</td>
        <td>${escapeHtml(record.turno || "--")}</td>
        <td>${escapeHtml(record.subarea || "--")}</td>
        <td>${formatNumber(record.flujoPLS, 0)} m3/h</td>
        <td>${formatNumber(record.flujoRefino, 0)} m3/h</td>
        <td>${formatNumber(record.acidezRefino, 2)} g/L</td>
        <td>${formatNumber(record.cuPls, 2)} g/L</td>
        <td>${formatNumber(record.nivelPiscinaRefino, 0)}%</td>
        <td>${formatNumber(record.nivelPiscinaPLS, 0)}%</td>
        <td><span class="state-pill ${stateClass}">${escapeHtml(record.estado)}</span></td>
      </tr>
    `;
  }).join("");
}

function renderMobileSummary(records) {
  const last24 = filterByPeriod(records, 24);

  elements.countPila1.textContent = countBySubarea(last24, "Pila 1");
  elements.countPila2.textContent = countBySubarea(last24, "Pila 2");
  elements.countPila3.textContent = countBySubarea(last24, "Pila 3");
}

function countBySubarea(records, subarea) {
  return records.filter((record) => record.subarea === subarea).length;
}

function filterByArea(records, area) {
  if (area === PLANT_AREA) return buildPlantRecords(records);
  return records.filter((record) => record.subarea === area);
}

function filterByPeriod(records, hours) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return records.filter((record) => new Date(record.timestampCreacion).getTime() >= cutoff);
}

function normalizeRecords(records) {
  return records
    .map((record) => {
      const timestampCreacion = normalizeTimestamp(record.timestampCreacion, record.fecha, record.hora);
      const subarea = normalizeSubarea(record.subarea || record.area);

      return {
        ...record,
        timestampCreacion,
        fecha: record.fecha || formatDate(timestampCreacion),
        hora: record.hora || formatTime(timestampCreacion),
        area: record.area || "Lixiviacion",
        subarea,
        operador: record.operador || "--",
        turno: record.turno || "--",
        estado: normalizeStateLabel(record.estado),
        flujoPLS: numeric(record.flujoPLS ?? record.flujoRiego),
        flujoRefino: numeric(record.flujoRefino),
        acidezRefino: numeric(record.acidezRefino ?? record.acidoLibre),
        cuPls: numeric(record.cuPls ?? record.cuPLS),
        nivelPiscinaRefino: numeric(record.nivelPiscinaRefino),
        nivelPiscinaPLS: numeric(record.nivelPiscinaPLS),
        observacion: record.observacion || "",
        alarmasActivas: Array.isArray(record.alarmasActivas) ? record.alarmasActivas : []
      };
    })
    .sort((a, b) => new Date(b.timestampCreacion) - new Date(a.timestampCreacion));
}

function normalizeTimestamp(value, fecha, hora) {
  if (value?.toDate) return value.toDate().toISOString();
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (fecha && hora) {
    const parsed = new Date(`${fecha}T${hora}`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function normalizeSubarea(value) {
  const text = String(value || "").trim();
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  if (normalized.includes("pila 1")) return "Pila 1";
  if (normalized.includes("pila 2")) return "Pila 2";
  if (normalized.includes("pila 3")) return "Pila 3";
  if (normalized.includes("refino")) return "Piscina Refino";
  if (normalized.includes("pls")) return "Piscina PLS";
  if (normalized.includes("riego") || normalized.includes("apilamiento")) return "Pila 1";

  return text || "Sin subarea";
}

function normalizeStateLabel(value) {
  const stateClass = normalizeStateClass(value);
  if (stateClass === "critico") return "Crítico";
  if (stateClass === "alerta") return "Alerta";
  if (stateClass === "advertencia" || stateClass === "warning") return "Advertencia";
  return "Normal";
}

function getDominantVariable(record) {
  const values = [
    ["Flujo PLS", record.flujoPLS, "m3/h"],
    ["Flujo Refino", record.flujoRefino, "m3/h"],
    ["Acidez Refino", record.acidezRefino, "g/L"],
    ["Cu2+ PLS", record.cuPls, "g/L"],
    ["Nivel Refino", record.nivelPiscinaRefino, "%"],
    ["Nivel PLS", record.nivelPiscinaPLS, "%"]
  ].filter(([, value]) => Number.isFinite(value));

  if (!values.length) return "Comentario operacional";

  const [label, value, unit] = values[0];
  return `${label}: ${formatNumber(value, unit === "%" || unit === "m3/h" ? 0 : 2)} ${unit}`;
}

function numeric(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("es-CL");
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatNumber(value, decimals) {
  if (!Number.isFinite(value)) return "--";

  return Number(value).toLocaleString("es-CL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
