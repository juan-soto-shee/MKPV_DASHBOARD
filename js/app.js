import { closeRealtimeListener, getRecordsForPeriod, startRealtimeListener } from "./firestoreService.js?v=20260713-1";
import { updateCharts } from "./charts.js?v=20260709-1";
import { PLANT_AREA, buildPlantRecords, getWorstState, normalizeStateClass, renderProcessMap } from "./processMap.js?v=20260709-7";
import { getAlarmConfig, initAlarmAdmin, onAlarmConfigChange, updateAdminStats } from "./alarmAdmin.js?v=20260712-10";
import { clientConfig } from "./clientConfig.js";
import { filterRecordsByPeriod, normalizeRecordDateTime } from "./dateTime.js?v=20260712-3";
import { requireWebAccess } from "./webAccess.js?v=20260712-10";
import { initDataExport } from "./dataExport.js?v=20260712-2";
import { calculateOperationalKpis, evaluarEstadoKpi, KPI_WINDOW_HOURS } from "./kpiEngine.js?v=20260713-17";
import { analyzeOperationalPeriod } from "./operationalAnalysis.js?v=20260713-1";

applyClientConfiguration();
await requireWebAccess();

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
  mobileCounts: document.getElementById("mobileCounts"),
  kpiCopperToSx: document.getElementById("kpiCopperToSx"),
  kpiSpecificAcid: document.getElementById("kpiSpecificAcid"),
  kpiRecovery: document.getElementById("kpiRecovery")
};

let kpiPreferences = loadKpiPreferences();

bindControls();
initAlarmAdmin();
initDataExport({ normalizeRecords });
initKpiControls();
initAdminCollapsibles();
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
    state.records = mergeRecordSets(normalizeRecords(records), state.realtimeRecords);
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

function mergeRecordSets(records, realtimeRecords) {
  const merged = new Map();
  [...records, ...realtimeRecords].forEach((record) => {
    const key = record.id || `${record.clienteId || ""}:${record.timestampCreacion}`;
    merged.set(key, record);
  });
  return [...merged.values()].sort((left, right) => right.timestampCreacion - left.timestampCreacion);
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
  renderMobileSummary(recentRecords, alarmConfig);
  renderOperationalAnalysis(recentRecords, alarmConfig);
  renderOperationalKpis(state.records);
  updateMobilePeriodTitle();
  updateCharts(chartRecords, {
    selectedArea: state.selectedArea,
    sourceRecords: recentRecords,
    alarmConfig
  });
}

function renderOperationalAnalysis(records, alarmConfig) {
  const analysisVariables = clientConfig.layout.variablesTendencia
    .map((key) => clientConfig.variableMap[key])
    .filter(Boolean);
  const analysis = analyzeOperationalPeriod(records, analysisVariables, alarmConfig);
  const stateElement = document.getElementById("operationalState");
  const stateIcons = { stable: "🟢", moderate: "🟡", unstable: "🔴" };
  stateElement.textContent = analysis.hasData
    ? `${stateIcons[analysis.state]} ${analysis.stateLabel}`
    : "Sin datos suficientes para analizar el período.";
  stateElement.className = `operational-state ${analysis.hasData ? analysis.state : "neutral"}`;
  renderAnalysisList("operationalTrends", analysis.hasData
    ? analysis.trends
    : [{ text: "No hay tendencias disponibles para el período.", tone: "neutral" }]);
  renderAnalysisList("operationalEvents", analysis.events);
}

function renderAnalysisList(elementId, items) {
  document.getElementById(elementId).innerHTML = items.map((item) =>
    `<li class="${escapeHtml(item.tone)}">${escapeHtml(item.text)}</li>`
  ).join("");
}

function renderOperationalKpis(records) {
  const kpis = calculateOperationalKpis(records, { windowHours: KPI_WINDOW_HOURS, audit: kpiPreferences.audit });
  renderKpiRing("Copper", elements.kpiCopperToSx, kpis.copperToSx, 1, kpiPreferences.copperToSx);
  renderKpiRing("Acid", elements.kpiSpecificAcid, kpis.specificAcidConsumption, 1, kpiPreferences.specificAcidConsumption);
  renderKpiRing("Recovery", elements.kpiRecovery, kpis.recovery, 1, kpiPreferences.recovery);
}

