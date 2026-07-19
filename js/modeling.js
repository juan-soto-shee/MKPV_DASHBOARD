import "./productVersion.js?v=20260713-1";
import { clientConfig } from "./clientConfig.js";
import { closeRealtimeListener, startRealtimeListener } from "./firestoreService.js?v=20260713-1";
import { getFirebaseIdToken, requireWebAccess } from "./webAccess.js?v=auth-v3";
import {
  MODEL_FEATURES, buildPredictionRequest, parseModelingSelection, preparePredictiveData
} from "./modelingDataAdapter.js?v=20260719-2";
import { BASE_API_URL, MODELING_API_TIMEOUT_MS } from "./modelingConfig.js?v=20260719-2";

const APPROVED_HORIZONS = Object.freeze([4, 8, 12]);
const selection = parseModelingSelection();
let dialogBound = false;
let activeRequestController = null;

init().catch(showFatalError);

async function init() {
  configureNavigation();
  renderClientIdentity();
  bindVariablesDialog();
  clearPredictiveResults();
  await requireWebAccess();
  showStatus("Cargando datos operacionales…");
  window.addEventListener("pagehide", closeRealtimeListener, { once: true });
  startRealtimeListener(handleRealtimeRecords, (connected) => {
    if (!connected) showServiceUnavailable();
  });
}

async function handleRealtimeRecords(records) {
  const prepared = preparePredictiveData(records, {
    clienteId: clientConfig.clienteId,
    implementationId: clientConfig.implementationId,
    profileId: clientConfig.profileId,
    periodHours: selection.periodHours,
    unit: selection.unit,
    variables: clientConfig.variables
  });
  const request = buildPredictionRequest(prepared, { ...selection, ...clientConfig });

  console.info("[PlantViewModel] pipeline de datos", {
    firestore: { collection: clientConfig.identity.firebase.coleccionRegistros, received: prepared.received },
    filters: {
      normalized: prepared.normalized,
      demoRecordsExcluded: prepared.demoRecordsExcluded,
      afterClient: prepared.afterClient,
      afterImplementation: prepared.afterImplementation,
      afterUnit: prepared.afterUnit,
      afterPeriod: prepared.afterPeriod
    },
    validation: {
      valid: prepared.afterValidation,
      duplicatesRemoved: prepared.duplicatesRemoved,
      variables: MODEL_FEATURES,
      sufficient: prepared.sufficient,
      hasVariation: prepared.hasVariation
    }
  });

  if (clientConfig.profileId !== "lixiviacion" || !prepared.sufficient) {
    activeRequestController?.abort("superseded");
    clearPredictiveResults();
    showStatus(`Datos insuficientes: ${prepared.validCount}/${prepared.requiredCount} registros validos`);
    return;
  }

  activeRequestController?.abort("superseded");
  const controller = new AbortController();
  activeRequestController = controller;
  try {
    const token = await getFirebaseIdToken();
    const responses = await Promise.all(APPROVED_HORIZONS.map((horizonHours) => postPrediction({
      implementationId: clientConfig.implementationId,
      clienteId: clientConfig.clienteId,
      profileId: clientConfig.profileId,
      horizonHours,
      records: request.records
    }, token, controller)));
    if (controller !== activeRequestController) return;
    renderPredictionResponses(responses);
  } catch (error) {
    if (controller !== activeRequestController) return;
    console.error("[PlantViewModel] error de inferencia", error);
    showServiceUnavailable();
  }
}

async function postPrediction(payload, token, controller) {
  const timeoutId = window.setTimeout(() => controller.abort("timeout"), MODELING_API_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_API_URL}/v1/plantview/predictions/cu-pls`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.detail || `HTTP ${response.status}`);
    validatePredictionResponse(body, payload.horizonHours);
    return body;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function validatePredictionResponse(response, horizon) {
  if (response?.status !== "ok" || response.predictionHorizonHours !== horizon
      || !Number.isFinite(response.prediction) || !Number.isFinite(response.recordsUsed)
      || !response.calculatedAt || !response.model?.name || !response.model?.version
      || !response.model?.validationStatus) {
    throw new Error("Respuesta predictiva inválida");
  }
}

function renderPredictionResponses(responses) {
  clearPredictiveResults();
  const calculatedAt = responses.map((item) => new Date(item.calculatedAt)).sort((a, b) => b - a)[0];
  document.getElementById("modelLastUpdated").textContent = `Último cálculo: ${formatDateTime(calculatedAt)}`;
  document.getElementById("cuIndicators").innerHTML = responses.map((response) => `
    <article class="model-indicator">
      <span>Cu²⁺ +${response.predictionHorizonHours} h</span>
      <strong>${formatNumber(response.prediction, 3)} ${escapeHtml(response.unit)}</strong>
      <small>Modelo: ${escapeHtml(response.model.name)}</small>
      <small>Timestamp: ${escapeHtml(formatDateTime(response.calculatedAt))}</small>
      <small>Registros utilizados: ${escapeHtml(response.recordsUsed)}</small>
      <small>Estado de validación: ${escapeHtml(response.model.validationStatus)}</small>
    </article>`).join("");
  document.getElementById("winningModelFacts").innerHTML = responses.map((response) => `
    <div><dt>Cu²⁺ +${response.predictionHorizonHours} h</dt><dd>${escapeHtml(response.model.name)} · ${escapeHtml(response.model.version)}</dd></div>
  `).join("");
  showStatus("Servicio predictivo conectado", "connected");
}

function showServiceUnavailable() {
  clearPredictiveResults();
  showStatus("Servicio predictivo no disponible");
}

function clearPredictiveResults() {
  document.getElementById("cuIndicators").innerHTML = "";
  document.getElementById("winningModelFacts").innerHTML = "";
  document.getElementById("modelLastUpdated").textContent = "Último cálculo: --";
}

function configureNavigation() {
  document.getElementById("backToDashboard").href = `index.html${window.location.search}`;
}

function renderClientIdentity() {
  setText("modelClient", clientConfig.clientName || "Cliente activo");
  setText("modelSite", clientConfig.siteName || "Faena activa");
  setText("modelProcess", clientConfig.processName || "Proceso activo");
}

function bindVariablesDialog() {
  if (dialogBound) return;
  dialogBound = true;
  const overlay = document.getElementById("modelVariablesOverlay");
  const open = document.getElementById("showModelVariables");
  const close = document.getElementById("closeModelVariables");
  document.getElementById("modelVariablesList").innerHTML = MODEL_FEATURES
    .map((variable) => `<li>${escapeHtml(variable)}</li>`).join("");
  const setOpen = (visible) => {
    overlay.classList.toggle("is-hidden", !visible);
    overlay.setAttribute("aria-hidden", String(!visible));
    if (visible) close.focus(); else open.focus();
  };
  open.addEventListener("click", () => setOpen(true));
  close.addEventListener("click", () => setOpen(false));
  overlay.addEventListener("click", (event) => { if (event.target === overlay) setOpen(false); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.classList.contains("is-hidden")) setOpen(false);
  });
}

function showStatus(message, state = "warning") {
  const element = document.getElementById("modelingError");
  element.textContent = message;
  element.classList.toggle("is-connected", state === "connected");
  element.classList.toggle("is-hidden", !message);
}

function showFatalError(error) {
  console.error("Información de modelamiento no disponible:", error);
  showServiceUnavailable();
}

function setText(id, value) { document.getElementById(id).textContent = value; }
function formatDateTime(value) { return new Date(value).toLocaleString("es-CL"); }
function formatNumber(value, decimals) {
  return Number(value).toLocaleString("es-CL", {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals
  });
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}
