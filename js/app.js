import { listenToLeachRecords } from "./firestoreService.js";
import { demoRecords } from "../data/demoData.js";
import { updateCharts } from "./charts.js";
import { getWorstState, normalizeStateClass, renderProcessMap } from "./processMap.js";

const elements = {
  plantStatusDot: document.getElementById("plantStatusDot"),
  plantStatusLabel: document.getElementById("plantStatusLabel"),
  lastUpdated: document.getElementById("lastUpdated"),
  dataSourceBadge: document.getElementById("dataSourceBadge"),
  recordCount: document.getElementById("recordCount"),
  processMap: document.getElementById("processMap"),
  reportsTableBody: document.getElementById("reportsTableBody"),
  kpiPh: document.getElementById("kpiPh"),
  kpiCu: document.getElementById("kpiCu"),
  kpiFlow: document.getElementById("kpiFlow"),
  kpiAcid: document.getElementById("kpiAcid"),
  kpiPool: document.getElementById("kpiPool"),
  kpiAlerts: document.getElementById("kpiAlerts"),
  kpiPhStatus: document.getElementById("kpiPhStatus"),
  kpiCuStatus: document.getElementById("kpiCuStatus"),
  kpiFlowStatus: document.getElementById("kpiFlowStatus"),
  kpiAcidStatus: document.getElementById("kpiAcidStatus"),
  kpiPoolStatus: document.getElementById("kpiPoolStatus"),
  kpiAlertsStatus: document.getElementById("kpiAlertsStatus")
};

listenToLeachRecords({
  onData(records) {
    const source = records.length ? "Firestore en tiempo real" : "Demo local: Firestore vacío";
    renderDashboard(records.length ? records : demoRecords, source);
  },
  onError(error) {
    console.warn("Usando datos demo:", error.message);
    renderDashboard(demoRecords, "Demo local: configurar Firebase");
  }
});

function renderDashboard(records, sourceLabel) {
  const normalizedRecords = normalizeRecords(records);
  const latest = normalizedRecords[0];
  const plantState = getWorstState(normalizedRecords);

  elements.dataSourceBadge.textContent = sourceLabel;
  elements.recordCount.textContent = `${normalizedRecords.length} registros`;
  elements.plantStatusLabel.textContent = plantState;
  elements.plantStatusDot.className = `status-dot ${normalizeStateClass(plantState)}`;
  elements.lastUpdated.textContent = `Última actualización: ${formatDateTime(latest.timestampCreacion)}`;

  renderKpis(latest);
  renderProcessMap(elements.processMap, normalizedRecords);
  renderReportsTable(normalizedRecords.slice(0, 10));
  updateCharts(normalizedRecords);
}

function renderKpis(record) {
  setKpi("kpiPh", "kpiPhStatus", number(record.phPLS, 2), getRangeStatus(record.phPLS, 1.6, 1.85), "");
  setKpi("kpiCu", "kpiCuStatus", number(record.cuPLS, 1), getRangeStatus(record.cuPLS, 4.8, 5.8), "g/L");
  setKpi("kpiFlow", "kpiFlowStatus", number(record.flujoRiego, 0), getRangeStatus(record.flujoRiego, 1180, 1360), "m3/h");
  setKpi("kpiAcid", "kpiAcidStatus", number(record.acidoLibre, 1), getRangeStatus(record.acidoLibre, 7, 9), "g/L");
  setKpi("kpiPool", "kpiPoolStatus", number(record.nivelPiscinaPLS, 0), getRangeStatus(record.nivelPiscinaPLS, 60, 82), "%");
  setKpi("kpiAlerts", "kpiAlertsStatus", number(record.alertasActivas, 0), record.alertasActivas > 3 ? "Crítico" : record.alertasActivas > 0 ? "Alerta" : "Normal", "");
}

function setKpi(valueId, statusId, value, status, unit) {
  elements[valueId].textContent = unit ? `${value} ${unit}` : value;
  elements[statusId].textContent = status;
  elements[statusId].className = normalizeStateClass(status);
}

function renderReportsTable(records) {
  elements.reportsTableBody.innerHTML = records.map((record) => {
    const stateClass = normalizeStateClass(record.estado);
    return `
      <tr>
        <td>${formatTime(record.timestampCreacion)}</td>
        <td>${escapeHtml(record.turno || "--")}</td>
        <td>${escapeHtml(record.area || "--")}</td>
        <td>${escapeHtml(record.operador || "--")}</td>
        <td><span class="state-pill ${stateClass}">${escapeHtml(record.estado || "Normal")}</span></td>
        <td>${escapeHtml(record.observacion || "Sin observación")}</td>
      </tr>
    `;
  }).join("");
}

function normalizeRecords(records) {
  return records
    .map((record) => ({
      ...record,
      timestampCreacion: normalizeTimestamp(record.timestampCreacion),
      estado: record.estado || "Normal"
    }))
    .sort((a, b) => new Date(b.timestampCreacion) - new Date(a.timestampCreacion));
}

function normalizeTimestamp(value) {
  if (value?.toDate) return value.toDate().toISOString();
  return value || new Date().toISOString();
}

function getRangeStatus(value, min, max) {
  if (value < min * 0.94 || value > max * 1.06) return "Crítico";
  if (value < min || value > max) return "Alerta";
  return "Normal";
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function number(value, decimals) {
  return Number(value || 0).toLocaleString("es-CL", {
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
