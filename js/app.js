import { closeRealtimeListener, getRecordsForPeriod, startRealtimeListener } from "./firestoreService.js?v=20260710-2";
import { updateCharts } from "./charts.js?v=20260709-1";
import { PLANT_AREA, buildPlantRecords, getWorstState, normalizeStateClass, renderProcessMap } from "./processMap.js?v=20260709-7";
import { getAlarmConfig, initAlarmAdmin, onAlarmConfigChange, updateAdminStats } from "./alarmAdmin.js?v=20260710-2";
import { initBulkImport } from "./bulkImport.js?v=20260710-2";
import { initLegacyCleanup } from "./legacyCleanup.js?v=20260710-2";
import { clientConfig } from "./clientConfig.js";

applyClientConfiguration();

const state = {
  records: [],
  sourceLabel: "Inicializando",
  selectedArea: PLANT_AREA,
  selectedPeriodHours: clientConfig.layout.periodos[0]?.horas || 24,
  connected: false,
  realtimeRecords: []
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
  mobileCounts: document.getElementById("mobileCounts")
};

bindControls();
initAlarmAdmin();
initBulkImport();
initLegacyCleanup({ refreshDashboard: restartRealtimeListener });
onAlarmConfigChange(() => render());

startDashboardListener();

function startDashboardListener() {
  return startRealtimeListener(handleRealtimeRecords, handleConnectionChange);
}

function handleRealtimeRecords(records) {
  const normalizedRecords = normalizeRecords(records);
  state.realtimeRecords = normalizedRecords;
  state.records = normalizedRecords;
  state.sourceLabel = records.length ? "Tiempo real" : "Sin registros para esta implementación";
  updateAdminStats({
    count: records.length,
    lastRecord: normalizedRecords[0]?.timestampCreacion || null,
    lastSync: new Date().toISOString(),
    connected: state.connected
  });

  render();
}

function handleConnectionChange(connected) {
  state.connected = connected;
  updateAdminStats({ connected });
}

async function restartRealtimeListener() {
  closeRealtimeListener();
  startDashboardListener();
}

function bindControls() {
  elements.periodFilter.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-period]");
    if (!button) return;

    state.selectedPeriodHours = Number(button.dataset.period);
    setActiveButton(elements.periodFilter, button);
    loadPeriodRecords(state.selectedPeriodHours).then(() => render());
  });
}

async function loadPeriodRecords(hours) {
  try {
    const records = await getRecordsForPeriod(hours);
    state.records = normalizeRecords(records);
    updateAdminStats({
      count: state.records.length,
      lastRecord: state.records[0]?.timestampCreacion || state.realtimeRecords[0]?.timestampCreacion || null,
      lastSync: new Date().toISOString(),
      connected: state.connected
    });
  } catch (error) {
    console.warn("No se pudo cargar el rango solicitado; se usaran datos en memoria:", error.message);
    state.records = state.realtimeRecords;
  }
}

function setActiveButton(group, activeButton) {
  group.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("is-active", button === activeButton);
  });
}

