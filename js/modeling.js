import "./productVersion.js?v=20260713-1";

const charts = new Map();
const locale = "es-CL";
let data;

init().catch((error) => {
  console.error("Información de modelamiento no disponible:", error);
  document.getElementById("modelingError")?.classList.remove("is-hidden");
  document.querySelectorAll(".prediction-module, .modeling-section").forEach((element) => element.classList.add("modeling-unavailable"));
});

async function init() {
  configureNavigation();
  await renderClientIdentity();
  ({ modelingDemoData: data } = await import("./modelingDemoData.js?v=20260713-1"));
  if (!data || !Array.isArray(data.modelMetrics)) throw new Error("Los datos demostrativos no tienen el formato esperado.");
  document.getElementById("modelLastUpdated").textContent = `Última actualización del modelo: ${data.lastUpdated}`;
  renderIndicators();
  renderDetails();
  renderMetrics();
  renderWinningModel();
  bindVariablesDialog();
  renderCharts();
}

function configureNavigation() {
  const query = window.location.search;
  document.getElementById("backToDashboard").href = `index.html${query}`;
}

async function renderClientIdentity() {
  const fallback = { clientName: "Cliente activo", siteName: "Faena activa", processName: "Proceso activo" };
  let config = fallback;
  try {
    ({ clientConfig: config } = await import("./clientConfig.js"));
  } catch (error) {
    console.warn("No se pudo cargar la configuración del cliente; se usarán textos genéricos controlados.", error);
  }
  setText("modelClient", config.clientName || fallback.clientName);
  setText("modelSite", config.siteName || fallback.siteName);
  setText("modelProcess", config.processName || fallback.processName);
}

function renderIndicators() {
  renderIndicatorGroup("cuIndicators", [
    ["Valor actual", format(data.currentCuPls, 2, "g/L")], ["Predicción a 4 horas", format(data.predictedCuPls, 2, "g/L"), "positive"],
    ["Tendencia", data.predictedCuPls >= data.currentCuPls ? "Ascendente" : "Descendente", "positive"], ["Confianza del modelo", format(data.confidence, 0, "%")]
  ]);
  const deviation = data.projectedRecovery - data.recoveryTarget;
  renderIndicatorGroup("recoveryIndicators", [
    ["Recuperación actual", format(data.currentRecovery, 1, "%")], ["Recuperación proyectada", format(data.projectedRecovery, 1, "%"), "positive"],
    ["Recuperación objetivo", format(data.recoveryTarget, 1, "%")], ["Desviación", `${format(deviation, 1)} puntos porcentuales`, deviation < 0 ? "attention" : "positive"]
  ]);
}

function renderIndicatorGroup(id, indicators) {
  document.getElementById(id).innerHTML = indicators.map(([label, value, tone = ""]) => `<article class="model-indicator ${tone}"><span>${label}</span><strong>${value}</strong></article>`).join("");
}

function renderDetails() {
  renderFactList("cuForecastDetails", [["Próxima predicción", format(data.predictedCuPls, 2, "g/L")], ["Horizonte", `${data.predictionHorizonHours} horas`], ["Error promedio histórico MAE", format(data.cuMae, 3, "g/L")], ["Modelo seleccionado", data.selectedCuModel]]);
  renderFactList("recoveryForecastDetails", [["Próxima proyección", format(data.projectedRecovery, 1, "%")], ["Horizonte", `${data.recoveryHorizonHours} horas`], ["Error promedio histórico MAE", format(data.recoveryMae, 1, "p.p.")], ["Modelo seleccionado", data.selectedRecoveryModel]]);
}

function renderMetrics() {
  document.getElementById("modelMetricsBody").innerHTML = data.modelMetrics.map((row) => `<tr class="${row.winner ? "is-winner" : ""}"><th scope="row">${row.model}</th><td>${row.mae}</td><td>${row.rmse}</td><td>${row.r2}</td><td>${row.time}</td><td><span class="model-status">${row.status}</span></td></tr>`).join("");
}

function renderWinningModel() {
  const model = data.winningModel;
  renderFactList("winningModelFacts", [["Modelo", model.model], ["Versión", model.version], ["Fecha de entrenamiento", model.trainingDate], ["Registros utilizados", model.recordCount], ["Periodo de datos", model.dataPeriod], ["Variables utilizadas", model.variableCount], ["Horizonte de predicción", model.horizon], ["Error MAE", model.mae]]);
}

function renderFactList(id, facts) {
  document.getElementById(id).innerHTML = facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
}

function bindVariablesDialog() {
  const overlay = document.getElementById("modelVariablesOverlay");
  const open = document.getElementById("showModelVariables");
  const close = document.getElementById("closeModelVariables");
  document.getElementById("modelVariablesList").innerHTML = data.modelVariables.map((variable) => `<li>${variable}</li>`).join("");
  const setOpen = (visible) => { overlay.classList.toggle("is-hidden", !visible); overlay.setAttribute("aria-hidden", String(!visible)); if (visible) close.focus(); else open.focus(); };
  open.addEventListener("click", () => setOpen(true));
  close.addEventListener("click", () => setOpen(false));
  overlay.addEventListener("click", (event) => { if (event.target === overlay) setOpen(false); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !overlay.classList.contains("is-hidden")) setOpen(false); });
}

function renderCharts() {
  if (typeof Chart === "undefined") throw new Error("Chart.js no está disponible.");
  createChart("cuPredictionChart", [series("Valor real", data.cuSeries.actual, "#32d5e8"), series("Valor predicho", data.cuSeries.predicted, "#22c55e", true)], "Cu²⁺ en PLS (g/L)");
  createChart("recoveryPredictionChart", [series("Recuperación real", data.recoverySeries.actual, "#32d5e8"), series("Recuperación proyectada", data.recoverySeries.projected, "#22c55e", true), series("Objetivo", data.labels.map(() => data.recoveryTarget), "#f59e0b", true)], "Recuperación (%)");
}

function series(label, values, color, dashed = false) { return { label, data: values, borderColor: color, backgroundColor: color, borderWidth: 2, borderDash: dashed ? [7, 5] : [], tension: 0.3, pointRadius: 3, pointHoverRadius: 5 }; }

function createChart(id, datasets, yTitle) {
  charts.get(id)?.destroy();
  const canvas = document.getElementById(id);
  charts.set(id, new Chart(canvas, { type: "line", data: { labels: data.labels, datasets }, options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: "index" }, plugins: { legend: { labels: { color: "#e6f2f5", usePointStyle: true } }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${Number(context.parsed.y).toLocaleString(locale)}${yTitle.includes("g/L") ? " g/L" : " %"}` } } }, scales: { x: { title: { display: true, text: "Fecha", color: "#91a8b0" }, ticks: { color: "#91a8b0" }, grid: { color: "rgba(40,75,88,.35)" } }, y: { title: { display: true, text: yTitle, color: "#91a8b0" }, ticks: { color: "#91a8b0" }, grid: { color: "rgba(40,75,88,.35)" } } } } }));
}

function format(value, decimals, unit = "") { return `${Number(value).toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${unit ? ` ${unit}` : ""}`; }
function setText(id, value) { document.getElementById(id).textContent = value; }
