import {
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./firebaseConfig.js";
import { clientConfig } from "./clientConfig.js";
import { canManageConfiguration } from "./webAccess.js?v=auth-v2";
const {
  coleccionConfiguracion: COLLECTION_NAME,
  coleccionConfiguracionLegacy: LEGACY_COLLECTION_NAME,
  documentoConfiguracion: DOCUMENT_ID
} = clientConfig.identity.firebase;
const alarmVariables = clientConfig.alarmVariables;

const editableFields = ["objetivo", "porcentajeAlerta", "porcentajeCritico"];

let configState = {};
let configListeners = [];
let adminStats = { count: 0, lastRecord: null, lastSync: null, connected: false };
let alarmConfigLoaded = false;

export function initAlarmAdmin(access) {
  const elements = getElements();
  if (!elements.adminAccessButton || !elements.alarmConfigTableBody) return;

  const technicalAccess = canManageConfiguration(access);
  elements.adminAccessButton.hidden = !technicalAccess;
  elements.adminAccessButton.disabled = !technicalAccess;
  configState = buildDefaultConfig();
  renderAlarmRows(elements);
  bindAlarmAdminControls(elements, access);
  loadAlarmConfig(elements);
}

export function getAlarmConfig() {
  return configState;
}

export function evaluateAlarmState(variableKey, value, config = configState) {
  const limits = config?.[variableKey];
  const numericValue = Number(value);

  if (!limits || !Number.isFinite(numericValue)) return "Normal";
  if (numericValue <= Number(limits.bajoCritico) || numericValue >= Number(limits.altoCritico)) return "Crítico";
  if (numericValue < Number(limits.bajoAlerta) || numericValue > Number(limits.altoAlerta)) return "Alerta";
  return "Normal";
}

export function onAlarmConfigChange(listener) {
  configListeners.push(listener);
  listener(configState);
  return () => { configListeners = configListeners.filter((item) => item !== listener); };
}

export function updateAdminStats(stats) {
  adminStats = { ...adminStats, ...stats };
  renderAdminStats();
}

function bindAlarmAdminControls(elements, access) {
  elements.adminAccessButton.addEventListener("click", () => unlockAdmin(elements, access));
  elements.cancelAdminAccessButton.addEventListener("click", () => closePasswordPanel(elements));
  elements.adminPasswordForm.addEventListener("submit", (event) => {
    event.preventDefault();
    unlockAdmin(elements, access);
  });
  elements.adminPasswordInput?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePasswordPanel(elements);
  });
  elements.closeAlarmAdminButton.addEventListener("click", () => {
    elements.alarmAdminSection.classList.add("is-hidden");
  });
  elements.saveAlarmConfigButton.addEventListener("click", () => saveAlarmConfig(elements));
}

function openPasswordPanel(elements) {
  elements.adminPasswordOverlay.classList.remove("is-hidden");
  elements.adminPasswordOverlay.setAttribute("aria-hidden", "false");
  if (elements.adminPasswordInput) elements.adminPasswordInput.value = "";
  elements.adminPasswordMessage.textContent = "";
  elements.adminPasswordInput?.focus();
}

function closePasswordPanel(elements) {
  elements.adminPasswordOverlay.classList.add("is-hidden");
  elements.adminPasswordOverlay.setAttribute("aria-hidden", "true");
}

