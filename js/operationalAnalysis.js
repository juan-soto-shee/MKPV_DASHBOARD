const SEVERITY = { stable: 0, moderate: 1, unstable: 2 };

export function analyzeOperationalPeriod(records, variables, alarmConfig = {}) {
  const configuredVariables = variables.filter((variable) => variable?.key && variable.tipo !== "estado");
  const findings = configuredVariables
    .map((variable) => analyzeVariable(records, variable, alarmConfig))
    .filter(Boolean);
  const events = detectEvents(records, findings);
  const severity = findings.reduce((worst, finding) =>
    SEVERITY[finding.severity] > SEVERITY[worst] ? finding.severity : worst
  , events.hasCriticalAlarms ? "unstable" : events.hasAbruptChanges ? "moderate" : "stable");

  return {
    state: severity,
    stateLabel: {
      stable: "Operación estable",
      moderate: "Variabilidad moderada",
      unstable: "Operación inestable"
    }[severity],
    trends: findings.slice(0, 8).map(({ conclusion, severity: findingSeverity }) => ({
      text: conclusion,
      tone: findingSeverity === "stable" ? "positive" : "warning"
    })),
    events: buildEventConclusions(events, records.length),
    hasData: records.length > 0 && findings.length > 0
  };
}

function analyzeVariable(records, variable, alarmConfig) {
  const points = records
    .map((record) => ({ time: Number(record.timestampCreacion), value: Number(record[variable.key]) }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
    .sort((left, right) => left.time - right.time);
  if (!points.length) return null;

  const values = points.map((point) => point.value);
  const center = median(values);
  const relativeSpread = Math.abs(center) > Number.EPSILON
    ? median(values.map((value) => Math.abs(value - center))) / Math.abs(center)
    : 0;
  const abruptChanges = countAbruptChanges(values);
  const outsideRange = values.filter((value) => isOutsideOperatingRange(value, variable.key, alarmConfig)).length;
  const outsideShare = outsideRange / values.length;
  const severity = outsideShare >= 0.2 || relativeSpread >= 0.2
    ? "unstable"
    : outsideShare > 0 || relativeSpread >= 0.08 || abruptChanges > 0
      ? "moderate"
      : "stable";
  const descriptor = operationalDescriptor(variable.nombre || variable.key);
  const conclusion = severity === "unstable"
    ? `${descriptor} presentó un comportamiento inestable durante el período.`
    : severity === "moderate"
      ? `${descriptor} presentó fluctuaciones moderadas.`
      : `${descriptor} se mantuvo estable durante el período.`;

  return { variable, severity, conclusion, abruptChanges, points };
}

function detectEvents(records, findings) {
  const alarms = records.flatMap((record) => Array.isArray(record.alarmasActivas) ? record.alarmasActivas : []);
  const criticalPattern = /critic|alarma/i;
  const flowFindings = findings.filter(({ variable }) => isFlowVariable(variable));

  return {
    hasCriticalAlarms: alarms.some((alarm) => criticalPattern.test(normalizeText(alarm.severidad || alarm.estado)))
      || records.some((record) => criticalPattern.test(normalizeText(record.estado))),
    hasAbruptChanges: findings.some((finding) => finding.abruptChanges > 0),
    canAssessChanges: findings.some((finding) => finding.points.length >= 4),
    hasStops: flowFindings.some(({ points }) => hasOperationalStop(points.map((point) => point.value))),
    canAssessStops: flowFindings.some(({ points }) => points.length >= 2),
    incompleteCoverage: hasIncompleteCoverage(records),
    variableFindings: findings.filter((finding) => finding.severity !== "stable")
  };
}

function buildEventConclusions(events, recordCount) {
  if (!recordCount) return [{ text: "No hay datos suficientes para detectar eventos en el período.", tone: "neutral" }];
  const conclusions = [];
  if (events.canAssessStops) {
    conclusions.push(events.hasStops
      ? { text: "Se detectaron detenciones operacionales.", tone: "critical" }
      : { text: "Sin detenciones operacionales detectadas.", tone: "positive" });
  }
  if (events.canAssessChanges) {
    conclusions.push(events.hasAbruptChanges
      ? { text: "Se detectaron cambios bruscos en variables del proceso.", tone: "warning" }
      : { text: "Sin cambios bruscos relevantes.", tone: "positive" });
  }
  if (events.hasCriticalAlarms) conclusions.push({ text: "Se registraron alarmas críticas durante el período.", tone: "critical" });
  conclusions.push(events.incompleteCoverage
    ? { text: "La cobertura de datos del período es incompleta.", tone: "warning" }
    : { text: "La cobertura de datos es consistente.", tone: "positive" });
  return conclusions;
}

function isOutsideOperatingRange(value, variableKey, alarmConfig) {
  const definitions = Object.entries(alarmConfig).filter(([key, definition]) =>
    key === variableKey || definition?.variable === variableKey
  );
  return definitions.some(([, definition]) =>
    (Number.isFinite(Number(definition.bajoAlerta)) && value < Number(definition.bajoAlerta))
    || (Number.isFinite(Number(definition.altoAlerta)) && value > Number(definition.altoAlerta))
  );
}

function countAbruptChanges(values) {
  if (values.length < 4) return 0;
  const changes = values.slice(1).map((value, index) => Math.abs(value - values[index]));
  const typicalChange = median(changes);
  const baseline = Math.max(typicalChange * 4, Math.abs(median(values)) * 0.15, Number.EPSILON);
  return changes.filter((change) => change > baseline).length;
}

function hasOperationalStop(values) {
  if (values.length < 2) return false;
  const typicalValue = median(values.filter((value) => value > 0));
  if (!Number.isFinite(typicalValue) || typicalValue <= 0) return false;
  return values.some((value) => value <= typicalValue * 0.03);
}

function hasIncompleteCoverage(records) {
  const times = [...new Set(records.map((record) => Number(record.timestampCreacion)).filter(Number.isFinite))]
    .sort((left, right) => left - right);
  if (times.length < 3) return true;
  const intervals = times.slice(1).map((time, index) => time - times[index]).filter((interval) => interval > 0);
  const expectedInterval = median(intervals);
  return intervals.some((interval) => interval > expectedInterval * 2.5);
}

function isFlowVariable(variable) {
  const text = normalizeText(`${variable.nombre || ""} ${variable.unidad || ""}`);
  return text.includes("flujo") || text.includes("caudal") || text.includes("m3h");
}

function operationalDescriptor(name) {
  return String(name || "La variable").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
