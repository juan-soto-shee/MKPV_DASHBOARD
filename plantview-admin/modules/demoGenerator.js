import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "../../js/firebaseConfig.js";

const API_URL = globalThis.PLANTVIEW_DEMO_GENERATOR_API_URL || "";
const STATE_REF = doc(db, "demo_generator_state", "current");
const HEARTBEAT_TIMEOUT_MS = 90_000;
const IDS = [
  "demoGeneratorNav", "demoGeneratorSection", "demoGeneratorMessage", "generatorState", "generatorMode",
  "generatorClient", "generatorLastNormal", "generatorSession", "generatorFactor", "generatorSimulatedTime",
  "generatorRecordCount", "generatorReturnPoint", "generatorNextNormal", "generatorLastError", "generatorScheduler",
  "generatorProcess", "generatorHeartbeat", "generatorLastPing", "generatorLastResult", "generatorActivityWarning",
  "demoScenario", "demoFactor", "startNormalGenerator", "pauseNormalGenerator", "startAcceleratedDemo",
  "pauseAcceleratedDemo", "restoreNormalTimeline", "generateTestCycle"
];

export function initializeDemoGenerator(auth, initialAdmin) {
  const el = Object.fromEntries(IDS.map((id) => [id, document.getElementById(id)]));
  let admin = initialAdmin, busy = false;
  const showRequestedSection = () => {
    const active = location.hash === "#generador-demo";
    el.demoGeneratorSection.hidden = !active;
    if (active) {
      document.getElementById("adminHome").hidden = true;
      document.getElementById("bulkImportSection").hidden = true;
      document.getElementById("deleteHistorySection").hidden = true;
      refresh();
    }
  };
  el.demoGeneratorNav.addEventListener("click", () => setTimeout(showRequestedSection));
  window.addEventListener("hashchange", showRequestedSection);

  const action = async (path, body = {}, confirmText = "") => {
    if (busy || (confirmText && !confirm(confirmText))) return;
    busy = true; message("Procesando...");
    try { await requestBackend(path, body); await refresh(); message("Operación completada."); }
    catch (error) { message(error.message, true); }
    finally { busy = false; }
  };
  el.startNormalGenerator.onclick = () => action("/normal/start");
  el.pauseNormalGenerator.onclick = () => action("/normal/pause");
  el.generateTestCycle.onclick = () => action("/normal/once");
  el.startAcceleratedDemo.onclick = () => action("/demo/start", { scenario: el.demoScenario.value, factor: Number(el.demoFactor.value) }, "Se pausará el generador normal y comenzará una demo acelerada. ¿Continuar?");
  el.pauseAcceleratedDemo.onclick = () => action("/demo/pause");
  el.restoreNormalTimeline.onclick = () => action("/demo/restore", { reason: "admin" }, "La sesión acelerada se cerrará y sus datos dejarán de ser visibles. ¿Continuar?");

  async function readPersistedState() {
    if (admin?.rol !== "metkinetics_admin") throw new Error("Rol metkinetics_admin requerido");
    const snapshot = await getDoc(STATE_REF);
    if (!snapshot.exists()) return { estado: "STOPPED", schedulerActive: false, processMode: null };
    return snapshot.data();
  }

  async function requestBackend(path, body) {
    if (admin?.rol !== "metkinetics_admin") throw new Error("Rol metkinetics_admin requerido");
    if (!API_URL) throw new Error("El backend no está disponible para ejecutar acciones");
    const token = await auth.currentUser?.getIdToken();
    const response = await fetch(`${API_URL}${path}`, {
      method: path === "/status" ? "GET" : "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: path === "/status" ? undefined : JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Error del servicio");
    return data;
  }

  async function refresh() {
    try {
      const persisted = await readPersistedState();
      let state = persisted;
      if (API_URL) {
        try {
          const live = await requestBackend("/status");
          state = { ...persisted,
            schedulerActive: live.schedulerActive ?? persisted.schedulerActive,
            processMode: live.processMode ?? persisted.processMode,
            lastHeartbeatAt: live.lastHeartbeatAt ?? persisted.lastHeartbeatAt,
            activity: live.activity ?? persisted.activity,
            lastPingAt: new Date()
          };
        } catch { state = persisted; }
      }
      render(state); message("Estado cargado desde Firestore.");
    } catch (error) { message(error.message, true); }
  }

  function render(state) {
    const heartbeat = toDate(state.lastHeartbeatAt);
    const heartbeatFresh = heartbeat && Date.now() - heartbeat.getTime() <= HEARTBEAT_TIMEOUT_MS;
    const processActive = state.estado === "NORMAL_RUNNING" && state.schedulerActive === true && heartbeatFresh;
    const result = state.lastExecutionResult || state.ultimoResultado;
    const created = result?.registrosCreados ?? state.registrosUltimoCiclo;
    el.generatorState.textContent = state.estado || "STOPPED";
    el.generatorMode.textContent = state.mode || "stopped";
    el.generatorClient.textContent = state.clientId || "demo_lixiviacion";
    el.generatorLastNormal.textContent = format(state.lastExecutionAt || state.ultimaEjecucionNormal, "No disponible");
    el.generatorSession.textContent = state.sessionId || "Ninguna";
    el.generatorFactor.textContent = state.factorAceleracion || "No aplica";
    el.generatorSimulatedTime.textContent = format(state.tiempoSimulado, "No disponible");
    el.generatorRecordCount.textContent = state.registrosGenerados ?? 0;
    el.generatorReturnPoint.textContent = state.valoresBasePorPila || state.ultimoRegistroAutomaticoNormalPorPila || state.valoresActualesPorPila ? "Guardado" : "No disponible";
    el.generatorNextNormal.textContent = format(state.siguienteHorarioNormalEsperado, "No disponible");
    el.generatorLastError.textContent = state.ultimoError || "Ninguno";
    el.generatorScheduler.textContent = state.schedulerActive === true ? "Activo" : "Detenido";
    el.generatorProcess.textContent = processActive ? "Activo" : "No activo";
    el.generatorHeartbeat.textContent = format(state.lastHeartbeatAt, "No disponible");
    el.generatorLastPing.textContent = format(state.lastPingAt, "No disponible");
    el.generatorLastResult.textContent = result?.ok === false ? "Fallido" : Number.isFinite(Number(created)) ? `Correcto (${created} registros)` : "No disponible";
    const inconsistent = state.estado === "NORMAL_RUNNING" && !processActive;
    el.generatorActivityWarning.textContent = inconsistent ? "Estado inconsistente o proceso desconectado" : processActive ? "Generador continuo activo" : "Generador continuo detenido";
    el.generatorActivityWarning.classList.toggle("is-error", inconsistent);
  }

  function toDate(value) { if (!value) return null; const date = value.toDate?.() || new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
  function format(value, fallback) { return toDate(value)?.toLocaleString("es-CL") || fallback; }
  function message(text, error = false) { el.demoGeneratorMessage.textContent = text; el.demoGeneratorMessage.classList.toggle("is-error", error); }
  return { showRequestedSection, setAdmin(value) { admin = value; } };
}