async function unlockAdmin(elements, access) {
  if (!canManageConfiguration(access)) {
    elements.adminPasswordMessage.textContent = "Su cuenta no tiene permisos de configuracion.";
    openPasswordPanel(elements);
    return;
  }

  closePasswordPanel(elements);
  elements.alarmAdminSection.classList.remove("is-hidden");
  elements.saveAlarmConfigButton.disabled = true;
  elements.alarmAdminMessage.textContent = "Cargando configuracion...";

  await loadAlarmConfig(elements);
  elements.alarmAdminSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadAlarmConfig(elements) {
  if (alarmConfigLoaded) {
    elements.alarmAdminMessage.textContent = "Configuracion cargada en memoria.";
    elements.saveAlarmConfigButton.disabled = false;
    return;
  }

  try {
    const configRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
    const snapshot = await getDoc(configRef);
    const legacySnapshot = snapshot.exists()
      ? null
      : await getDoc(doc(db, LEGACY_COLLECTION_NAME, DOCUMENT_ID));

    if (snapshot.exists()) {
      configState = mergeStoredConfig(snapshot.data());
    } else if (legacySnapshot?.exists()) {
      configState = mergeStoredConfig(legacySnapshot.data());
    } else {
      configState = buildDefaultConfig();
    }

    renderAlarmRows(elements);
    notifyConfigListeners();
    elements.alarmAdminMessage.textContent = snapshot.exists() || legacySnapshot?.exists()
      ? `Configuracion cargada desde ${snapshot.exists() ? "configuration" : "alarm_config (compatibilidad)"}.`
      : "Configuracion inicial lista para guardar.";
    alarmConfigLoaded = true;
  } catch (error) {
    console.warn("No se pudo cargar la configuracion:", error.message);
    configState = buildDefaultConfig();
    renderAlarmRows(elements);
    elements.alarmAdminMessage.textContent = "No se pudo leer la configuracion remota. Se muestran valores iniciales.";
  } finally {
    elements.saveAlarmConfigButton.disabled = false;
  }
}

async function saveAlarmConfig(elements) {
  const nextConfig = collectConfig(elements);
  const validation = validateConfig(nextConfig);

  clearValidation(elements);

  if (!validation.isValid) {
    showValidationErrors(elements, validation.errors);
    elements.alarmAdminMessage.textContent = "Revise el objetivo y los porcentajes antes de guardar.";
    return;
  }

  elements.saveAlarmConfigButton.disabled = true;
  elements.alarmAdminMessage.textContent = "Guardando configuracion...";

  try {
    // Android leera configuration/lixiviacion para calcular alarmas automaticamente.
    await setDoc(doc(db, COLLECTION_NAME, DOCUMENT_ID), nextConfig, { merge: true });
    configState = nextConfig;
    alarmConfigLoaded = true;
    renderAlarmRows(elements);
    notifyConfigListeners();
    elements.alarmAdminMessage.textContent = "Configuracion guardada correctamente.";
  } catch (error) {
    console.error("No se pudo guardar configuration/lixiviacion:", error);
    elements.alarmAdminMessage.textContent = "No se pudo guardar la configuracion.";
  } finally {
    elements.saveAlarmConfigButton.disabled = false;
  }
}

function renderAlarmRows(elements) {
  elements.alarmConfigTableBody.innerHTML = alarmVariables.map((variable) => {
    const config = configState[variable.key] || variable;

    return `
      <fieldset class="alarm-config-card" data-variable="${variable.key}">
        <legend>${escapeHtml(variable.nombre)}</legend>
        <p class="alarm-config-unit">Unidad: ${escapeHtml(config.unidad || variable.unidad || "--")}</p>
        <div class="alarm-fixed-behavior"><span>Comportamiento de la variable</span><strong>Mantener cerca del objetivo</strong></div>
        <label>Valor objetivo${renderNumberInput(variable.key, "objetivo", config.objetivo)}</label>
        <label>Porcentaje de alerta${renderNumberInput(variable.key, "porcentajeAlerta", config.porcentajeAlerta, 0.01)}</label>
        <label>Porcentaje crítico${renderNumberInput(variable.key, "porcentajeCritico", config.porcentajeCritico, 0.01)}</label>
        <p class="alarm-range-description">${buildRangeDescription(config)}</p>
      </fieldset>
    `;
  }).join("");

  elements.alarmConfigTableBody.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => {
      const card = input.closest(".alarm-config-card");
      updateRangeDescription(card);
      validateRow(card);
    });
  });
}

function renderNumberInput(variableKey, field, value, step = "any") {
  return `
    <input
      class="limit-input"
      type="number"
      step="${step}"
      data-variable="${variableKey}"
      data-field="${field}"
      value="${Number.isFinite(Number(value)) ? Number(value) : ""}"
      aria-label="${field}">
  `;
}

function updateRangeDescription(card) {
  const description = card.querySelector(".alarm-range-description");
  description.textContent = buildRangeDescription(getRowValues(card));
}

function validateRow(row) {
  const values = getRowValues(row);
  const isValid = isOrdered(values);
  row.classList.toggle("has-error", !isValid);
  return isValid;
}

