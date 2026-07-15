import "./productVersion.js?v=20260713-1";
import { clientConfig } from "./clientConfig.js";
import { closeRealtimeListener, startRealtimeListener } from "./firestoreService.js?v=20260713-1";
import { requireWebAccess } from "./webAccess.js?v=auth-v2";
import {
  MODEL_FEATURES,
  buildPredictionRequest,
  parseModelingSelection,
  preparePredictiveData
} from "./modelingDataAdapter.js?v=20260714-2";
import { BASE_API_URL, MODELING_API_TIMEOUT_MS } from "./modelingConfig.js?v=20260714-1";
import { LOCAL_MODELING_RESULT } from "./modelingLocalResult.js?v=20260715-1";

const selection = parseModelingSelection();
let dialogBound = false;
let activeRequestController = null;
let requestSequence = 0;
let cuPredictionChart = null;

init().catch(showFatalError);

async function init() {
  configureNavigation();
  renderClientIdentity();
  bindVariablesDialog();
  clearPredictiveResults();
  await requireWebAccess();
  renderLocalModelResult();
  showStatus("Cargando datos operacionales…");
  window.addEventListener("pagehide", closeRealtimeListener, { once: true });
  startRealtimeListener(handleRealtimeRecords, (connected) => {
    if (!connected) showStatus("No fue posible actualizar los datos operacionales.");
  });
}

async function handleRealtimeRecords(records) {
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
    recordsAfterClient: prepared.afterClient,
    recordsAfterImplementation: prepared.afterImplementation,
    recordsAfterUnit: prepared.afterUnit,
    recordsAfterPeriod: prepared.afterPeriod,
    recordsAfterValidation: prepared.afterValidation,
    duplicatesRemoved: prepared.duplicatesRemoved,
    firstTimestamp: request.records.length ? request.records[0].timestampCreacion : null,
    lastTimestamp: request.records.length ? request.records.at(-1).timestampCreacion : null,
    finalRecordsLength: request.records.length,
    latestTimestamp: prepared.latestTimestamp
      ? new Date(prepared.latestTimestamp).toISOString()
      : null,
    model: clientConfig.profileId === "lixiviacion" ? request.modelId : null,
    rejection: rejectionReason(prepared)
  });

  if (clientConfig.profileId !== "lixiviacion" || !prepared.sufficient || !prepared.hasVariation) {
    activeRequestController?.abort("superseded");
    if (clientConfig.profileId === "lixiviacion") renderLocalModelResult();
    else renderAvailability(prepared);
    return;
  }

  const sequence = ++requestSequence;
  activeRequestController?.abort("superseded");
  const controller = new AbortController();
  activeRequestController = controller;
  showStatus("Calculando predicción…");

  try {
    const response = await postPrediction(request, controller);
    if (sequence !== requestSequence) return;
    renderPredictionResponse(response, prepared);
  } catch (error) {
    if (sequence !== requestSequence || controller.signal.reason === "superseded") return;
    renderApiError(error, prepared);
  } finally {
    if (activeRequestController === controller) activeRequestController = null;
  }
}

