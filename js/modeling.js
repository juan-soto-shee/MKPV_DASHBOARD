import "./productVersion.js?v=20260713-1";
import { clientConfig } from "./clientConfig.js";
import { closeRealtimeListener, startRealtimeListener } from "./firestoreService.js?v=20260713-1";
import {
  MODEL_FEATURES,
  buildPredictionRequest,
  parseModelingSelection,
  preparePredictiveData
} from "./modelingDataAdapter.js?v=20260714-1";

const selection = parseModelingSelection();
let dialogBound = false;

init().catch(showFatalError);

async function init() {
  configureNavigation();
  renderClientIdentity();
  bindVariablesDialog();
  clearPredictiveResults();
  showStatus("Cargando datos operacionales…");
  window.addEventListener("pagehide", closeRealtimeListener, { once: true });
  startRealtimeListener(handleRealtimeRecords, (connected) => {
    if (!connected) showStatus("No fue posible actualizar los datos operacionales.");
  });
}

function handleRealtimeRecords(records) {
  showStatus("Calculando disponibilidad de la predicción…");
  const prepared = preparePredictiveData(records, {
    clienteId: clientConfig.clienteId,
    implementationId: clientConfig.implementationId,
    profileId: clientConfig.profileId,
    periodHours: selection.periodHours,
    unit: selection.unit,
    variables: clientConfig.variables
  });
  const context = { ...selection, ...clientConfig };
  const request = buildPredictionRequest(prepared, context);

  console.info("[PlantViewModel] disponibilidad", {
    implementationId: clientConfig.implementationId,
    clienteId: clientConfig.clienteId,
    profileId: clientConfig.profileId,
    unit: selection.unit,
    periodHours: selection.periodHours,
    referenceTimestamp: request.context.referenceTimestamp,
    recordsReceived: prepared.received,
    validRecords: prepared.validCount,
    latestTimestamp: prepared.latestTimestamp
      ? new Date(prepared.latestTimestamp).toISOString()
      : null,
    model: clientConfig.profileId === "lixiviacion" ? request.modelId : null,
    rejection: rejectionReason(prepared)
  });

  renderAvailability(prepared);
}

function renderAvailability(prepared) {
  clearPredictiveResults();
  document.getElementById("modelLastUpdated").textContent = prepared.latestTimestamp
    ? `Último registro válido: ${new Date(prepared.latestTimestamp).toLocaleString("es-CL")}`
    : "Último registro válido: --";
  const profileAvailable = clientConfig.profileId === "lixiviacion";
  const availabilityMessage = !profileAvailable
    ? "Modelo no disponible para este perfil"
    : !prepared.sufficient || !prepared.hasVariation
      ? `Datos insuficientes para actualizar la predicción. Registros válidos: ${prepared.validCount} de ${prepared.requiredCount} requeridos.`
      : "Motor predictivo pendiente de conexión con el servicio de modelado.";

  renderIndicator("cuIndicators", availabilityMessage);
  renderIndicator("recoveryIndicators", "Modelo funcional de recuperación metalúrgica no disponible.");
  renderFacts("cuForecastDetails", [
    ["Estado", availabilityMessage],
    ["Registros válidos", `${prepared.validCount} de ${prepared.requiredCount} requeridos`]
  ]);
  renderFacts("recoveryForecastDetails", [["Estado", "Sin modelo funcional encontrado"]]);
  document.getElementById("modelMetricsBody").innerHTML = "<tr><td colspan=\"6\">No hay métricas de producción disponibles. El artefacto existente fue validado sólo con datos demostrativos.</td></tr>";
  renderFacts("winningModelFacts", [
    ["Modelo disponible", profileAvailable ? "Cu²⁺ PLS a 4 horas (Python, preliminar)" : "No disponible para este perfil"],
    ["Ejecución", "Backend Python requerido"],
    ["Periodo", `${selection.periodHours} horas`],
    ["Unidad", selection.unit],
    ["Registros considerados", prepared.considered],
    ["Registros válidos", prepared.validCount]
  ]);
  showStatus(availabilityMessage);
}

function rejectionReason(prepared) {
  if (clientConfig.profileId !== "lixiviacion") return "profile_not_supported";
  if (!prepared.sufficient) return "insufficient_records";
  if (!prepared.hasVariation) return "insufficient_variation";
  return "modeling_backend_not_configured";
}

function clearPredictiveResults() {
  for (const id of ["cuPredictionChart", "recoveryPredictionChart"]) {
    const canvas = document.getElementById(id);
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }
  renderIndicator("cuIndicators", "Sin predicción calculada");
  renderIndicator("recoveryIndicators", "Sin predicción calculada");
  renderFacts("cuForecastDetails", [["Resultado", "--"]]);
  renderFacts("recoveryForecastDetails", [["Resultado", "--"]]);
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
  document.getElementById("modelVariablesList").innerHTML = MODEL_FEATURES.map((variable) => `<li>${variable}</li>`).join("");
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

function renderIndicator(id, message) {
  document.getElementById(id).innerHTML = `<article class="model-indicator attention"><span>Estado</span><strong>${escapeHtml(message)}</strong></article>`;
}

function renderFacts(id, facts) {
  document.getElementById(id).innerHTML = facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
}

function showStatus(message) {
  const element = document.getElementById("modelingError");
  element.textContent = message;
  element.classList.toggle("is-hidden", !message);
}

function showFatalError(error) {
  console.error("Información de modelamiento no disponible:", error);
  clearPredictiveResults();
  showStatus("Información de modelamiento no disponible");
}

function setText(id, value) { document.getElementById(id).textContent = value; }
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}