function collectConfig(elements) {
  return alarmVariables.reduce((config, variable) => {
    const row = elements.alarmConfigTableBody.querySelector(`[data-variable="${variable.key}"]`);
    const values = getRowValues(row);
    const limits = calculateLimits(values);

    config[variable.key] = {
      nombre: variable.nombre,
      unidad: variable.unidad,
      comportamiento: "target",
      ...values,
      ...limits
    };

    return config;
  }, {});
}

function validateConfig(config) {
  const errors = [];

  alarmVariables.forEach((variable) => {
    const values = config[variable.key];

    if (!isOrdered(values)) {
      errors.push(variable.key);
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
}

function showValidationErrors(elements, errors) {
  errors.forEach((key) => {
    const row = elements.alarmConfigTableBody.querySelector(`[data-variable="${key}"]`);
    row?.classList.add("has-error");
  });
}

function clearValidation(elements) {
  elements.alarmConfigTableBody.querySelectorAll(".alarm-config-card").forEach((row) => {
    row.classList.remove("has-error");
  });
}

function isOrdered(values) {
  return editableFields.every((field) => Number.isFinite(values[field]))
    && values.objetivo > 0
    && values.porcentajeAlerta > 0
    && values.porcentajeCritico > values.porcentajeAlerta;
}

function getRowValues(row) {
  return editableFields.reduce((values, field) => {
    values[field] = getRowNumber(row, field);
    return values;
  }, {});
}

function getRowNumber(row, field) {
  const input = row.querySelector(`input[data-field="${field}"]`);
  const value = Number(input.value);
  return Number.isFinite(value) ? value : NaN;
}

function buildDefaultConfig() {
  return alarmVariables.reduce((config, variable) => {
    config[variable.key] = normalizePercentageConfig({
      nombre: variable.nombre,
      unidad: variable.unidad,
      bajoCritico: variable.bajoCritico,
      bajoAlerta: variable.bajoAlerta,
      altoAlerta: variable.altoAlerta,
      altoCritico: variable.altoCritico
    });

    return config;
  }, {});
}

function mergeStoredConfig(storedConfig) {
  const defaults = buildDefaultConfig();

  alarmVariables.forEach((variable) => {
    const legacyPileConfig = variable.equipo
      ? storedConfig?.flujoPLSPila
      : null;

    defaults[variable.key] = normalizePercentageConfig({
      ...defaults[variable.key],
      ...(legacyPileConfig || {}),
      ...(storedConfig?.[variable.key] || {}),
      unidad: variable.unidad
    });
  });

  return defaults;
}

function normalizePercentageConfig(config) {
  const bajoAlerta = Number(config.bajoAlerta);
  const altoAlerta = Number(config.altoAlerta);
  const bajoCritico = Number(config.bajoCritico);
  const altoCritico = Number(config.altoCritico);
  const derivedTarget = Number.isFinite(bajoAlerta) && Number.isFinite(altoAlerta)
    ? (bajoAlerta + altoAlerta) / 2
    : NaN;
  const objetivo = Number.isFinite(Number(config.objetivo)) && Number(config.objetivo) > 0
    ? Number(config.objetivo)
    : derivedTarget;
  const derivedAlert = Number.isFinite(objetivo) && objetivo !== 0
    ? Math.abs(altoAlerta - objetivo) / objetivo * 100
    : NaN;
  const derivedCritical = Number.isFinite(objetivo) && objetivo !== 0
    ? Math.abs(altoCritico - objetivo) / objetivo * 100
    : NaN;
  const porcentajeAlerta = Number.isFinite(Number(config.porcentajeAlerta))
    ? Number(config.porcentajeAlerta)
    : derivedAlert;
  const porcentajeCritico = Number.isFinite(Number(config.porcentajeCritico))
    ? Number(config.porcentajeCritico)
    : derivedCritical;
  const values = { objetivo, porcentajeAlerta, porcentajeCritico };

  return {
    ...config,
    comportamiento: "target",
    ...values,
    ...calculateLimits(values)
  };
}

function calculateLimits(values) {
  const objetivo = Number(values.objetivo);
  const alerta = Number(values.porcentajeAlerta) / 100;
  const critico = Number(values.porcentajeCritico) / 100;

  if (![objetivo, alerta, critico].every(Number.isFinite)) {
    return { bajoCritico: NaN, bajoAlerta: NaN, altoAlerta: NaN, altoCritico: NaN };
  }

  return {
    bajoCritico: objetivo * (1 - critico),
    bajoAlerta: objetivo * (1 - alerta),
    altoAlerta: objetivo * (1 + alerta),
    altoCritico: objetivo * (1 + critico)
  };
}

function buildRangeDescription(values) {
  if (!isOrdered(values)) return "Ingrese un objetivo positivo y porcentajes donde el crítico sea mayor que la alerta.";
  const limits = calculateLimits(values);
  return `Normal entre ${formatLimit(limits.bajoAlerta)} y ${formatLimit(limits.altoAlerta)}. `
    + `Crítico desde ${formatLimit(limits.bajoCritico)} o ${formatLimit(limits.altoCritico)}.`;
}

function formatLimit(value) {
  if (!Number.isFinite(Number(value))) return "--";
  return Number(value).toLocaleString("es-CL", {
    maximumFractionDigits: 2
  });
}

function getElements() {
  return {
    adminAccessButton: document.getElementById("adminAccessButton"),
    adminPasswordOverlay: document.getElementById("adminPasswordOverlay"),
    adminPasswordForm: document.getElementById("adminPasswordForm"),
    adminPasswordInput: document.getElementById("adminPasswordInput"),
    adminPasswordMessage: document.getElementById("adminPasswordMessage"),
    cancelAdminAccessButton: document.getElementById("cancelAdminAccessButton"),
    confirmAdminAccessButton: document.getElementById("confirmAdminAccessButton"),
    alarmAdminSection: document.getElementById("alarmAdminSection"),
    alarmConfigTableBody: document.getElementById("alarmConfigTableBody"),
    closeAlarmAdminButton: document.getElementById("closeAlarmAdminButton"),
    saveAlarmConfigButton: document.getElementById("saveAlarmConfigButton"),
    alarmAdminMessage: document.getElementById("alarmAdminMessage"),
    resetOperationDataButton: document.getElementById("resetOperationDataButton"),
    resetDataMessage: document.getElementById("resetDataMessage"),
    resetDataOverlay: document.getElementById("resetDataOverlay"),
    resetPasswordField: document.getElementById("resetPasswordField"),
    resetPasswordInput: document.getElementById("resetPasswordInput"),
    resetDialogMessage: document.getElementById("resetDialogMessage"),
    resetTargetClient: document.getElementById("resetTargetClient"),
    resetTargetClientId: document.getElementById("resetTargetClientId"),
    resetTargetCount: document.getElementById("resetTargetCount"),
    cancelResetButton: document.getElementById("cancelResetButton"),
    continueResetButton: document.getElementById("continueResetButton")
  };
}

function notifyConfigListeners() {
  configListeners.forEach((listener) => listener(configState));
}

function renderAdminStats() {
  const count = document.getElementById("adminRecordCount");
  const last = document.getElementById("adminLastRecord");
  const connection = document.getElementById("adminFirebaseStatus");
  const systemCount = document.getElementById("systemRecordCount");
  const systemLast = document.getElementById("systemLastRecord");
  const adminLastSync = document.getElementById("adminLastSync");
  const systemLastSync = document.getElementById("systemLastSync");
  const systemConnection = document.getElementById("systemFirebaseStatus");
  const formattedLast = adminStats.lastRecord
    ? new Date(adminStats.lastRecord).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })
    : "--";
  const formattedSync = adminStats.lastSync
    ? new Date(adminStats.lastSync).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })
    : "--";
  [count, systemCount].forEach((element) => { if (element) element.textContent = String(adminStats.count); });
  [last, systemLast].forEach((element) => { if (element) element.textContent = formattedLast; });
  [adminLastSync, systemLastSync].forEach((element) => { if (element) element.textContent = formattedSync; });
  const systemStatus = getSystemStatus();
  [connection, systemConnection].forEach((element) => {
    if (element) element.textContent = systemStatus;
  });
}

function getSystemStatus() {
  if (!adminStats.connected) return "🔴 Error de comunicación";
  return "🟢 Conectado";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
