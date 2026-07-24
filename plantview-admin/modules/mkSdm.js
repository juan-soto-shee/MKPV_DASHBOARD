import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { generateDryRunCycle } from "./mkSdmGenerator.js";
import { RANGES } from "./mkSdmRanges.js";

const byId = (id) => document.getElementById(id);
let dbInstance;
const CLIENTS = { demo_lixiviacion: "Demo Lixiviación", solmin_mantos_blancos: "Solmin Mantos Blancos" };
const CONFIG_ROOT = new URL("../../config/customers/", import.meta.url);

const SPEED_MODE = Object.freeze({
  REAL_TIME: { intervalMs: 0 },
  DEMO_60S: { intervalMs: 60_000 },
  DEMO_30S: { intervalMs: 30_000 },
  DEMO_10S: { intervalMs: 10_000 },
  DEMO_5S: { intervalMs: 5_000 }
});

const DEFAULT_SPEED_MODE = "REAL_TIME";
const DEFAULT_MODE = "DRY_RUN";

function getSpeedModeConfig(mode) {
  const config = SPEED_MODE[mode];
  if (!config) throw new Error(`Modo de velocidad no soportado: ${mode}`);
  return config;
}

async function loadImplementation(selectedId) {
  const response = await fetch(new URL(`${encodeURIComponent(selectedId)}/client.json`, CONFIG_ROOT), { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo cargar la configuración de la implementación (${response.status}).`);
  const config = await response.json();
  if (config.enabled !== true || config.implementationId !== selectedId || typeof config.clienteId !== "string" || !config.clienteId || typeof config.profileId !== "string" || !config.profileId) {
    throw new Error("La configuración de la implementación seleccionada no es válida.");
  }
  return Object.freeze({ clienteId: config.clienteId, implementationId: config.implementationId, profileId: config.profileId });
}

function deterministicDocId(record) {
  const safeHora = record.hora.replace(/:/g, "");
  return `sdm_${record.clienteId}_${record.fecha}_${safeHora}_${record.turno}_p${record.pila}`;
}

function buildTimestamp(record) {
  const [y, m, d] = record.fecha.split("-").map(Number);
  const [h, min, s] = record.hora.split(":").map(Number);
  const date = new Date(y, m - 1, d, h, min, s);
  return date.getTime();
}

async function writeCycleToFirestore(records, implementation, cycleNumber) {
  let created = 0;
  let omitted = 0;
  let errors = 0;
  const lastCycle = [];

  for (const record of records) {
    const enriched = {
      ...record,
      subarea: `Pila ${record.pila}`,
      clienteId: implementation.clienteId,
      implementationId: implementation.implementationId,
      profileId: implementation.profileId,
      timestampCreacion: buildTimestamp(record)
    };
    const docId = deterministicDocId(enriched);
    const docRef = doc(dbInstance, "leach_records", docId);
    try {
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        omitted += 1;
        continue;
      }
      await setDoc(docRef, enriched);
      created += 1;
      lastCycle.push({ cycle: cycleNumber, pila: record.pila, docId });
    } catch (error) {
      console.error("Error escribiendo registro Firestore:", error);
      errors += 1;
    }
  }

  return { created, omitted, errors, lastCycle };
}

const CAMPOS_OBLIGATORIOS = ["pila", "fecha", "hora", "turno", "area", "subarea", "flujoPLS", "flujoRefino", "acidezRefino", "cuPls", "nivelPiscinaRefino", "nivelPiscinaPLS"];

function validateDryRunCycle(records) {
  const errors = [];
  if (!Array.isArray(records) || records.length !== 3) {
    errors.push(`Debe haber exactamente 3 registros. Se encontraron ${Array.isArray(records) ? records.length : 0}.`);
    return { valid: false, errors };
  }

  const pilas = new Set();
  const subareas = new Set();
  let fecha = null;
  let hora = null;
  let turno = null;

  for (const record of records) {
    if (!record || typeof record !== "object") {
      errors.push("Se encontró un registro no válido.");
      continue;
    }
    const pila = record.pila;
    if (![1, 2, 3].includes(pila)) {
      errors.push(`Pila inválida: ${pila}.`);
    } else {
      pilas.add(pila);
    }
    if (!record.subarea || typeof record.subarea !== "string" || !record.subarea.trim()) {
      errors.push(`Campo obligatorio vacío: subarea.`);
    } else {
      subareas.add(record.subarea.trim());
    }
    if (fecha === null) fecha = record.fecha;
    else if (record.fecha !== fecha) errors.push(`Fecha inconsistente: ${record.fecha}.`);
    if (hora === null) hora = record.hora;
    else if (record.hora !== hora) errors.push(`Hora inconsistente: ${record.hora}.`);
    if (turno === null) turno = record.turno;
    else if (record.turno !== turno) errors.push(`Turno inconsistente: ${record.turno}.`);
    for (const campo of CAMPOS_OBLIGATORIOS) {
      if (record[campo] === undefined || record[campo] === null || String(record[campo]).trim() === "") {
        errors.push(`Campo obligatorio vacío: ${campo}.`);
      }
    }
    if (RANGES.cuPls && (record.cuPls < RANGES.cuPls.min || record.cuPls > RANGES.cuPls.max)) {
      errors.push(`cuPls fuera de rango (${RANGES.cuPls.min}-${RANGES.cuPls.max}): ${record.cuPls}.`);
    }
    if (RANGES.flujoPLS && (record.flujoPLS < RANGES.flujoPLS.min || record.flujoPLS > RANGES.flujoPLS.max)) {
      errors.push(`flujoPLS fuera de rango (${RANGES.flujoPLS.min}-${RANGES.flujoPLS.max}): ${record.flujoPLS}.`);
    }
    if (RANGES.flujoRefino && (record.flujoRefino < RANGES.flujoRefino.min || record.flujoRefino > RANGES.flujoRefino.max)) {
      errors.push(`flujoRefino fuera de rango (${RANGES.flujoRefino.min}-${RANGES.flujoRefino.max}): ${record.flujoRefino}.`);
    }
    if (RANGES.acidezRefino && (record.acidezRefino < RANGES.acidezRefino.min || record.acidezRefino > RANGES.acidezRefino.max)) {
      errors.push(`acidezRefino fuera de rango (${RANGES.acidezRefino.min}-${RANGES.acidezRefino.max}): ${record.acidezRefino}.`);
    }
    if (RANGES.nivelPiscinaRefino && (record.nivelPiscinaRefino < RANGES.nivelPiscinaRefino.min || record.nivelPiscinaRefino > RANGES.nivelPiscinaRefino.max)) {
      errors.push(`nivelPiscinaRefino fuera de rango (${RANGES.nivelPiscinaRefino.min}-${RANGES.nivelPiscinaRefino.max}): ${record.nivelPiscinaRefino}.`);
    }
    if (RANGES.nivelPiscinaPLS && (record.nivelPiscinaPLS < RANGES.nivelPiscinaPLS.min || record.nivelPiscinaPLS > RANGES.nivelPiscinaPLS.max)) {
      errors.push(`nivelPiscinaPLS fuera de rango (${RANGES.nivelPiscinaPLS.min}-${RANGES.nivelPiscinaPLS.max}): ${record.nivelPiscinaPLS}.`);
    }
  }

  if (pilas.size !== 3) {
    errors.push(`Faltan pilas. Pilas encontradas: ${pilas.size > 0 ? [...pilas].sort((a, b) => a - b).join(", ") : "ninguna"}.`);
  }
  if (subareas.size !== 1) {
    errors.push(`Subáreas inconsistentes o duplicadas. Encontradas: ${subareas.size > 0 ? [...subareas].join(", ") : "ninguna"}.`);
  }

  return { valid: errors.length === 0, errors };
}

function renderValidationResult(records, validation, mode, metrics) {
  const lines = [
    "MK SDM - AUTOMÁTICO",
    "",
    `Modo: ${mode}`,
    `Ciclo: ${validation.cycleNumber || 0}`,
    `Velocidad: ${validation.speed || DEFAULT_SPEED_MODE}`,
    `Estado: ${validation.state || "STOPPED"}`,
    "",
    validation.valid ? "Ciclo generado: OK" : "Ciclo generado: ERROR",
    ""
  ];

  if (validation.valid) {
    lines.push(`Pila 1 ✓`, `Pila 2 ✓`, `Pila 3 ✓`, "");
    if (mode === "WRITE_FIRESTORE" && metrics) {
      lines.push(
        `Registros creados: ${metrics.created}`,
        `Registros omitidos: ${metrics.omitted}`,
        `Errores: ${metrics.errors}`,
        `Último ciclo escrito: ${metrics.lastCycle.length > 0 ? `Ciclo ${metrics.lastCycle[0].cycle}` : "Ninguno"}`,
        ""
      );
    }
  } else {
    lines.push(...validation.errors.map((error) => `• ${error}`), "");
  }

  lines.push(
    `Registros: ${Array.isArray(records) ? records.length : 0}`,
    "",
    mode === "WRITE_FIRESTORE" ? "Firestore: SI" : "Firestore: NO",
    "",
    `Resultado: ${validation.valid && (!metrics || metrics.errors === 0) ? "SUCCESS" : "FAIL"}`
  );

  return lines.join("\n");
}

export function initializeMkSdm(db, admin) {
  const el = Object.fromEntries([
    "mkSdmSection",
    "mkSdmNav",
    "mkSdmMessage",
    "sdmCheckButton",
    "sdmSpeedSelect",
    "sdmStartButton",
    "sdmStopButton",
    "sdmStateLabel",
    "sdmSpeedLabel",
    "sdmCycleCount",
    "sdmLastValidation",
    "sdmModeSelect",
    "sdmModeLabel",
    "sdmClientSelect",
    "sdmCreatedLabel",
    "sdmOmittedLabel",
    "sdmErrorsLabel",
    "sdmLastCycleLabel",
    "sdmStatusBadge",
    "sdmLastWriteLabel",
    "sdmProfileLabel",
    "sdmClientLabel",
    "sdmLastCycleTime",
    "sdmLastPile1",
    "sdmLastPile2",
    "sdmLastPile3",
    "sdmLastCycleResult",
    "sdmDiagHeartbeat",
    "sdmDiagTimers",
    "sdmDiagScheduler",
    "sdmDiagIds",
    "sdmDiagDebug",
    "sdmDiagTraces",
    "sdmDiagStack",
    "sdmDiagVars"
  ].map((id) => [id, byId(id)]));

  let busy = false;
  let timer = null;
  let cycleCount = 0;
  let currentSpeed = DEFAULT_SPEED_MODE;
  let currentMode = DEFAULT_MODE;
  let currentImplementation = null;
  let writeMetrics = { created: 0, omitted: 0, errors: 0, lastCycle: [] };
  dbInstance = db;

  function setBusy(value) {
    busy = value;
    el.sdmCheckButton.disabled = value;
    if (el.sdmStartButton) el.sdmStartButton.disabled = value || timer !== null;
    if (el.sdmStopButton) el.sdmStopButton.disabled = value || timer === null;
  }

  function message(text, error = false) {
    el.mkSdmMessage.textContent = text;
    el.mkSdmMessage.classList.toggle("is-error", error);
    if (error) {
      el.mkSdmMessage.style.color = "#ff8994";
    } else if (text.includes("DRY RUN")) {
      el.mkSdmMessage.style.color = "#e8c982";
    } else if (text.includes("SUCCESS") || text.includes("OK") || text.includes("PASS")) {
      el.mkSdmMessage.style.color = "#70d9a2";
    } else if (text.includes("FAIL")) {
      el.mkSdmMessage.style.color = "#ff8994";
    } else {
      el.mkSdmMessage.style.color = "#73dce8";
    }
  }

  function updateLastCyclePanel(records, validation) {
    if (el.sdmLastCycleTime && records[0]) el.sdmLastCycleTime.textContent = records[0].hora || "--";
    if (el.sdmLastPile1) {
      const p1 = records.find((r) => r.pila === 1);
      el.sdmLastPile1.textContent = p1 ? `${p1.flujoPLS} m3/h\n${p1.cuPls} g/L` : "--";
    }
    if (el.sdmLastPile2) {
      const p2 = records.find((r) => r.pila === 2);
      el.sdmLastPile2.textContent = p2 ? `${p2.flujoPLS} m3/h\n${p2.cuPls} g/L` : "--";
    }
    if (el.sdmLastPile3) {
      const p3 = records.find((r) => r.pila === 3);
      el.sdmLastPile3.textContent = p3 ? `${p3.flujoPLS} m3/h\n${p3.cuPls} g/L` : "--";
    }
    if (el.sdmLastCycleResult) el.sdmLastCycleResult.textContent = validation.valid ? "PASS" : "FAIL";
  }

  function updateStatus(state, mode, speed, count) {
    if (el.sdmStateLabel) el.sdmStateLabel.textContent = state;
    if (el.sdmModeLabel) el.sdmModeLabel.textContent = mode;
    if (el.sdmSpeedLabel) el.sdmSpeedLabel.textContent = speed;
    if (el.sdmCycleCount) el.sdmCycleCount.textContent = count;
    if (el.sdmCreatedLabel) el.sdmCreatedLabel.textContent = writeMetrics.created;
    if (el.sdmOmittedLabel) el.sdmOmittedLabel.textContent = writeMetrics.omitted;
    if (el.sdmErrorsLabel) el.sdmErrorsLabel.textContent = writeMetrics.errors;
    if (el.sdmLastCycleLabel) el.sdmLastCycleLabel.textContent = writeMetrics.lastCycle.length ? `Ciclo ${writeMetrics.lastCycle[0].cycle}` : "--";
    if (el.sdmStatusBadge) {
      el.sdmStatusBadge.textContent = state;
      el.sdmStatusBadge.className = "sdm-status-badge " + (state === "RUNNING" ? "is-running" : "is-stopped");
    }
    if (el.sdmLastWriteLabel) {
      el.sdmLastWriteLabel.textContent = writeMetrics.lastCycle.length ? `Ciclo ${writeMetrics.lastCycle[0].cycle}` : "--";
    }
    if (el.sdmProfileLabel) el.sdmProfileLabel.textContent = currentImplementation?.profileId || "--";
    if (el.sdmClientLabel) el.sdmClientLabel.textContent = currentImplementation?.clienteId || "--";
    if (el.sdmClientSelect) el.sdmClientSelect.value = currentImplementation?.implementationId || "";
  }

  function updateDiagnostics() {
    if (el.sdmDiagHeartbeat) el.sdmDiagHeartbeat.textContent = timer ? "active" : "idle";
    if (el.sdmDiagTimers) el.sdmDiagTimers.textContent = timer === "real-time" ? "real-time" : timer ? "interval" : "none";
    if (el.sdmDiagScheduler) el.sdmDiagScheduler.textContent = timer ? "running" : "stopped";
    if (el.sdmDiagIds) el.sdmDiagIds.textContent = dbInstance ? dbInstance.app.name : "--";
    if (el.sdmDiagDebug) el.sdmDiagDebug.textContent = busy ? "busy" : "idle";
    if (el.sdmDiagTraces) el.sdmDiagTraces.textContent = cycleCount ? `${cycleCount} cycles` : "0";
    if (el.sdmDiagStack) el.sdmDiagStack.textContent = currentMode;
    if (el.sdmDiagVars) el.sdmDiagVars.textContent = `speed=${currentSpeed}`;
  }

  function syncModeButtons() {
    if (!el.sdmModeSelect) return;
    const mode = el.sdmModeSelect.value;
    document.querySelectorAll(".sdm-mode-button").forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === mode));
  }

  function syncSpeedButtons() {
    if (!el.sdmSpeedSelect) return;
    const speed = el.sdmSpeedSelect.value;
    document.querySelectorAll(".sdm-speed-button").forEach((btn) => btn.classList.toggle("active", btn.dataset.speed === speed));
  }

  async function ensureImplementation() {
    const selectedClient = el.sdmClientSelect?.value;
    if (!selectedClient) {
      message("Seleccione un cliente antes de escribir en Firestore.", true);
      return null;
    }
    if (!currentImplementation || currentImplementation.implementationId !== selectedClient) {
      try {
        currentImplementation = await loadImplementation(selectedClient);
      } catch (error) {
        message(error.message || "No fue posible cargar la configuración del cliente.", true);
        return null;
      }
    }
    return currentImplementation;
  }

  async function runCycle() {
    if (busy) return;
    busy = true;
    try {
      const records = generateDryRunCycle();
      const validation = validateDryRunCycle(records);
      cycleCount += 1;
      validation.cycleNumber = cycleCount;
      validation.speed = currentSpeed;
      validation.state = timer ? "RUNNING" : "STOPPED";

      let writeResult = null;
      if (validation.valid && currentMode === "WRITE_FIRESTORE") {
        const impl = await ensureImplementation();
        if (!impl) {
          stopAutomaticGeneration();
          return;
        }
        try {
          writeResult = await writeCycleToFirestore(records, impl, cycleCount);
          writeMetrics.created += writeResult.created;
          writeMetrics.omitted += writeResult.omitted;
          writeMetrics.errors += writeResult.errors;
          if (writeResult.lastCycle.length) writeMetrics.lastCycle = writeResult.lastCycle;
        } catch (error) {
          message(error.message || "No fue posible escribir en Firestore.", true);
          stopAutomaticGeneration();
          return;
        }
      }

      updateStatus(validation.state, currentMode, currentSpeed, cycleCount);
      message(renderValidationResult(records, validation, currentMode, writeResult || writeMetrics), !validation.valid);
      updateLastCyclePanel(records, validation);
      updateDiagnostics();
      syncSpeedButtons();
      syncModeButtons();
      if (el.sdmLastValidation) el.sdmLastValidation.textContent = validation.valid ? "OK" : "FAIL";
      if (!validation.valid) {
        stopAutomaticGeneration();
      }
    } catch (error) {
      message(error.message || "No fue posible generar el ciclo automático.", true);
      stopAutomaticGeneration();
    } finally {
      busy = false;
    }
  }

  function startAutomaticGeneration(speed) {
    if (timer) return;
    if (admin?.rol !== "metkinetics_admin") {
      message("Rol metkinetics_admin requerido.", true);
      return;
    }
    try {
      currentSpeed = speed || DEFAULT_SPEED_MODE;
      const config = getSpeedModeConfig(currentSpeed);
      if (config.intervalMs > 0) {
        timer = setInterval(runCycle, config.intervalMs);
      } else {
        timer = "real-time";
      }
      runCycle();
      updateStatus("RUNNING", currentMode, currentSpeed, cycleCount);
      syncModeButtons();
      syncSpeedButtons();
      if (el.sdmStartButton) el.sdmStartButton.disabled = true;
      if (el.sdmStopButton) el.sdmStopButton.disabled = false;
    } catch (error) {
      message(error.message || "No fue posible iniciar la generación automática.", true);
      stopAutomaticGeneration();
    }
  }

  function stopAutomaticGeneration(reason = "stop") {
    if (timer && timer !== "real-time") {
      clearInterval(timer);
    }
    timer = null;
    updateStatus("STOPPED", currentMode, currentSpeed, cycleCount);
    updateDiagnostics();
    syncModeButtons();
    syncSpeedButtons();
    if (el.sdmStartButton) el.sdmStartButton.disabled = false;
    if (el.sdmStopButton) el.sdmStopButton.disabled = true;
  }

  const showRequestedSection = () => {
    const active = location.hash === "#sdm";
    el.mkSdmSection.hidden = !active;
    if (active) {
      document.getElementById("adminHome").hidden = true;
      document.getElementById("bulkImportSection").hidden = true;
      document.getElementById("deleteHistorySection").hidden = true;
      document.getElementById("demoGeneratorSection").hidden = true;
      updateStatus("STOPPED", currentMode, currentSpeed, cycleCount);
      syncModeButtons();
      syncSpeedButtons();
      updateDiagnostics();
    } else {
      document.getElementById("adminHome").hidden = false;
    }
  };

  el.mkSdmNav.addEventListener("click", () => setTimeout(showRequestedSection));
  window.addEventListener("hashchange", showRequestedSection);

  el.sdmCheckButton.addEventListener("click", async () => {
    if (busy) return;
    if (admin?.rol !== "metkinetics_admin") {
      return message("Rol metkinetics_admin requerido.", true);
    }
    setBusy(true);
    try {
      const records = generateDryRunCycle();
      const validation = validateDryRunCycle(records);
      if (!validation.valid) {
        const summary = [
          "MK SDM - DRY RUN",
          "",
          "Ciclo generado: ERROR",
          "",
          ...validation.errors.map((error) => `• ${error}`),
          "",
          `Registros: ${records.length}`,
          "",
          "Firestore: NO",
          "",
          "Resultado: FAIL"
        ].join("\n");
        message(summary, true);
        updateLastCyclePanel(records, validation);
        return;
      }
      const summary = [
        "MK SDM - DRY RUN",
        "",
        "Ciclo generado: OK",
        "",
        `Pila 1 ✓`,
        `Pila 2 ✓`,
        `Pila 3 ✓`,
        "",
        `Registros: ${records.length}`,
        "",
        "Firestore: NO",
        "",
        "Resultado: SUCCESS"
      ].join("\n");
      message(summary);
      updateLastCyclePanel(records, validation);
      if (el.sdmLastValidation) el.sdmLastValidation.textContent = validation.valid ? "OK" : "FAIL";
      syncModeButtons();
      syncSpeedButtons();
    } catch (error) {
      message(error.message || "No fue posible generar el dry run.", true);
    } finally {
      setBusy(false);
    }
  });

  el.sdmModeSelect?.addEventListener("change", () => {
    currentMode = el.sdmModeSelect.value;
    updateStatus(timer ? "RUNNING" : "STOPPED", currentMode, currentSpeed, cycleCount);
    syncModeButtons();
  });

  el.sdmSpeedSelect?.addEventListener("change", () => {
    currentSpeed = el.sdmSpeedSelect.value;
    updateStatus(timer ? "RUNNING" : "STOPPED", currentMode, currentSpeed, cycleCount);
    syncSpeedButtons();
  });

  document.querySelectorAll(".sdm-mode-button").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (el.sdmModeSelect) {
        el.sdmModeSelect.value = btn.dataset.mode;
        el.sdmModeSelect.dispatchEvent(new Event("change"));
      }
    });
  });

  document.querySelectorAll(".sdm-speed-button").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (el.sdmSpeedSelect) {
        el.sdmSpeedSelect.value = btn.dataset.speed;
        el.sdmSpeedSelect.dispatchEvent(new Event("change"));
      }
    });
  });

  if (el.sdmStartButton) {
    el.sdmStartButton.addEventListener("click", () => {
      const speed = el.sdmSpeedSelect?.value || DEFAULT_SPEED_MODE;
      startAutomaticGeneration(speed);
    });
  }

  if (el.sdmStopButton) {
    el.sdmStopButton.addEventListener("click", () => stopAutomaticGeneration("manual"));
  }

  return {
    showRequestedSection,
    setAdmin(value) { admin = value; },
    startAutomaticGeneration,
    stopAutomaticGeneration
  };
}
