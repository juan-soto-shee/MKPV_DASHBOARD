import { clientConfig } from "./clientConfig.js";
import { getReferenceTimestamp } from "./dateTime.js?v=20260712-3";

export const KPI_WINDOW_HOURS = 24;

// Valor temporal: reemplazar cuando el consumo diario provenga del área de ácido.
export function getDailyAcidConsumption() { return 324; }

export function calculateOperationalKpis(records, { windowHours = KPI_WINDOW_HOURS, referenceTimestamp = getReferenceTimestamp(records), audit = false } = {}) {
  const variablePair = resolveCopperVariables(clientConfig.variables);
  const pileNames = clientConfig.equipment.filter((item) => item.tipo === "pila").map((item) => item.nombre);
  const integration = variablePair
    ? integrateCopperByPile(records, pileNames, variablePair.flowKey, variablePair.concentrationKey, { windowHours, now: referenceTimestamp })
    : { total: null, intervals: [], subtotals: {} };
  const copperToSx = integration.total;
  const specificAcidConsumption = Number.isFinite(copperToSx) && copperToSx > 0
    ? getDailyAcidConsumption() / copperToSx : null;
  const result = { copperToSx, specificAcidConsumption, recovery: 72, metallurgicalBalance: null, audit: integration };
  if (audit) printKpiAudit(integration, result);
  return result;
}

export function resolveCopperVariables(variables) {
  const concentration = (variables || []).find((variable) => variable.agregacion === "promedioPonderado" && variable.ponderador);
  const flow = concentration && variables.find((variable) => variable.key === concentration.ponderador);
  return flow ? { flowKey: flow.key, concentrationKey: concentration.key } : null;
}

export function integrateCopperByPile(records, pileNames, flowKey, concentrationKey, { windowHours = KPI_WINDOW_HOURS, now = Date.now() } = {}) {
  const windowStart = now - windowHours * 3600000;
  const intervals = [];
  const subtotals = {};

  pileNames.forEach((pile) => {
    const pileRecords = (records || []).filter((record) =>
      record.clienteId === clientConfig.clienteId && record.subarea === pile
      && Number.isFinite(record.timestampCreacion) && record.timestampCreacion >= windowStart && record.timestampCreacion <= now
      && Number.isFinite(record[flowKey]) && record[flowKey] >= 0
      && Number.isFinite(record[concentrationKey]) && record[concentrationKey] >= 0
    ).sort((left, right) => left.timestampCreacion - right.timestampCreacion);

    let subtotal = 0;
    if (pileRecords.length >= 2) {
      pileRecords.forEach((record, index) => {
        const end = index + 1 < pileRecords.length ? pileRecords[index + 1].timestampCreacion : now;
        const durationHours = Math.max(0, (end - record.timestampCreacion) / 3600000);
        if (!durationHours) return;
        const instantaneous = record[flowKey] * record[concentrationKey] / 1000;
        const tonnes = instantaneous * durationHours;
        subtotal += tonnes;
        intervals.push({ pile, start: record.timestampCreacion, end, durationHours, flow: record[flowKey], concentration: record[concentrationKey], instantaneous, tonnes });
      });
    }
    subtotals[pile] = subtotal;
  });

  const total = pileNames.length && Object.values(subtotals).some((value) => value > 0)
    ? Object.values(subtotals).reduce((sum, value) => sum + value, 0) : null;
  return { total, intervals, subtotals, windowStart, windowEnd: now };
}

export function printKpiAudit(integration, result) {
  console.groupCollapsed("[PlantView KPI] Auditoría Cobre a SX — últimas 24 h");
  console.table(integration.intervals.map((item) => ({
    Pila: item.pile, "Hora inicial": new Date(item.start).toLocaleString("es-CL"),
    "Hora final": new Date(item.end).toLocaleString("es-CL"), "Δt (h)": item.durationHours,
    "Flujo (m3/h)": item.flow, "Cu2+ (g/L)": item.concentration,
    "Producción instantánea (t/h)": item.instantaneous, "Toneladas intervalo": item.tonnes
  })));
  console.table(Object.entries(integration.subtotals).map(([pile, subtotal]) => ({ Pila: pile, "Subtotal (t)": subtotal })));
  console.info("Total Planta (t):", integration.total, "Resultado mostrado:", result.copperToSx);
  console.groupEnd();
}

export function compliancePercent(value, target, comparison) {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0 || value < 0) return null;
  if (comparison === "lower") return value === 0 ? 100 : (target / value) * 100;
  return (value / target) * 100;
}

export function evaluateKpiStatus(value, objective) {
  const target = Number(objective?.target);
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) return "no-data";
  if (objective.mode === "range") {
    const deviation = Math.abs((value - target) / target) * 100;
    if (deviation > Number(objective.criticalDeviationPercent ?? 20)) return "critical";
    if (deviation > Number(objective.alertDeviationPercent ?? 10)) return "warning";
    return "normal";
  }
  const achievement = objective.comparison === "lower" ? (value === 0 ? 100 : (target / value) * 100) : (value / target) * 100;
  if (achievement < Number(objective.criticalBelowPercent ?? 90)) return "critical";
  if (achievement < Number(objective.alertBelowPercent ?? 100)) return "warning";
  return "normal";
}
