import { clientConfig } from "./clientConfig.js";
import { buildPlantRecords } from "./processMap.js?v=20260709-7";

export const KPI_WINDOW_HOURS = 24;

// Valor temporal: reemplazar esta función cuando el consumo diario provenga del área de ácido.
export function getDailyAcidConsumption() {
  return 324;
}

export function calculateOperationalKpis(records, { windowHours = KPI_WINDOW_HOURS } = {}) {
  const activeClientRecords = (records || []).filter((record) =>
    record.clienteId === clientConfig.clienteId && Number.isFinite(record.timestampCreacion)
  );
  const variablePair = resolveCopperVariables(clientConfig.variables);
  const plantRecords = variablePair ? buildPlantRecords(activeClientRecords) : [];
  const dissolvedCopper = variablePair
    ? calculateTimeWeightedCopper(plantRecords, variablePair.flowKey, variablePair.concentrationKey, windowHours)
    : null;
  const dailyAcid = getDailyAcidConsumption();
  const specificAcidConsumption = Number.isFinite(dissolvedCopper) && dissolvedCopper > 0
    ? dailyAcid / dissolvedCopper
    : null;

  return { dissolvedCopper, specificAcidConsumption, recovery: 72, metallurgicalBalance: null };
}

export function resolveCopperVariables(variables) {
  const concentration = (variables || []).find((variable) =>
    variable.agregacion === "promedioPonderado" && variable.ponderador
  );
  if (!concentration) return null;
  const flow = variables.find((variable) => variable.key === concentration.ponderador);
  return flow ? { flowKey: flow.key, concentrationKey: concentration.key } : null;
}

export function calculateTimeWeightedCopper(records, flowKey, concentrationKey, windowHours = KPI_WINDOW_HOURS) {
  const valid = (records || []).filter((record) =>
    Number.isFinite(record.timestampCreacion)
    && Number.isFinite(record[flowKey]) && record[flowKey] >= 0
    && Number.isFinite(record[concentrationKey]) && record[concentrationKey] >= 0
  ).sort((left, right) => left.timestampCreacion - right.timestampCreacion);
  if (!valid.length) return null;

  const latest = valid[valid.length - 1].timestampCreacion;
  const windowStart = latest - windowHours * 60 * 60 * 1000;
  const windowRecords = valid.filter((record) => record.timestampCreacion >= windowStart && record.timestampCreacion <= latest);
  if (!windowRecords.length) return null;
  if (windowRecords.length === 1) return instantaneousCopper(windowRecords[0], flowKey, concentrationKey) * 24;

  let weightedProduction = 0;
  let coveredHours = 0;
  for (let index = 0; index < windowRecords.length - 1; index += 1) {
    const current = windowRecords[index];
    const next = windowRecords[index + 1];
    const durationHours = (next.timestampCreacion - current.timestampCreacion) / 3600000;
    if (durationHours <= 0) continue;
    weightedProduction += instantaneousCopper(current, flowKey, concentrationKey) * durationHours;
    coveredHours += durationHours;
  }
  return coveredHours > 0 ? (weightedProduction / coveredHours) * 24 : null;
}

function instantaneousCopper(record, flowKey, concentrationKey) {
  return record[flowKey] * record[concentrationKey] / 1000;
}