function renderKpiRing(suffix, valueElement, value, decimals, objective) {
  valueElement.textContent = formatKpiValue(value, decimals);
  const unit = objective.unit || { Copper: "t", Acid: "kg/t", Recovery: "%" }[suffix];
  const evaluation = evaluarEstadoKpi(value, objective);
  const status = evaluation.estado;
  const labels = { normal: "Normal", warning: "Alerta", critical: "Crítico", "no-data": "Sin datos", "invalid-config": "Configuración inválida" };
  const statusColors = { normal: "#38d996", warning: "#ffb547", critical: "#ff5263", "no-data": "#758b92", "invalid-config": "#758b92" };
  const ring = document.getElementById(`kpi${suffix}Ring`);
  const statusElement = document.getElementById(`kpi${suffix}Compliance`);
  document.getElementById(`kpi${suffix}Target`).textContent = formatKpiTarget(objective, 0, unit);
  statusElement.textContent = evaluation.mensaje;
  statusElement.dataset.status = status;
  ring.dataset.status = status;
  ring.style.setProperty("--kpi-color", statusColors[status]);
  statusElement.style.color = statusColors[status];
  ring.querySelector(".kpi-ring-unit").textContent = unit;
  ring.querySelector(".kpi-ring-state").textContent = labels[status];
  ring.title = `${formatKpiTarget(objective, 0, unit)}\nEstado: ${labels[status]}\n${evaluation.mensaje}`;
  const progress = Number.isFinite(value) && Number(objective.target) ? value / Number(objective.target) * 100 : 0;
  ring.style.setProperty("--kpi-progress", `${Math.min(100, Math.max(0, progress)) * 3.6}deg`);
}

function formatKpiTarget(config, decimals, unit) {
  if (config.alarmMode === "operating_range") return `Rango normal ${formatKpiValue(config.normalMin, decimals)}–${formatKpiValue(config.normalMax, decimals)} ${unit}`;
  const prefix = config.alarmMode === "higher_is_better" ? "Objetivo mínimo" : config.alarmMode === "lower_is_better" ? "Objetivo máximo" : "Objetivo";
  return `${prefix} ${formatKpiValue(Number(config.target), decimals)} ${unit}`;
}

function initKpiControls() {
  const definitions = [
    ["copperToSx", "Cobre a SX"], ["specificAcidConsumption", "Consumo Específico de Ácido"], ["recovery", "Recuperación"]
  ];
  const grid = document.getElementById("kpiAdminGrid");
  renderKpiConfigGrid(grid, definitions);
  grid.addEventListener("input", () => updateKpiAdminPreviews(grid, definitions));
  grid.addEventListener("change", () => updateKpiAdminPreviews(grid, definitions));
  updateKpiAdminPreviews(grid, definitions);
  document.getElementById("kpiAuditMode").checked = kpiPreferences.audit;
  document.getElementById("saveKpiConfigButton").addEventListener("click", () => {
    const candidate = { ...kpiPreferences };
    for (const card of grid.querySelectorAll("[data-kpi]")) candidate[card.dataset.kpi] = readKpiCard(card, candidate[card.dataset.kpi]);
    const error = validateKpiPreferences(candidate, definitions);
    if (error) {
      document.getElementById("kpiAdminMessage").textContent = error;
      return;
    }
    kpiPreferences = candidate;
    kpiPreferences.audit = document.getElementById("kpiAuditMode").checked;
    localStorage.setItem(kpiStorageKey(), JSON.stringify(kpiPreferences));
    document.getElementById("kpiAdminMessage").textContent = "Indicadores guardados para esta implementación.";
    render();
  });
  const overlay = document.getElementById("metallurgicalBalanceOverlay");
  document.getElementById("metallurgicalBalanceButton").addEventListener("click", () => { overlay.classList.remove("is-hidden"); overlay.setAttribute("aria-hidden", "false"); });
  document.getElementById("closeMetallurgicalBalance").addEventListener("click", () => { overlay.classList.add("is-hidden"); overlay.setAttribute("aria-hidden", "true"); });
}

