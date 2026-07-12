import {
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./firebaseConfig.js";
import { clientConfig } from "./clientConfig.js";
export { verifyAdminPassword } from "./credentials.js?v=20260712-7";
import { verifyTechnicalProfilePassword } from "./credentials.js?v=20260712-7";
const {
  coleccionConfiguracion: COLLECTION_NAME,
  coleccionConfiguracionLegacy: LEGACY_COLLECTION_NAME,
  documentoConfiguracion: DOCUMENT_ID
} = clientConfig.identity.firebase;
const alarmVariables = clientConfig.alarmVariables;

const editableFields = ["bajoCritico", "bajoAlerta", "altoAlerta", "altoCritico"];

let configState = {};
let configListeners = [];
let adminStats = { count: 0, lastRecord: null, lastSync: null, connected: false };
let alarmConfigLoaded = false;

export function initAlarmAdmin() {
  const elements = getElements();
  if (!elements.adminAccessButton || !elements.alarmConfigTableBody) return;

  configState = buildDefaultConfig();
  renderAlarmRows(elements);
  bindAlarmAdminControls(elements);
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

function bindAlarmAdminControls(elements) {
  elements.adminAccessButton.addEventListener("click", () => openPasswordPanel(elements));
  elements.cancelAdminAccessButton.addEventListener("click", () => closePasswordPanel(elements));
  elements.adminPasswordForm.addEventListener("submit", (event) => {
    event.preventDefault();
    unlockAdmin(elements);
  });
  elements.adminPasswordInput.addEventListener("keydown", (event) => {
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
  elements.adminPasswordInput.value = "";
  elements.adminPasswordMessage.textContent = "";
  elements.adminPasswordInput.focus();
}

function closePasswordPanel(elements) {
  elements.adminPasswordOverlay.classList.add("is-hidden");
  elements.adminPasswordOverlay.setAttribute("aria-hidden", "true");
}

async function unlockAdmin(elements) {
  if (!verifyTechnicalProfilePassword(elements.adminPasswordInput.value)) {
    elements.adminPasswordMessage.textContent = "Contrasena incorrecta.";
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
    elements.alarmAdminMessage.textContent = "Revise el orden de limites antes de guardar.";
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
      <tr data-variable="${variable.key}">
        <td><strong>${escapeHtml(variable.nombre)}</strong></td>
        <td>${escapeHtml(config.unidad || variable.unidad)}</td>
        <td>${renderNumberInput(variable.key, "bajoCritico", config.bajoCritico)}</td>
        <td>${renderNumberInput(variable.key, "bajoAlerta", config.bajoAlerta)}</td>
        <td><span class="normal-range">${formatLimit(config.bajoAlerta)} a ${formatLimit(config.altoAlerta)}</span></td>
        <td>${renderNumberInput(variable.key, "altoAlerta", config.altoAlerta)}</td>
        <td>${renderNumberInput(variable.key, "altoCritico", config.altoCritico)}</td>
      </tr>
    `;
  }).join("");

  elements.alarmConfigTableBody.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => {
      const row = input.closest("tr");
      updateNormalRange(row);
      validateRow(row);
    });
  });
}

function renderNumberInput(variableKey, field, value) {
  return `
    <input
      class="limit-input"
      type="number"
      step="any"
      data-variable="${variableKey}"
      data-field="${field}"
      value="${Number.isFinite(Number(value)) ? Number(value) : ""}"
      aria-label="${field}">
  `;
}

function updateNormalRange(row) {
  const lowAlert = getRowNumber(row, "bajoAlerta");
  const highAlert = getRowNumber(row, "altoAlerta");
  const normalRange = row.querySelector(".normal-range");

  normalRange.textContent = Number.isFinite(lowAlert) && Number.isFinite(highAlert)
    ? `${formatLimit(lowAlert)} a ${formatLimit(highAlert)}`
    : "--";
}

function validateRow(row) {
  const values = getRowValues(row);
  const isValid = isOrdered(values);
  row.classList.toggle("has-error", !isValid);
  return isValid;
}

function collectConfig(elements) {
  return alarmVariables.reduce((config, variable) => {
    const row = elements.alarmConfigTableBody.querySelector(`tr[data-variable="${variable.key}"]`);

    config[variable.key] = {
      nombre: variable.nombre,
      unidad: variable.unidad,
      bajoCritico: getRowNumber(row, "bajoCritico"),
      bajoAlerta: getRowNumber(row, "bajoAlerta"),
      altoAlerta: getRowNumber(row, "altoAlerta"),
      altoCritico: getRowNumber(row, "altoCritico")
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
    const row = elements.alarmConfigTableBody.querySelector(`tr[data-variable="${key}"]`);
    row?.classList.add("has-error");
  });
}

function clearValidation(elements) {
  elements.alarmConfigTableBody.querySelectorAll("tr").forEach((row) => {
    row.classList.remove("has-error");
  });
}

function isOrdered(values) {
  return editableFields.every((field) => Number.isFinite(values[field]))
    && values.bajoCritico < values.bajoAlerta
    && values.bajoAlerta < values.altoAlerta
    && values.altoAlerta < values.altoCritico;
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
    config[variable.key] = {
      nombre: variable.nombre,
      unidad: variable.unidad,
      bajoCritico: variable.bajoCritico,
      bajoAlerta: variable.bajoAlerta,
      altoAlerta: variable.altoAlerta,
      altoCritico: variable.altoCritico
    };

    return config;
  }, {});
}

function mergeStoredConfig(storedConfig) {
  const defaults = buildDefaultConfig();

  alarmVariables.forEach((variable) => {
    const legacyPileConfig = variable.equipo
      ? storedConfig?.flujoPLSPila
      : null;

    defaults[variable.key] = {
      ...defaults[variable.key],
      ...(legacyPileConfig || {}),
      ...(storedConfig?.[variable.key] || {}),
      unidad: variable.unidad
    };
  });

  return defaults;
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
