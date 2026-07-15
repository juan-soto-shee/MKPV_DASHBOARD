import { filterRecordsByPeriod, getReferenceTimestamp } from "./dateTime.js";

export const MIN_MODEL_RECORDS = 4;

export function prepareModelRecords(records, {
  clienteId,
  implementationId,
  periodHours = 168,
  area = "PLANTA",
  variables = []
} = {}) {
  const normalized = (records || []).map((record) => normalizeRecord(record, variables))
    .filter((record) => record
      && (!clienteId || record.clienteId === clienteId)
      && (!implementationId || !record.implementationId || record.implementationId === implementationId));
  const periodRecords = filterRecordsByPeriod(normalized, periodHours);
  const selected = area === "PLANTA"
    ? periodRecords
    : periodRecords.filter((record) => normalizeText(record.subarea || record.area) === normalizeText(area));
  return selected.sort((left, right) => left.timestampCreacion - right.timestampCreacion);
}

export function runPrediction(records, {
  field,
  horizonHours,
  minimumRecords = MIN_MODEL_RECORDS
}) {
  const samples = records.map((record) => ({
    timestamp: Number(record.timestampCreacion),
    value: record[field]
  })).filter((sample) => Number.isFinite(sample.timestamp) && Number.isFinite(sample.value));

  if (samples.length < minimumRecords) {
    return { available: false, field, sampleCount: samples.length, minimumRecords };
  }

  const origin = samples[0].timestamp;
  const points = samples.map((sample) => ({ x: (sample.timestamp - origin) / 3600000, y: sample.value }));
  const regression = linearRegression(points);
  const latest = samples.at(-1);
  const latestX = (latest.timestamp - origin) / 3600000;
  const predicted = regression.intercept + regression.slope * (latestX + horizonHours);
  const fitted = points.map((point) => regression.intercept + regression.slope * point.x);
  const mae = points.reduce((total, point, index) => total + Math.abs(point.y - fitted[index]), 0) / points.length;

  return {
    available: true,
    field,
    sampleCount: samples.length,
    minimumRecords,
    current: latest.value,
    predicted,
    latestTimestamp: latest.timestamp,
    horizonHours,
    slopePerHour: regression.slope,
    confidence: Math.max(0, Math.min(100, regression.r2 * 100)),
    mae,
    actualSeries: samples.slice(-24).map((sample) => sample.value),
    predictedSeries: fitted.slice(-24),
    labels: samples.slice(-24).map((sample) => formatLabel(sample.timestamp))
  };
}

export function getModelReferenceTimestamp(records) {
  return getReferenceTimestamp(records);
}

function normalizeRecord(record, variables) {
  const timestampCreacion = Number(record?.timestampCreacion);
  if (!Number.isFinite(timestampCreacion)) return null;
  const normalized = { ...record, timestampCreacion };
  variables.forEach((variable) => {
    const keys = [variable.key, ...(variable.aliases || [])];
    const key = keys.find((candidate) => Object.hasOwn(record, candidate));
    const nestedKey = keys.find((candidate) => Object.hasOwn(record.variables || {}, candidate));
    normalized[variable.key] = numeric(key ? record[key] : nestedKey ? record.variables[nestedKey] : null);
  });
  normalized.recovery = firstNumeric(record, ["recovery", "recuperacion", "recuperación"]);
  return normalized;
}

function linearRegression(points) {
  const xMean = average(points.map((point) => point.x));
  const yMean = average(points.map((point) => point.y));
  const denominator = points.reduce((total, point) => total + (point.x - xMean) ** 2, 0);
  const slope = denominator ? points.reduce((total, point) => total + (point.x - xMean) * (point.y - yMean), 0) / denominator : 0;
  const intercept = yMean - slope * xMean;
  const residual = points.reduce((total, point) => total + (point.y - (intercept + slope * point.x)) ** 2, 0);
  const total = points.reduce((sum, point) => sum + (point.y - yMean) ** 2, 0);
  return { slope, intercept, r2: total ? 1 - residual / total : 1 };
}

function firstNumeric(record, keys) {
  for (const key of keys) {
    const value = numeric(record?.[key] ?? record?.variables?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function numeric(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values) { return values.reduce((total, value) => total + value, 0) / values.length; }
function normalizeText(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase(); }
function formatLabel(timestamp) { return new Date(timestamp).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
