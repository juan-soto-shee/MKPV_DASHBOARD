import { DEMO_CLIENT, IMPLEMENTATION_ID, PROFILE_ID } from "./config.js";
import { BASE_VALUES, RANGES } from "./ranges.js";
import { calculateShift, formatDateTime } from "./timelineManager.js";
const clamp = (value, range) => Math.min(range.max, Math.max(range.min, value));
export function evolveValues(previous, { random = Math.random, bias = {} } = {}) {
  return Object.fromEntries(Object.entries(RANGES).map(([key, range]) => {
    const variation = (random() * 2 - 1) * range.delta + Number(bias[key] || 0);
    return [key, Number(clamp(Number(previous[key]) + variation, range).toFixed(range.decimals))];
  }));
}
export function buildCycle({ previousByPile = BASE_VALUES, processTime = new Date(), mode = "normal", sessionId = null, factor = 1, scenario = "estable", random, bias = {} }) {
  return Object.entries(previousByPile).map(([subarea, previous]) => {
    const values = evolveValues(previous, { random, bias });
    const { fecha, hora } = formatDateTime(processTime);
    return { fecha, hora, turno: calculateShift(processTime), area: "Lixiviación", subarea, operador: "Simulador Automático", ...values,
      observacion: mode === "normal" ? "Ciclo automático normal." : `Escenario demo: ${scenario}.`, estado: "Normal",
      clienteId: DEMO_CLIENT, implementationId: IMPLEMENTATION_ID, profileId: PROFILE_ID,
      origen: "demo_generator", tipoRegistro: mode === "normal" ? "automatico_normal" : "demo_acelerada", modoSimulacion: mode,
      sessionId, visibleOperacional: true, factorAceleracion: mode === "acelerado" ? factor : null,
      timestampProceso: processTime, logicalKey: `${DEMO_CLIENT}|${fecha}|${hora}|${subarea}|${mode === "normal" ? "automatico_normal" : "demo_acelerada"}` };
  });
}