function renderKpiConfigGrid(grid, definitions) {
  grid.innerHTML = definitions.map(([key, label]) => {
    const objective = kpiPreferences[key];
    return `<fieldset class="kpi-admin-card" data-kpi="${key}"><legend>${label}</legend><p class="kpi-admin-unit">Unidad: <strong>${objective.unit}</strong></p>
      <label>Comportamiento de la variable<select class="kpi-alarm-mode"><option value="target_range">Mantener cerca del objetivo</option><option value="higher_is_better">Mientras más alto, mejor</option><option value="lower_is_better">Mientras más bajo, mejor</option><option value="operating_range">Mantener dentro de un rango</option></select></label>
      <div class="kpi-percentage-fields"><label>Valor objetivo<input class="kpi-target-input" type="number" step="any" value="${objective.target}"></label><label>Porcentaje de alerta<input class="kpi-alert-threshold" type="number" step="0.1" value="${objective.warningDeviationPercent}"></label><label>Porcentaje crítico<input class="kpi-critical-threshold" type="number" step="0.1" value="${objective.criticalDeviationPercent}"></label></div>
      <div class="kpi-range-fields">${[["criticalMin","Mínimo crítico"],["criticalMax","Máximo crítico"],["warningMin","Mínimo de alerta"],["warningMax","Máximo de alerta"],["normalMin","Mínimo normal"],["normalMax","Máximo normal"]].map(([field,text]) => `<label>${text}<input data-range="${field}" type="number" step="any" value="${objective[field] ?? ""}"></label>`).join("")}</div>
      <div class="kpi-limit-preview" role="status"></div>
    </fieldset>`;
  }).join("");
  definitions.forEach(([key]) => { grid.querySelector(`[data-kpi="${key}"] .kpi-alarm-mode`).value = kpiPreferences[key].alarmMode; });
}

function readKpiCard(card, previous) {
  const numericValue = (input) => input.value.trim() === "" ? NaN : Number(input.value);
  const result = { ...previous, alarmMode: card.querySelector(".kpi-alarm-mode").value, target: numericValue(card.querySelector(".kpi-target-input")), warningDeviationPercent: numericValue(card.querySelector(".kpi-alert-threshold")), criticalDeviationPercent: numericValue(card.querySelector(".kpi-critical-threshold")) };
  card.querySelectorAll("[data-range]").forEach((input) => { result[input.dataset.range] = numericValue(input); });
  return result;
}

function validateKpiPreferences(preferences, definitions) {
  for (const [key, label] of definitions) {
    const c = preferences[key];
    let message = "";
    if (c.alarmMode === "operating_range") {
      const v = [c.criticalMin,c.warningMin,c.normalMin,c.normalMax,c.warningMax,c.criticalMax];
      if (!v.every(Number.isFinite)) message = "Revise la configuración. Todos los valores deben ser numéricos.";
      else if (!(v[0] < v[1] && v[1] < v[2] && v[2] < v[3] && v[3] < v[4] && v[4] < v[5])) message = "Los límites críticos deben estar más alejados del rango normal que los límites de alerta.";
    } else if (!Number.isFinite(c.target)) message = "Debe ingresar un valor objetivo válido.";
    else if (c.target === 0) message = "No es posible calcular desviaciones porcentuales con un objetivo igual a cero. Utilice el modo “Mantener dentro de un rango”.";
    else if (!Number.isFinite(c.warningDeviationPercent) || !Number.isFinite(c.criticalDeviationPercent)) message = "Revise la configuración. Todos los valores deben ser numéricos.";
    else if (c.warningDeviationPercent <= 0) message = "El porcentaje de alerta debe ser mayor que cero.";
    else if (c.criticalDeviationPercent <= 0) message = "El porcentaje crítico debe ser mayor que cero.";
    else if (c.criticalDeviationPercent === c.warningDeviationPercent) message = "El porcentaje crítico no puede ser igual al porcentaje de alerta.";
    else if (c.criticalDeviationPercent < c.warningDeviationPercent) message = "El porcentaje crítico debe ser mayor que el porcentaje de alerta, porque representa una desviación más alejada del valor objetivo.";
    if (message) return `No se pudo guardar “${label}”: ${message.charAt(0).toLowerCase()}${message.slice(1)}`;
  }
  return "";
}

