import { clientConfig } from "./clientConfig.js";
import { getReferenceTimestamp } from "./dateTime.js?v=20260712-3";

export const KPI_WINDOW_HOURS = 24;

export function calculateOperationalKpis(records, { windowHours = KPI_WINDOW_HOURS, referenceTimestamp = getReferenceTimestamp(records), audit = false } = {}) {
  const variablePair = resolveCopperVariables(clientConfig.variables);
  const pileNames = clientConfig.equipment.filter((item) => item.tipo === "pila").map((item) => item.nombre);
  const copperIntegration = variablePair
    ? integrateCopperByPile(records, pileNames, variablePair.flowKey, variablePair.concentrationKey, { windowHours, now: referenceTimestamp })
    : { total: null, intervals: [], subtotals: {} };
  const acidPair = resolveRefiningAcidVariables(clientConfig.variables);
  const refiningAreas = clientConfig.equipment
    .filter((item) => item.variablePrincipal === acidPair?.flowKey || /refino/i.test(`${item.id || ""} ${item.nombre || ""}`))
    .map((item) => item.nombre);
  const acidIntegration = acidPair
    ? integrateMassByArea(records, refiningAreas, acidPair.flowKey, acidPair.concentrationKey, { windowHours, now: referenceTimestamp })
    : { total: null, intervals: [], subtotals: {} };
  const copperToSx = copperIntegration.total;
  const acidUsedTonnes = acidIntegration.total;
  const specificAcidConsumption = Number.isFinite(copperToSx) && copperToSx > 0 && Number.isFinite(acidUsedTonnes)
    ? acidUsedTonnes * 1000 / copperToSx : null;
  const auditData = { copper: copperIntegration, acid: acidIntegration };
  const result = { copperToSx, acidUsedTonnes, specificAcidConsumption, recovery: 72, metallurgicalBalance: null, audit: auditData };
  if (audit) printKpiAudit(auditData, result);
  return result;
}

export function resolveCopperVariables(variables) {
  const concentration = (variables || []).find((variable) => variable.agregacion === "promedioPonderado" && variable.ponderador);
  const flow = concentration && variables.find((variable) => variable.key === concentration.ponderador);
  return flow ? { flowKey: flow.key, concentrationKey: concentration.key } : null;
}

export function resolveRefiningAcidVariables(variables) {
  const refiningVariables = (variables || []).filter((variable) => /refino/i.test(`${variable.grupo || ""} ${variable.nombre || ""} ${variable.key || ""}`));
  const flow = refiningVariables.find((variable) => variable.unidad === "m3/h" || /flujo/i.test(variable.nombre || ""));
  const concentration = refiningVariables.find((variable) => variable.unidad === "g/L" && /acid|ácid/i.test(`${variable.nombre || ""} ${variable.key || ""}`));
  return flow && concentration ? { flowKey: flow.key, concentrationKey: concentration.key } : null;
}

export function integrateCopperByPile(records, pileNames, flowKey, concentrationKey, { windowHours = KPI_WINDOW_HOURS, now = Date.now() } = {}) {
  return integrateMassByArea(records, pileNames, flowKey, concentrationKey, { windowHours, now });
}

export function integrateMassByArea(records, areaNames, flowKey, concentrationKey, { windowHours = KPI_WINDOW_HOURS, now = Date.now() } = {}) {
  const windowStart = now - windowHours * 3600000;
  const intervals = [];
  const subtotals = {};

  areaNames.forEach((area) => {
    const areaRecords = (records || []).filter((record) =>
      record.clienteId === clientConfig.clienteId && record.subarea === area
      && Number.isFinite(record.timestampCreacion) && record.timestampCreacion >= windowStart && record.timestampCreacion <= now
      && Number.isFinite(record[flowKey]) && record[flowKey] >= 0
      && Number.isFinite(record[concentrationKey]) && record[concentrationKey] >= 0
    ).sort((left, right) => left.timestampCreacion - right.timestampCreacion);

    let subtotal = 0;
    if (areaRecords.length >= 2) {
      areaRecords.forEach((record, index) => {
        const end = index + 1 < areaRecords.length ? areaRecords[index + 1].timestampCreacion : now;
        const durationHours = Math.max(0, (end - record.timestampCreacion) / 3600000);
        if (!durationHours) return;
        const instantaneous = record[flowKey] * record[concentrationKey] / 1000;
        const tonnes = instantaneous * durationHours;
        subtotal += tonnes;
        intervals.push({ area, start: record.timestampCreacion, end, durationHours, flow: record[flowKey], concentration: record[concentrationKey], instantaneous, tonnes });
      });
    }
    subtotals[area] = subtotal;
  });

  const total = areaNames.length && Object.values(subtotals).some((value) => value > 0)
    ? Object.values(subtotals).reduce((sum, value) => sum + value, 0) : null;
  return { total, intervals, subtotals, windowStart, windowEnd: now };
}