function render() {
  const recentRecords = filterByPeriod(state.records, state.selectedPeriodHours);
  const latest = recentRecords[0];
  const selectedRecords = filterRawRecordsByArea(recentRecords, state.selectedArea);
  const chartRecords = filterByArea(recentRecords, state.selectedArea);
  const alarmConfig = getAlarmConfig();
  const plantState = getWorstState(recentRecords, alarmConfig);

  elements.plantStatusLabel.textContent = plantState;
  elements.plantStatusDot.className = `status-dot ${normalizeStateClass(plantState)}`;
  elements.lastUpdated.textContent = `${clientConfig.layout.textos.ultimaActualizacion}: ${latest ? formatDateTime(latest.timestampCreacion) : "--"}`;
  elements.currentShift.textContent = `${clientConfig.layout.textos.turnoActual}: ${latest?.turno || "--"}`;

  renderProcessMap(elements.processMap, recentRecords, state.selectedArea, handleProcessSelection, alarmConfig);
  renderAlarms(selectedRecords);
  renderHistoryTable(selectedRecords.slice(0, 30));
  renderMobileSummary(recentRecords);
  updateMobilePeriodTitle();
  updateCharts(chartRecords, {
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
  const historyVariables = clientConfig.layout.variablesHistorial
    .map((key) => clientConfig.variableMap[key])
    .filter(Boolean);
  elements.historyTableBody.innerHTML = records.map((record) => {
    const stateClass = normalizeStateClass(record.estado);

    return `
      <tr>
        <td>${escapeHtml(record.fecha || formatDate(record.timestampCreacion))}</td>
        <td>${escapeHtml(record.hora || formatTime(record.timestampCreacion))}</td>
        <td>${escapeHtml(record.turno || "--")}</td>
        <td>${escapeHtml(record.subarea || "--")}</td>
        ${historyVariables.map((variable) => `<td>${formatNumber(record[variable.key], variable.decimales)} ${escapeHtml(variable.unidad)}</td>`).join("")}
        <td><span class="state-pill ${stateClass}">${escapeHtml(record.estado)}</span></td>
      </tr>
    `;
  }).join("");
}

function renderMobileSummary(records) {
  clientConfig.layout.equiposResumenMovil.forEach((area) => {
    const counter = elements.mobileCounts.querySelector(`[data-area-count="${CSS.escape(area)}"]`);
    if (counter) counter.textContent = countBySubarea(records, area);
  });
}

function countBySubarea(records, subarea) {
  return records.filter((record) => record.subarea === subarea).length;
}

function filterByArea(records, area) {
  if (area === PLANT_AREA) return buildPlantRecords(records);
  const directRecords = records.filter((record) => record.subarea === area);
  if (directRecords.length) return directRecords;
  return getEquipmentRecords(records, area);
}

function filterRawRecordsByArea(records, area) {
  if (area === PLANT_AREA) return records;
  const directRecords = records.filter((record) => record.subarea === area);
  if (directRecords.length) return directRecords;
  return getEquipmentRecords(records, area);
}

function getEquipmentRecords(records, area) {
  const equipment = clientConfig.equipmentMap[area];
  if (!equipment) return [];
  const variableKeys = clientConfig.variables
    .filter((variable) => variable.equipoId === equipment.id)
    .map((variable) => variable.key);
  return records.filter((record) => variableKeys.some((key) =>
    Number.isFinite(record[key]) || String(record[key] || "").trim()
  ));
}

function filterByPeriod(records, hours) {
  const timestamps = records
    .map((record) => new Date(record.timestampCreacion).getTime())
    .filter(Number.isFinite);
  if (!timestamps.length) return [];

  // El histórico se recorre desde el último registro disponible. Esto permite
  // explorar correctamente datos importados o demo aunque estén adelantados
  // respecto del reloj del dispositivo.
  const latestTimestamp = Math.max(...timestamps);
  const cutoff = latestTimestamp - hours * 60 * 60 * 1000;
  return records.filter((record) => {
    const timestamp = new Date(record.timestampCreacion).getTime();
    return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= latestTimestamp;
  });
}

function updateMobilePeriodTitle() {
  const title = document.getElementById("mobilePeriodTitle");
  if (!title) return;
  title.textContent = clientConfig.layout.periodos.find((period) => period.horas === state.selectedPeriodHours)?.titulo || "";
}

function normalizeRecords(records) {
  return records
    .map((record) => {
      const timestampCreacion = normalizeTimestamp(record.timestampCreacion, record.fecha, record.hora);
      const subarea = normalizeSubarea(record.subarea || record.area);

      const normalizedRecord = {
        ...record,
        timestampCreacion,
        fecha: record.fecha || formatDate(timestampCreacion),
        hora: record.hora || formatTime(timestampCreacion),
        area: record.area || clientConfig.identity.proceso,
        subarea,
        operador: record.operador || "--",
        turno: record.turno || "--",
        estado: normalizeStateLabel(record.estado),
        observacion: record.observacion || "",
        alarmasActivas: Array.isArray(record.alarmasActivas) ? record.alarmasActivas : []
      };
      clientConfig.variables.forEach((variable) => {
        const sourceKeys = [variable.key, ...(variable.aliases || [])];
        const sourceKey = sourceKeys.find((key) => Object.hasOwn(record, key));
        normalizedRecord[variable.key] = numeric(sourceKey ? record[sourceKey] : null);
      });
      return normalizedRecord;
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

  const equipment = clientConfig.equipment.find((item) =>
    [item.nombre, ...(item.aliases || [])].some((alias) => normalized.includes(
      alias.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    ))
  );
  if (equipment) return equipment.nombre;

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
  const values = clientConfig.variables
    .map((variable) => [variable.nombre, record[variable.key], variable])
    .filter(([, value]) => Number.isFinite(value));

  if (!values.length) return "Comentario operacional";

  const [label, value, variable] = values[0];
  return `${label}: ${formatNumber(value, variable.decimales)} ${variable.unidad}`;
}

function applyClientConfiguration() {
  const { identity, layout } = clientConfig;
  const profile = clientConfig.clientProfile;
  const text = layout.textos;
  document.title = identity.tituloPagina;
  setText("headerClient", profile.cliente);
  setText("headerSite", profile.faena);
  setText("headerProcess", profile.proceso);
  setText("generalStatusCaption", text.estadoGeneral);
  setText("processEyebrow", text.procesoEyebrow);
  setText("processTitle", text.vistaOperacional);
  setText("trendsEyebrow", text.tendenciasEyebrow);
  setText("trendsTitle", text.tendencias);
  setText("alarmsTitle", text.alarmas);
  setText("historyEyebrow", text.historialEyebrow);
  setText("historyTitle", text.historial);
  setText("systemVersion", identity.version);
  setText("alarmConfigPath", `${identity.firebase.coleccionConfiguracion}/${identity.firebase.documentoConfiguracion}`);
  setText("recordsCollectionLabel", `Registros asociados (${clientConfig.clienteId})`);
  setText("resetRecordsCollection", `${identity.firebase.coleccionRegistros} para ${clientConfig.clienteId}`);
  renderActiveProfile(profile);

  const periodFilter = document.getElementById("periodFilter");
  periodFilter.innerHTML = layout.periodos.map((period, index) =>
    `<button type="button" class="${index === 0 ? "is-active" : ""}" data-period="${period.horas}">${escapeHtml(period.etiqueta)}</button>`
  ).join("");

  const chartsGrid = document.getElementById("chartsGrid");
  let currentGroup = null;
  chartsGrid.innerHTML = layout.variablesTendencia.map((key) => clientConfig.variableMap[key])
    .filter(Boolean)
    .map((variable) => {
      const group = variable.grupo !== currentGroup
        ? `<div class="trend-group-title">${escapeHtml(variable.grupo)}</div>`
        : "";
      currentGroup = variable.grupo;
      return `${group}<article class="panel">
        <div class="chart-heading"><h3>${escapeHtml(variable.nombre)}</h3><span>${escapeHtml(variable.unidad)}</span></div>
        <div class="chart-box"><canvas id="${escapeHtml(variable.canvasId)}"></canvas></div>
        <p id="${escapeHtml(variable.analysisId)}" class="trend-analysis">${escapeHtml(text.sinDatos)}</p>
      </article>`;
    }).join("");

  document.getElementById("mobileCounts").innerHTML = layout.equiposResumenMovil.map((area) =>
    `<span>${escapeHtml(area)} <strong data-area-count="${escapeHtml(area)}">0</strong></span>`
  ).join("");

  const historyVariables = layout.variablesHistorial.map((key) => clientConfig.variableMap[key]).filter(Boolean);
  document.getElementById("historyTableHead").innerHTML = [
    "Fecha", "Hora", "Turno", "Subárea",
    ...historyVariables.map((variable) => variable.nombreCorto || variable.nombre),
    "Estado"
  ].map((label) => `<th>${escapeHtml(label)}</th>`).join("");

  const sectionSelectors = {
    mapaProceso: ".process-section",
    tendencias: ".charts-section",
    resumenMovil: ".mobile-24h",
    alarmas: ".alarms-section",
    historial: ".history-section",
    administracion: "#adminAccessButton"
  };
  Object.entries(sectionSelectors).forEach(([key, selector]) => {
    document.querySelector(selector)?.classList.toggle("is-hidden", layout.secciones[key] === false);
  });
}

function renderActiveProfile(profile) {
  // Futuro: un mismo cliente podrá tener procesos activos separados como Lixiviación, SX, EW, Concentradora o HydroSim.
  setText("activeProfileClient", profile.cliente);
  setText("activeProfileSite", profile.faena);
  setText("activeProfileProcess", profile.proceso);
  setText("activeImplementationId", profile.implementationId);
  setText("activeOperationalProfile", profile.profileId);
  setText("activeProfileClientId", profile.clienteId);
  setText("activeProfileConfigVersion", profile.versionConfiguracion);
  setText("systemClient", profile.cliente);
  setText("systemSite", profile.faena);
  setText("systemProcess", profile.proceso);
  setText("systemImplementation", profile.implementationId);
  setText("systemOperationalProfile", profile.profileId);
  setText("systemClientId", profile.clienteId);
  setText("bulkImportTargetClient", profile.cliente);
  setText("bulkImportTargetSite", profile.faena);
  setText("bulkImportTargetProcess", profile.proceso);
  setText("bulkImportConfirmClient", profile.cliente);
  setText("bulkImportConfirmSite", profile.faena);
  setText("bulkImportConfirmProcess", profile.proceso);
  setText("resetTargetClient", profile.cliente);
  setText("resetTargetClientId", profile.clienteId);

  const status = clientConfig.configStatus;
  const statusDot = document.getElementById("profileStatusDot");
  const fallbackMessage = document.getElementById("profileFallbackMessage");
  if (statusDot) statusDot.className = `status-dot ${status.ok ? "normal" : "critico"}`;
  setText("profileStatusText", status.message);
  if (fallbackMessage) {
    fallbackMessage.textContent = status.ok ? "" : status.message;
    fallbackMessage.classList.toggle("is-hidden", status.ok);
  }
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
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
