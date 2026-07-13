const MIN_POINTS_FOR_VARIABILITY = 3;
const MIN_POINTS_FOR_TREND = 4;

export function analyzeOperationalPeriod(records, variables, alarmConfig = {}, options = {}) {
  const metricRecords = Array.isArray(records) ? records : [];
  const eventRecords = Array.isArray(options.eventRecords) ? options.eventRecords : metricRecords;
  const configuredVariables = (variables || []).filter((variable) => variable?.key && variable.tipo !== "estado");
  const findings = configuredVariables
    .map((variable) => analyzeVariable(metricRecords, variable, alarmConfig, options.area))
    .filter(Boolean);
  const coverage = calculateCoverage(metricRecords, options);
  const events = detectEvents(eventRecords, findings, coverage);
  const severity = classifyGeneralState(findings, events);

  return {
    state: severity,
    stateLabel: {
      stable: "Operación estable",
      moderate: "Variabilidad moderada",
      unstable: "Operación inestable"
    }[severity],
    trends: findings.slice(0, 8).map(buildTrendConclusion),
    evidence: findings.map(buildEvidence),
    events: buildEventConclusions(events),
    coverage,
    hasData: metricRecords.length > 0 && findings.length > 0
  };
}

function analyzeVariable(records, variable, alarmConfig, area) {
  const points = records
    .map((record) => ({ time: Number(record.timestampCreacion), value: Number(record[variable.key]) }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
    .sort((left, right) => left.time - right.time);
  if (!points.length) return null;

  const values = points.map((point) => point.value);
  const mean = average(values);
  const standardDeviation = populationStandardDeviation(values, mean);
  const coefficientOfVariation = Math.abs(mean) > Number.EPSILON
    ? standardDeviation / Math.abs(mean) * 100
    : standardDeviation > 0 ? Infinity : 0;
  const trend = calculateTrend(points, mean);
  const abruptChanges = countAbruptChanges(values);
  const operatingRange = resolveOperatingRange(variable.key, alarmConfig, area);
  const withinRangeCount = operatingRange
    ? values.filter((value) => value >= operatingRange.low && value <= operatingRange.high).length
    : null;
  const withinRangeShare = withinRangeCount === null ? null : withinRangeCount / values.length;
  const severity = classifyVariable({
    pointCount: points.length,
    coefficientOfVariation,
    trend,
    abruptChanges,
    withinRangeShare
  });

  return {
    variable,
    points,
    values,
    mean,
    standardDeviation,
    coefficientOfVariation,
    trend,
    abruptChanges,
    operatingRange,
    withinRangeShare,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    severity
  };
}

function classifyVariable(metrics) {
  const enoughForVariability = metrics.pointCount >= MIN_POINTS_FOR_VARIABILITY;
  const abruptRate = metrics.pointCount > 1 ? metrics.abruptChanges / (metrics.pointCount - 1) : 0;
  if ((metrics.withinRangeShare !== null && metrics.withinRangeShare < 0.8)
    || (enoughForVariability && metrics.coefficientOfVariation >= 12)
    || Math.abs(metrics.trend.relativeChange) >= 15
    || abruptRate >= 0.15) return "unstable";
  if ((metrics.withinRangeShare !== null && metrics.withinRangeShare < 0.95)
    || (enoughForVariability && metrics.coefficientOfVariation >= 5)
    || Math.abs(metrics.trend.relativeChange) >= 5
    || metrics.abruptChanges > 0) return "moderate";
  return "stable";
}

function classifyGeneralState(findings, events) {
  if (!findings.length) return "stable";
  if (events.criticalAlarmCount > 0 || events.stopCount > 0
    || findings.some((finding) => finding.severity === "unstable")) return "unstable";
  const moderateCount = findings.filter((finding) => finding.severity === "moderate").length;
  return moderateCount > 0 || events.preventiveAlarmCount > 0 || events.coverage.percentage < 90
    ? "moderate"
    : "stable";
}

function buildTrendConclusion(finding) {
  const name = operationalDescriptor(finding.variable.nombre || finding.variable.key);
  if (finding.severity === "unstable") {
    return { text: `${name} presentó un comportamiento inestable durante el período.`, tone: "critical" };
  }
  if (finding.severity === "moderate") {
    return { text: `${name} presentó fluctuaciones moderadas.`, tone: "warning" };
  }
  const descriptor = finding.operatingRange ? "permaneció controlada" : "se mantuvo estable";
  return { text: `${name} ${descriptor} durante el período.`, tone: "positive" };
}

function buildEvidence(finding) {
  const variable = finding.variable;
  const decimals = Number.isInteger(variable.decimales) ? variable.decimales : 2;
  const unit = variable.unidad || "";
  const evidence = [
    `Promedio: ${formatNumber(finding.mean, decimals)}${unit ? ` ${unit}` : ""}`,
    `CV: ${formatNumber(finding.coefficientOfVariation, 1)} %`
  ];

  if (finding.operatingRange && finding.withinRangeShare !== null) {
    evidence.push(`${formatNumber(finding.withinRangeShare * 100, 0)} % del tiempo dentro del rango operacional`);
  } else if (isLevelVariable(variable)) {
    evidence.push(`Rango observado: ${formatNumber(finding.minimum, decimals)}–${formatNumber(finding.maximum, decimals)}${unit ? ` ${unit}` : ""}`);
  }

  if (finding.abruptChanges > 0) {
    evidence.push(`${finding.abruptChanges} ${finding.abruptChanges === 1 ? "cambio brusco detectado" : "cambios bruscos detectados"}`);
  } else if (finding.trend.direction === "stable") {
    evidence.push("Sin tendencia significativa");
  } else {
    evidence.push(`Tendencia ${finding.trend.direction === "up" ? "creciente" : "decreciente"}`);
  }

  return {
    key: variable.key,
    variable: variable.nombre || variable.key,
    diagnosis: diagnosisLabel(finding),
    severity: finding.severity,
    evidence
  };
}

function diagnosisLabel(finding) {
  if (finding.severity === "unstable") return "Inestable";
  if (finding.severity === "moderate") return "Variabilidad moderada";
  return finding.operatingRange ? "Controlada" : "Estable";
}

function detectEvents(records, findings, coverage) {
  const alarms = extractUniqueAlarms(records);
  const criticalAlarms = alarms.filter((alarm) => alarm.severity === "critical");
  const preventiveAlarms = alarms.filter((alarm) => alarm.severity === "warning");
  const flowFindings = findings.filter(({ variable }) => isFlowVariable(variable));
  const stopCount = flowFindings.reduce((total, finding) => total + countOperationalStops(finding.values), 0);

  return {
    abruptFindings: findings.filter((finding) => finding.abruptChanges > 0),
    criticalAlarmCount: criticalAlarms.length,
    preventiveAlarmCount: preventiveAlarms.length,
    preventiveAlarmVariables: countByVariable(preventiveAlarms),
    stopCount,
    canAssessStops: flowFindings.some((finding) => finding.values.length >= 2),
    coverage
  };
}

function buildEventConclusions(events) {
  const conclusions = [];
  events.abruptFindings.forEach((finding) => {
    conclusions.push({
      text: `${finding.abruptChanges} ${finding.abruptChanges === 1 ? "cambio brusco detectado" : "cambios bruscos detectados"} en ${finding.variable.nombre || finding.variable.key}.`,
      tone: finding.severity === "unstable" ? "critical" : "warning"
    });
  });
  Object.entries(events.preventiveAlarmVariables).forEach(([variable, count]) => {
    conclusions.push({
      text: `${count} ${count === 1 ? "alarma preventiva" : "alarmas preventivas"} por ${variable}.`,
      tone: "warning"
    });
  });
  conclusions.push(events.criticalAlarmCount > 0
    ? { text: `${events.criticalAlarmCount} ${events.criticalAlarmCount === 1 ? "alarma crítica registrada" : "alarmas críticas registradas"}.`, tone: "critical" }
    : { text: "No se registraron alarmas críticas.", tone: "positive" });
  if (events.canAssessStops) {
    conclusions.push(events.stopCount > 0
      ? { text: `${events.stopCount} ${events.stopCount === 1 ? "detención operacional detectada" : "detenciones operacionales detectadas"}.`, tone: "critical" }
      : { text: "Sin detenciones operacionales.", tone: "positive" });
  }
  conclusions.push({
    text: `Cobertura de datos: ${formatNumber(events.coverage.percentage, 0)} %.`,
    tone: events.coverage.percentage >= 90 ? "positive" : "warning"
  });
  return conclusions;
}

function extractUniqueAlarms(records) {
  const seen = new Set();
  const alarms = [];
  records.forEach((record) => {
    const recordAlarms = Array.isArray(record.alarmasActivas) ? record.alarmasActivas : [];
    recordAlarms.forEach((alarm, index) => {
      const rawSeverity = normalizeText(alarm.severidad || alarm.estado || record.estado);
      const severity = rawSeverity.includes("critic") ? "critical"
        : rawSeverity.includes("alert") || rawSeverity.includes("advert") || rawSeverity.includes("prevent") ? "warning" : "normal";
      if (severity === "normal") return;
      const variable = alarm.variable || alarm.nombre || "Variable del proceso";
      const key = alarm.id || `${record.id || record.timestampCreacion}:${variable}:${severity}:${index}`;
      if (seen.has(key)) return;
      seen.add(key);
      alarms.push({ variable, severity });
    });
  });
  return alarms;
}

function countByVariable(alarms) {
  return alarms.reduce((counts, alarm) => {
    counts[alarm.variable] = (counts[alarm.variable] || 0) + 1;
    return counts;
  }, {});
}

function resolveOperatingRange(variableKey, alarmConfig, area) {
  const definitions = Object.entries(alarmConfig || {})
    .filter(([key, definition]) => (key === variableKey || definition?.variable === variableKey)
      && (!definition?.equipo || !area || definition.equipo === area));
  const definition = definitions.find(([, item]) => item?.equipo === area)?.[1]
    || definitions.find(([key, item]) => key === variableKey && !item?.equipo)?.[1]
    || definitions.find(([, item]) => !item?.equipo)?.[1]
    || definitions[0]?.[1];
  if (!definition) return null;
  const low = Number(definition.bajoAlerta);
  const high = Number(definition.altoAlerta);
  return Number.isFinite(low) && Number.isFinite(high) ? { low, high } : null;
}

function calculateTrend(points, mean) {
  if (points.length < MIN_POINTS_FOR_TREND) return { direction: "stable", relativeChange: 0 };
  const firstTime = points[0].time;
  const x = points.map((point) => (point.time - firstTime) / 3600000);
  const xMean = average(x);
  const denominator = x.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
  if (denominator <= Number.EPSILON) return { direction: "stable", relativeChange: 0 };
  const slope = points.reduce((sum, point, index) => sum + (x[index] - xMean) * (point.value - mean), 0) / denominator;
  const duration = x[x.length - 1] - x[0];
  const relativeChange = Math.abs(mean) > Number.EPSILON ? slope * duration / Math.abs(mean) * 100 : 0;
  return {
    direction: Math.abs(relativeChange) < 5 ? "stable" : relativeChange > 0 ? "up" : "down",
    relativeChange
  };
}

function countAbruptChanges(values) {
  if (values.length < 4) return 0;
  const changes = values.slice(1).map((value, index) => Math.abs(value - values[index]));
  const typicalChange = median(changes);
  const center = Math.abs(median(values));
  const threshold = Math.max(typicalChange * 4, center * 0.1, Number.EPSILON);
  return changes.filter((change) => change > threshold).length;
}

function countOperationalStops(values) {
  if (values.length < 2) return 0;
  const typicalValue = median(values.filter((value) => value > 0));
  if (!Number.isFinite(typicalValue) || typicalValue <= 0) return 0;
  let stops = 0;
  let stopped = false;
  values.forEach((value) => {
    const isStopped = value <= typicalValue * 0.03;
    if (isStopped && !stopped) stops += 1;
    stopped = isStopped;
  });
  return stops;
}

function calculateCoverage(records, options) {
  const times = [...new Set(records.map((record) => Number(record.timestampCreacion)).filter(Number.isFinite))]
    .sort((left, right) => left - right);
  if (!times.length) return { percentage: 0, expectedPoints: 0, observedPoints: 0 };
  if (times.length === 1) return { percentage: 100, expectedPoints: 1, observedPoints: 1 };
  const intervals = times.slice(1).map((time, index) => time - times[index]).filter((interval) => interval > 0);
  const expectedInterval = median(intervals);
  const configuredStart = Number(options.periodStart);
  const configuredEnd = Number(options.periodEnd);
  const start = Number.isFinite(configuredStart) ? configuredStart : times[0];
  const end = Number.isFinite(configuredEnd) ? configuredEnd : times[times.length - 1];
  const expectedPoints = Math.max(1, Math.round((end - start) / expectedInterval) + 1);
  return {
    percentage: Math.min(100, times.length / expectedPoints * 100),
    expectedPoints,
    observedPoints: times.length
  };
}

function isFlowVariable(variable) {
  const text = normalizeText(`${variable.nombre || ""} ${variable.unidad || ""}`);
  return text.includes("flujo") || text.includes("caudal") || text.includes("m3h");
}

function isLevelVariable(variable) {
  return normalizeText(`${variable.nombre || ""} ${variable.unidad || ""}`).includes("nivel");
}

function operationalDescriptor(name) {
  return String(name || "La variable").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
}

function populationStandardDeviation(values, mean = average(values)) {
  return values.length ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) : NaN;
}

function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatNumber(value, decimals) {
  return Number.isFinite(value) ? value.toLocaleString("es-CL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }) : "—";
}