export function printKpiAudit(auditData, result) {
  const integration = auditData.copper;
  console.groupCollapsed("[PlantView KPI] Auditoría Cobre a SX — últimas 24 h");
  console.table(integration.intervals.map((item) => ({
    Pila: item.area, "Hora inicial": new Date(item.start).toLocaleString("es-CL"),
    "Hora final": new Date(item.end).toLocaleString("es-CL"), "Δt (h)": item.durationHours,
    "Flujo (m3/h)": item.flow, "Cu2+ (g/L)": item.concentration,
    "Producción instantánea (t/h)": item.instantaneous, "Toneladas intervalo": item.tonnes
  })));
  console.table(Object.entries(integration.subtotals).map(([pile, subtotal]) => ({ Pila: pile, "Subtotal (t)": subtotal })));
  console.info("Total Planta (t):", integration.total, "Resultado mostrado:", result.copperToSx);
  console.groupEnd();
  console.groupCollapsed("[PlantView KPI] Auditoría Ácido de Refino — últimas 24 h");
  console.table(auditData.acid.intervals.map((item) => ({
    Área: item.area, "Hora inicial": new Date(item.start).toLocaleString("es-CL"),
    "Hora final": new Date(item.end).toLocaleString("es-CL"), "Δt (h)": item.durationHours,
    "Flujo Refino (m3/h)": item.flow, "Acidez Refino (g/L)": item.concentration,
    "Ácido instantáneo (t/h)": item.instantaneous, "Ácido intervalo (t)": item.tonnes
  })));
  console.info("Ácido total (t):", result.acidUsedTonnes, "Consumo específico (kg/t Cu):", result.specificAcidConsumption);
  console.groupEnd();
}

export function compliancePercent(value, target, comparison) {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0 || value < 0) return null;
  if (comparison === "lower") return value === 0 ? 100 : (target / value) * 100;
  return (value / target) * 100;
}

export function evaluarEstadoKpi(valorActual, configuracion = {}) {
  if (valorActual === null || valorActual === undefined || !Number.isFinite(Number(valorActual))) {
    return { estado: "no-data", state: "no-data", desviacionPorcentual: null, mensaje: "Sin datos" };
  }
  const value = Number(valorActual);
  const mode = configuracion.alarmMode;
  if (mode === "operating_range") {
    const limits = ["criticalMin", "warningMin", "normalMin", "normalMax", "warningMax", "criticalMax"].map((key) => Number(configuracion[key]));
    if (!limits.every(Number.isFinite) || !(limits[0] < limits[1] && limits[1] < limits[2] && limits[2] < limits[3] && limits[3] < limits[4] && limits[4] < limits[5])) {
      return { estado: "invalid-config", state: "invalid-config", desviacionPorcentual: null, mensaje: "Configuración inválida" };
    }
    const [criticalMin, warningMin, normalMin, normalMax, warningMax, criticalMax] = limits;
    const estado = value <= criticalMin || value >= criticalMax ? "critical" : value <= warningMin || value >= warningMax ? "warning" : "normal";
    const mensaje = estado === "critical" ? "Valor fuera de límites críticos" : estado === "warning" ? "Valor fuera del rango aceptable" : "Dentro del rango aceptable";
    return { estado, state: estado, desviacionPorcentual: null, mensaje };
  }
  if (!["target_range", "higher_is_better", "lower_is_better"].includes(mode)) {
    return { estado: "invalid-config", state: "invalid-config", desviacionPorcentual: null, mensaje: "Configuración inválida" };
  }
  const target = Number(configuracion.target);
  const warning = Number(configuracion.warningDeviationPercent);
  const critical = Number(configuracion.criticalDeviationPercent);
  if (!Number.isFinite(target) || target === 0 || !Number.isFinite(warning) || warning <= 0 || !Number.isFinite(critical) || critical <= warning) {
    return { estado: "invalid-config", state: "invalid-config", desviacionPorcentual: null, mensaje: "Configuración inválida" };
  }
  const signedDifference = value - target;
  const deviation = mode === "higher_is_better" ? Math.max(0, -signedDifference) / Math.abs(target) * 100
    : mode === "lower_is_better" ? Math.max(0, signedDifference) / Math.abs(target) * 100
      : Math.abs(signedDifference) / Math.abs(target) * 100;
  const tolerance = 1e-9;
  const estado = deviation + tolerance >= critical ? "critical" : deviation + tolerance >= warning ? "warning" : "normal";
  const direction = signedDifference > 0 ? "sobre-objetivo" : signedDifference < 0 ? "bajo-objetivo" : "objetivo";
  let mensaje = "Dentro del rango aceptable";
  if (!signedDifference) mensaje = "Objetivo alcanzado";
  else if (mode === "higher_is_better" && signedDifference > 0) mensaje = "Sobre el objetivo";
  else if (mode === "lower_is_better" && signedDifference < 0) mensaje = "Bajo el objetivo";
  else if (estado === "critical") mensaje = signedDifference < 0 ? "Valor críticamente bajo" : "Valor críticamente alto";
  else if (estado !== "normal") mensaje = `${deviation.toLocaleString("es-CL", { maximumFractionDigits: 1 })} % ${signedDifference < 0 ? "bajo" : "sobre"} el objetivo`;
  const factor = warning / 100, criticalFactor = critical / 100;
  return { estado, state: estado, desviacionPorcentual: deviation, deviationPercent: deviation, direccion: direction, mensaje,
    limiteAlerta: mode === "lower_is_better" ? target * (1 + factor) : target * (1 - factor),
    limiteCritico: mode === "lower_is_better" ? target * (1 + criticalFactor) : target * (1 - criticalFactor) };
}

export const evaluateKpiStatus = evaluarEstadoKpi;
