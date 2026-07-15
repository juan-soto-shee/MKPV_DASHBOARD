import { filterRecordsByPeriod, getReferenceTimestamp } from "./dateTime.js";

export const MODEL_MINIMUM_RECORDS = 50;
export const SUPPORTED_PERIODS = Object.freeze([24, 168, 720]);
export const MODEL_FEATURES = Object.freeze([
  "cuPls", "flujoPLS", "flujoRefino", "acidezRefino",
  "nivelPiscinaPLS", "nivelPiscinaRefino", "hora", "diaSemana",
  "subarea", "turno"
]);

const NUMERIC_FEATURES = MODEL_FEATURES.slice(0, 8);

export function parseModelingSelection(search = window.location.search) {
  const params = new URLSearchParams(search);
  const requestedPeriod = Number(params.get("period"));
  return Object.freeze({
    periodHours: SUPPORTED_PERIODS.includes(requestedPeriod) ? requestedPeriod : 168,
    unit: normalizeUnit(params.get("unit") || params.get("area") || "Planta")
  });
}

export function preparePredictiveData(records, {
  clienteId,
  implementationId,
  periodHours,
  unit,
  variables = []
}) {
  const received = Array.isArray(records) ? records.length : 0;
  const normalized = (records || [])
    .map((record) => normalizeRecord(record, variables))
    .filter(Boolean)
    .filter((record) => record.clienteId === clienteId)
    .filter((record) => record.implementationId === implementationId);
  const referenceTimestamp = getReferenceTimestamp(normalized);
  const inPeriod = filterRecordsByPeriod(normalized, periodHours);
  const inUnit = unit === "Planta"
    ? inPeriod
    : inPeriod.filter((record) => normalizeText(record.subarea || record.area) === normalizeText(unit));
  const validRecords = inUnit.filter(hasCompleteModelInput)
    .sort((left, right) => left.timestampCreacion - right.timestampCreacion);

  return Object.freeze({
    received,
    normalized: normalized.length,
    considered: inUnit.length,
    validRecords,
    validCount: validRecords.length,
    requiredCount: MODEL_MINIMUM_RECORDS,
    referenceTimestamp,
    latestTimestamp: getReferenceTimestamp(validRecords),
    sufficient: validRecords.length >= MODEL_MINIMUM_RECORDS,
    hasVariation: hasNumericVariation(validRecords)
  });
}

export function buildPredictionRequest(prepared, context) {
  return {
    modelId: "cu_pls_4h_preliminary",
    modelVersion: "0.1.0-preliminary",
    context: {
      implementationId: context.implementationId,
      clienteId: context.clienteId,
      profileId: context.profileId,
      unit: context.unit,
      periodHours: context.periodHours,
      referenceTimestamp: toIso(prepared.referenceTimestamp)
    },
    records: prepared.validRecords.map((record) => Object.fromEntries([
      ["timestampCreacion", toIso(record.timestampCreacion)],
      ...MODEL_FEATURES.map((feature) => [feature, record[feature]])
    ]))
  };
}

function normalizeRecord(record, variables) {
  const timestampCreacion = Number(record?.timestampCreacion);
  if (!Number.isFinite(timestampCreacion) || timestampCreacion > Date.now() + 60000) return null;
  const normalized = {
    ...record,
    timestampCreacion,
    clienteId: String(record?.clienteId || record?.clientId || ""),
    implementationId: String(record?.implementationId || ""),
    subarea: String(record?.subarea || record?.unidad || ""),
    turno: String(record?.turno || "")
  };
  variables.forEach((variable) => {
    const keys = [variable.key, ...(variable.aliases || [])];
    normalized[variable.key] = firstValue(record, keys);
  });
  NUMERIC_FEATURES.slice(0, 6).forEach((feature) => {
    normalized[feature] = numeric(normalized[feature] ?? firstValue(record, [feature]));
  });
  const date = new Date(timestampCreacion);
  normalized.hora = date.getUTCHours();
  normalized.diaSemana = (date.getUTCDay() + 6) % 7;
  return normalized;
}

function hasCompleteModelInput(record) {
  return NUMERIC_FEATURES.every((feature) => Number.isFinite(record[feature]))
    && Boolean(record.subarea.trim()) && Boolean(record.turno.trim());
}

function hasNumericVariation(records) {
  if (records.length < 2) return false;
  return NUMERIC_FEATURES.slice(0, 6).some((feature) => new Set(records.map((record) => record[feature])).size > 1);
}

function firstValue(record, keys) {
  for (const key of keys) {
    if (Object.hasOwn(record || {}, key)) return record[key];
    if (Object.hasOwn(record?.variables || {}, key)) return record.variables[key];
  }
  return null;
}

function numeric(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeUnit(value) {
  const normalized = normalizeText(value);
  if (normalized === "planta") return "Planta";
  const pile = normalized.match(/^pila\s*([123])$/);
  return pile ? `Pila ${pile[1]}` : "Planta";
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function toIso(timestamp) {
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