function updateKpiAdminPreviews(grid, definitions) {
  let firstError = "";
  definitions.forEach(([key, label]) => {
    const card = grid.querySelector(`[data-kpi="${key}"]`), c = readKpiCard(card, kpiPreferences[key]);
    card.classList.toggle("is-range-mode", c.alarmMode === "operating_range");
    const error = validateKpiPreferences({ [key]: c }, [[key, label]]);
    const f = (v) => Number(v).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), u = c.unit || "";
    let text = error ? error.replace(/^No se pudo guardar “[^”]+”: /, "") : "";
    if (!text && c.alarmMode === "operating_range") text = `Normal entre ${f(c.normalMin)} ${u} y ${f(c.normalMax)} ${u}. Alerta desde ${f(c.warningMin)} o ${f(c.warningMax)} ${u}. Crítico desde ${f(c.criticalMin)} o ${f(c.criticalMax)} ${u}.`;
    if (!text && c.alarmMode === "target_range") text = `Normal entre ${f(c.target * (1-c.warningDeviationPercent/100))} ${u} y ${f(c.target * (1+c.warningDeviationPercent/100))} ${u}. Crítico desde ${f(c.target * (1-c.criticalDeviationPercent/100))} ${u} o ${f(c.target * (1+c.criticalDeviationPercent/100))} ${u}.`;
    if (!text && c.alarmMode === "higher_is_better") text = `Alerta cuando sea igual o menor que ${f(c.target * (1-c.warningDeviationPercent/100))} ${u}. Crítico cuando sea igual o menor que ${f(c.target * (1-c.criticalDeviationPercent/100))} ${u}. Los valores superiores al objetivo se consideran favorables.`;
    if (!text && c.alarmMode === "lower_is_better") text = `Alerta cuando sea igual o mayor que ${f(c.target * (1+c.warningDeviationPercent/100))} ${u}. Crítico cuando sea igual o mayor que ${f(c.target * (1+c.criticalDeviationPercent/100))} ${u}. Los valores inferiores al objetivo se consideran favorables.`;
    card.querySelector(".kpi-limit-preview").textContent = text;
    if (!firstError && error) firstError = error;
  });
  document.getElementById("kpiAdminMessage").textContent = firstError;
}

function loadKpiPreferences() {
  const defaults = {
    copperToSx: { unit: "t", ...clientConfig.kpiObjectives.copperToSx, alarmMode: "higher_is_better", warningDeviationPercent: 10, criticalDeviationPercent: 20 },
    specificAcidConsumption: { unit: "kg/t", ...clientConfig.kpiObjectives.specificAcidConsumption, alarmMode: "lower_is_better", warningDeviationPercent: 10, criticalDeviationPercent: 20 },
    recovery: { unit: "%", ...clientConfig.kpiObjectives.recovery, alarmMode: "higher_is_better", warningDeviationPercent: 5, criticalDeviationPercent: 10 },
    audit: false
  };
  try {
    const stored = JSON.parse(localStorage.getItem(kpiStorageKey()) || "{}");
    return {
      copperToSx: migrateKpiObjective(defaults.copperToSx, stored.copperToSx),
      specificAcidConsumption: migrateKpiObjective(defaults.specificAcidConsumption, stored.specificAcidConsumption),
      recovery: migrateKpiObjective(defaults.recovery, stored.recovery),
      audit: stored.audit ?? defaults.audit
    };
  } catch { return defaults; }
}