async function postPrediction(payload, controller) {
  const timeoutId = window.setTimeout(() => controller.abort("timeout"), MODELING_API_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_API_URL}/v1/plantview/predictions/cu-pls-4h`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const body = await parseResponseBody(response);
    if (!response.ok) {
      const error = new Error(apiErrorMessage(response.status, body));
      error.status = response.status;
      error.body = body;
      throw error;
    }
    validatePredictionResponse(body);
    return body;
  } catch (error) {
    if (controller.signal.reason === "timeout") {
      throw new Error(`La API no respondió dentro de ${MODELING_API_TIMEOUT_MS / 1000} segundos.`);
    }
    if (error instanceof TypeError) {
      throw new Error(`No fue posible conectar con la API en ${BASE_API_URL}.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function parseResponseBody(response) {
  try { return await response.json(); }
  catch { throw new Error("La API devolvió una respuesta inválida."); }
}

function validatePredictionResponse(response) {
  if (response?.status !== "ok"
      || !Number.isFinite(response.prediction)
      || !Number.isFinite(response.recordsUsed)
      || !response.calculatedAt
      || !response.model?.name
      || !response.model?.version) {
    throw new Error("La API devolvió una respuesta inválida.");
  }
}

function apiErrorMessage(status, body) {
  if (status === 422) return body?.message || "La API rechazó los datos enviados.";
  if (status >= 500) return "El servicio predictivo presentó un error interno.";
  return body?.message || `La API respondió con HTTP ${status}.`;
}

function renderPredictionResponse(response, prepared) {
  clearPredictiveResults();
  const metrics = response.metrics || {};
  document.getElementById("modelLastUpdated").textContent = `Último cálculo: ${formatDateTime(response.calculatedAt)}`;
  document.getElementById("cuIndicators").innerHTML = [
    ["Predicción a 4 horas", `${formatNumber(response.prediction, 3)} ${response.unit}`],
    ["Registros utilizados", response.recordsUsed],
    ["Estado del modelo", response.model.validationStatus]
  ].map(([label, value]) => `<article class="model-indicator"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  renderIndicator("recoveryIndicators", "Modelo funcional de recuperación metalúrgica no disponible.");
  renderFacts("cuForecastDetails", [
    ["Predicción", `${formatNumber(response.prediction, 3)} ${response.unit}`],
    ["Horizonte", `${response.predictionHorizonHours} horas`],
    ["Timestamp del cálculo", formatDateTime(response.calculatedAt)],
    ["Referencia operacional", formatDateTime(response.referenceTimestamp)]
  ]);
  renderFacts("recoveryForecastDetails", [["Estado", "Sin modelo funcional encontrado"]]);
  document.getElementById("modelMetricsBody").innerHTML = `<tr><th scope="row">${escapeHtml(response.model.name)}</th><td>${formatMetric(metrics.mae)}</td><td>${formatMetric(metrics.rmse)}</td><td>${formatMetric(metrics.r2)}</td><td>--</td><td><span class="model-status">${escapeHtml(response.model.validationStatus)}</span></td></tr>`;
  renderFacts("winningModelFacts", [
    ["Modelo", response.model.name],
    ["Versión", response.model.version],
    ["Estado", response.model.validationStatus],
    ["Registros utilizados", response.recordsUsed],
    ["Periodo", `${selection.periodHours} horas`],
    ["Unidad", selection.unit],
    ["Último registro enviado", prepared.latestTimestamp ? formatDateTime(prepared.latestTimestamp) : "--"]
  ]);
  renderCuPredictionChart(LOCAL_MODELING_RESULT);
  showStatus("");
}

function renderLocalModelResult() {
  const result = LOCAL_MODELING_RESULT;
  const metadata = result.metadata;
  clearPredictiveResults();
  document.getElementById("modelLastUpdated").textContent = `Modelo entrenado: ${formatDateTime(metadata.trainedAt)}`;
  document.getElementById("cuIndicators").innerHTML = [
    ["Valor actual", `${formatNumber(result.currentCuPls, 3)} g/L`],
    ["Predicción a 4 horas", `${formatNumber(result.predictedCuPls, 3)} g/L`],
    ["Error MAE de prueba", `${formatNumber(metadata.testMetrics.mae, 4)} g/L`],
    ["Precisión R²", formatNumber(metadata.testMetrics.r2, 3)]
  ].map(([label, value]) => `<article class="model-indicator"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
  renderIndicator("recoveryIndicators", "La recuperación metalúrgica requiere su balance histórico para entrenar un modelo independiente.");
  renderFacts("cuForecastDetails", [
    ["Fuente", "Histórico local de seis meses"],
    ["Pares válidos", "1.632"],
    ["Horizonte", "4 horas"],
    ["Estado", "Modelo preliminar operativo"]
  ]);
  renderFacts("recoveryForecastDetails", [["Estado", "Pendiente de datos de recuperación"]]);
  document.getElementById("modelMetricsBody").innerHTML = result.metrics.map((row) => {
    const winner = row.selected === true || row.selected === "True";
    return `<tr class="${winner ? "winner-row" : ""}"><th scope="row">${escapeHtml(row.modelName)}</th><td>${formatMetric(row.validation_mae)}</td><td>${formatMetric(row.validation_rmse)}</td><td>${formatMetric(row.validation_r2)}</td><td>--</td><td><span class="model-status">${winner ? "Ganador" : "Evaluado"}</span></td></tr>`;
  }).join("");
  renderFacts("winningModelFacts", [
    ["Modelo", metadata.modelName],
    ["Versión", metadata.modelVersion],
    ["Registros de entrenamiento", metadata.trainingRows],
    ["Registros de validación", metadata.validationRows],
    ["Registros de prueba", metadata.testRows],
    ["MAE prueba", `${formatNumber(metadata.testMetrics.mae, 4)} g/L`],
    ["R² prueba", formatNumber(metadata.testMetrics.r2, 4)]
  ]);
  renderCuPredictionChart(result);
  showStatus("Modelo matemático operativo con el histórico local de seis meses.");
}

function renderCuPredictionChart(result) {
  const canvas = document.getElementById("cuPredictionChart");
  if (!canvas || typeof Chart === "undefined") return;
  cuPredictionChart?.destroy();
  cuPredictionChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: result.labels.map((value) => new Date(value).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit" })),
      datasets: [
        { label: "Cu²⁺ real", data: result.actual, borderColor: "#28d7f4", backgroundColor: "transparent", borderWidth: 2, pointRadius: 1, tension: 0.25 },
        { label: "Cu²⁺ predicho", data: result.predicted, borderColor: "#ffb000", backgroundColor: "transparent", borderWidth: 2, borderDash: [6, 4], pointRadius: 1, tension: 0.25 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: "#c9dde5" } } },
      scales: {
        x: { ticks: { color: "#8eabb5", maxTicksLimit: 8 }, grid: { color: "rgba(100,150,170,.12)" } },
        y: { title: { display: true, text: "Cu²⁺ PLS (g/L)", color: "#8eabb5" }, ticks: { color: "#8eabb5" }, grid: { color: "rgba(100,150,170,.12)" } }
      }
    }
  });
}

function renderApiError(error, prepared) {
  console.error("[PlantViewModel] error de inferencia", {
    message: error.message,
    status: error.status || null,
    response: error.body || null
  });
  clearPredictiveResults();
  renderFacts("winningModelFacts", [
    ["Estado", error.message],
    ["Registros válidos", prepared.validCount],
    ["Unidad", selection.unit],
    ["Periodo", `${selection.periodHours} horas`]
  ]);
  showStatus(error.message);
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
function formatDateTime(value) { return new Date(value).toLocaleString("es-CL"); }
function formatNumber(value, decimals) { return Number(value).toLocaleString("es-CL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }
function formatMetric(value) { return Number.isFinite(Number(value)) ? formatNumber(Number(value), 3) : "--"; }
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}