function migrateKpiObjective(defaults, stored = {}) {
  return {
    ...defaults,
    ...stored,
    alarmMode: stored.alarmMode || (stored.comparison === "lower" ? "lower_is_better" : stored.comparison === "higher" ? "higher_is_better" : defaults.alarmMode),
    warningDeviationPercent: Number(stored.warningDeviationPercent ?? stored.alertDeviationPercent ?? 10),
    criticalDeviationPercent: Number(stored.criticalDeviationPercent ?? 20)
  };
}

function kpiStorageKey() { return `plantview:kpi:${clientConfig.implementationId}`; }

function initAdminCollapsibles() {
  document.querySelectorAll("#alarmAdminSection .admin-subsection").forEach((panel, index) => {
    const heading = panel.querySelector("h3");
    if (!heading) return;
    const content = document.createElement("div");
    content.className = "admin-collapsible-content";
    content.id = `adminPanelContent${index}`;
    while (panel.firstChild) content.appendChild(panel.firstChild);
    heading.classList.add("is-hidden");

    const toggle = document.createElement("button");
    toggle.className = "admin-collapse-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", content.id);
    toggle.innerHTML = `<span>${escapeHtml(heading.textContent)}</span><span class="collapse-chevron" aria-hidden="true"></span>`;
    content.hidden = true;
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      content.hidden = !expanded;
      panel.classList.toggle("is-expanded", !expanded);
    });
    panel.append(toggle, content);
  });
}

function formatKpiValue(value, decimals) {
  return Number.isFinite(value) ? value.toLocaleString(clientConfig.identity.locale, {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals
  }) : "—";
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

function renderMobileSummary(records, alarmConfig) {
  clientConfig.layout.equiposResumenMovil.forEach((area) => {
    const counter = elements.mobileCounts.querySelector(`[data-area-count="${CSS.escape(area)}"]`);
    if (!counter) return;

    const areaRecords = filterRawRecordsByArea(records, area);
    const stateClass = areaRecords.length
      ? normalizeStateClass(getWorstState(areaRecords, alarmConfig))
      : "sin-datos";
    const item = counter.closest("span");

    counter.textContent = areaRecords.length;
    item.classList.remove("normal", "alerta", "advertencia", "warning", "critico", "sin-datos");
    item.classList.add(stateClass);
  });
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
  return filterRecordsByPeriod(records, hours);
}

function updateMobilePeriodTitle() {
  const title = document.getElementById("mobilePeriodTitle");
  if (!title) return;
  title.textContent = clientConfig.layout.periodos.find((period) => period.horas === state.selectedPeriodHours)?.titulo || "";
}

export function normalizeRecords(records) {
  return records
    .map((record) => {
      let normalizedDateTime;
      try { normalizedDateTime = normalizeRecordDateTime(record); }
      catch (error) {
        console.warn("Registro excluido por fecha inválida o futura:", record.id || "sin id", error.message);
        return null;
      }
      const timestampCreacion = normalizedDateTime.timestampCreacion;
      const subarea = normalizeSubarea(record.subarea || record.area);

      const normalizedRecord = {
        ...record,
        timestampCreacion,
        fecha: normalizedDateTime.fecha,
        hora: normalizedDateTime.hora,
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
        const rootKey = sourceKeys.find((key) => Object.hasOwn(record, key));
        const nestedKey = sourceKeys.find((key) => Object.hasOwn(record.variables || {}, key));
        const value = rootKey ? record[rootKey] : nestedKey ? record.variables[nestedKey] : null;
        normalizedRecord[variable.key] = numeric(value);
      });
      return normalizedRecord;
    })
    .filter(Boolean)
    .sort((a, b) => b.timestampCreacion - a.timestampCreacion);
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
  const compactTrendGrid = clientConfig.profileId === "entrefases";
  chartsGrid.classList.toggle("is-entrefases", compactTrendGrid);
  let currentGroup = null;
  chartsGrid.innerHTML = layout.variablesTendencia.map((key) => clientConfig.variableMap[key])
    .filter(Boolean)
    .map((variable) => {
      const group = !compactTrendGrid && variable.grupo !== currentGroup
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
