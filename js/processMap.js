import { evaluateAlarmState } from "./alarmAdmin.js?v=20260708-4";

export const PLANT_AREA = "PLANTA";

const processAreas = [PLANT_AREA, "Pila 1", "Pila 2", "Pila 3"];
const monitoredAreas = [...processAreas, "Piscina PLS", "Piscina Refino"];
const pileAreas = ["Pila 1", "Pila 2", "Pila 3"];

export function getWorstState(records, alarmConfig = null) {
  return records.reduce((worst, record) => {
    const currentState = getRecordState(record, alarmConfig);
    const currentRank = severityValue(currentState);
    const worstRank = severityValue(worst);
    return currentRank > worstRank ? currentState : worst;
  }, "Normal");
}

export function buildPlantRecords(records) {
  const chronological = [...records].sort((a, b) => new Date(a.timestampCreacion) - new Date(b.timestampCreacion));
  const groups = groupRecordsByComparableTime(chronological);
  const latestPileRecords = new Map();
  const latestLevels = {
    nivelPiscinaRefino: null,
    nivelPiscinaPLS: null
  };
  const plantRecords = [];

  groups.forEach((groupRecords) => {
    const representative = groupRecords[groupRecords.length - 1];
    const pileRecords = groupRecords.filter((record) => pileAreas.includes(record.subarea));
    const refinoLevel = latestFiniteValue(groupRecords, "nivelPiscinaRefino");
    const plsLevel = latestFiniteValue(groupRecords, "nivelPiscinaPLS");

    pileRecords.forEach((record) => {
      latestPileRecords.set(record.subarea, record);
    });

    if (Number.isFinite(refinoLevel)) latestLevels.nivelPiscinaRefino = refinoLevel;
    if (Number.isFinite(plsLevel)) latestLevels.nivelPiscinaPLS = plsLevel;
    if (!latestPileRecords.size) return;

    const activePileRecords = pileAreas
      .map((area) => latestPileRecords.get(area))
      .filter(Boolean);

    plantRecords.push({
      ...representative,
      id: `plant-${getTimeGroupKey(representative)}`,
      area: "Lixiviacion",
      subarea: PLANT_AREA,
      estado: getWorstState(groupRecords),
      flujoPLS: sum(activePileRecords, "flujoPLS"),
      flujoRefino: sum(activePileRecords, "flujoRefino"),
      acidezRefino: latestFiniteValue(groupRecords, "acidezRefino"),
      cuPls: weightedAverage(activePileRecords, "cuPls", "flujoPLS"),
      nivelPiscinaRefino: latestLevels.nivelPiscinaRefino,
      nivelPiscinaPLS: latestLevels.nivelPiscinaPLS,
      observacion: "Estado consolidado de planta"
    });
  });

  return plantRecords;
}

export function renderProcessMap(container, records, selectedArea, onSelect, alarmConfig = null) {
  const latestBySubarea = getLatestBySubarea(records);
  const nodes = buildProcessNodes(records, latestBySubarea, selectedArea, alarmConfig);

  container.innerHTML = nodes.map((node) => {
    const stateClass = normalizeStateClass(node.state);
    const selectedClass = selectedArea === node.name ? " is-selected" : "";

    return `
      <button type="button" class="process-node ${stateClass}${selectedClass}" data-subarea="${escapeHtml(node.name)}">
        <span class="process-name">${escapeHtml(node.name)}</span>
        <span class="process-state ${stateClass}">${escapeHtml(node.state)}</span>
        <span class="process-meta">${escapeHtml(node.metricLabel)}</span>
        <span class="process-value">${escapeHtml(node.metricValue)}</span>
        <span class="process-alarm-summary">${escapeHtml(node.alarmSummary || "")}</span>
      </button>
    `;
  }).join("");

  container.querySelectorAll(".process-node").forEach((node) => {
    node.addEventListener("click", () => onSelect(node.dataset.subarea));
  });
}

export function normalizeStateClass(state) {
  return String(state || "Normal")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function severityValue(state) {
  const stateClass = normalizeStateClass(state);
  if (stateClass === "critico") return 3;
  if (stateClass === "alerta" || stateClass === "advertencia" || stateClass === "warning") return 2;
  return 1;
}

function buildProcessNodes(records, latestBySubarea, selectedArea, alarmConfig) {
  const plantRecords = buildPlantRecords(records);
  const latestPlant = plantRecords[plantRecords.length - 1];

  return processAreas.map((name) => {
    if (name === PLANT_AREA) {
      if (!latestPlant) {
        return {
          name,
          state: "Sin datos",
          metricLabel: "Produccion Total",
          metricValue: "Sin datos en el periodo",
          alarmSummary: ""
        };
      }
      const plantState = alarmConfig && latestPlant
        ? evaluateAlarmState("flujoPLS", latestPlant.flujoPLS, alarmConfig)
        : getWorstState([...latestBySubarea.values()], alarmConfig);

      return {
        name,
        state: plantState || "Normal",
        metricLabel: "Produccion Total",
        metricValue: Number.isFinite(latestPlant?.flujoPLS)
          ? valueWithUnit(latestPlant.flujoPLS, "m3/h", 0)
          : "Sin datos en el periodo",
        alarmSummary: summarizeAlarms([...latestBySubarea.values()].flatMap((record) => record.alarmasActivas || []))
      };
    }

    const liveRecord = latestBySubarea.get(name);
    if (!liveRecord) {
      return {
        name,
        state: "Sin datos",
        metricLabel: "Flujo PLS",
        metricValue: "Sin datos en el periodo",
        alarmSummary: ""
      };
    }
    const metricRecord = getNodeMetricRecord(records, latestBySubarea, name, selectedArea);
    const metric = getMetric(name, metricRecord);

    return {
      name,
      state: getNodeState(name, liveRecord, alarmConfig),
      metricLabel: metric.label,
      metricValue: metric.value || "Sin datos en el periodo",
      alarmSummary: summarizeAlarms(liveRecord?.alarmasActivas || [])
    };
  });
}

function getRecordState(record, alarmConfig = null) {
  if (alarmConfig) {
    return Object.keys(alarmConfig).reduce((worst, variableKey) => {
      if (variableKey === "flujoPLS") return worst;
      if (variableKey.startsWith("flujoPLSPila")) {
        const recordPileKey = `flujoPLS${String(record?.subarea || "").replace(/\s/g, "")}`;
        if (variableKey !== recordPileKey) return worst;
      }
      const recordField = variableKey.startsWith("flujoPLSPila") ? "flujoPLS" : variableKey;
      const current = evaluateAlarmState(variableKey, record?.[recordField], alarmConfig);
      return severityValue(current) > severityValue(worst) ? current : worst;
    }, "Normal");
  }

  return (record?.alarmasActivas || []).reduce((worst, alarm) => {
    const state = alarm.severidad || alarm.estado || "Normal";
    return severityValue(state) > severityValue(worst) ? state : worst;
  }, record?.estado || "Normal");
}

function getNodeState(nodeName, record, alarmConfig) {
  if (nodeName.startsWith("Pila") && alarmConfig) {
    const configKey = `flujoPLS${nodeName.replace(/\s/g, "")}`;
    return evaluateAlarmState(configKey, record?.flujoPLS, alarmConfig);
  }

  return getRecordState(record, alarmConfig);
}

function summarizeAlarms(alarms) {
  if (!alarms.length) return "";
  const sorted = [...alarms].sort((a, b) => severityValue(b.severidad || b.estado) - severityValue(a.severidad || a.estado));
  const principal = sorted[0];
  const cause = principal.causa || principal.limiteSuperado
    || `${principal.variable || principal.nombre || "Variable"} ${principal.direccion || ""}`.trim();
  return alarms.length > 1 ? `${alarms.length} alarmas activas · Principal: ${cause}` : cause;
}

function getNodeMetricRecord(records, latestBySubarea, nodeName, selectedArea) {
  if (nodeName === "Piscina PLS") {
    return getLevelRecord(records, selectedArea, "nivelPiscinaPLS") || latestBySubarea.get(nodeName);
  }

  if (nodeName === "Piscina Refino") {
    return getLevelRecord(records, selectedArea, "nivelPiscinaRefino") || latestBySubarea.get(nodeName);
  }

  return latestBySubarea.get(nodeName);
}

function getLevelRecord(records, selectedArea, field) {
  if (selectedArea === PLANT_AREA) {
    const plantRecords = buildPlantRecords(records);
    return findLatestRecordWithFiniteValue(plantRecords, field);
  }

  if (pileAreas.includes(selectedArea)) {
    const pileRecords = records.filter((record) => record.subarea === selectedArea);
    return findLatestRecordWithFiniteValue(pileRecords, field);
  }

  return null;
}

function getLatestBySubarea(records) {
  const latestBySubarea = new Map();

  records.forEach((record) => {
    if (monitoredAreas.includes(record.subarea) && !latestBySubarea.has(record.subarea)) {
      latestBySubarea.set(record.subarea, record);
    }
  });

  return latestBySubarea;
}

function findLatestRecordWithFiniteValue(records, field) {
  return records.reduce((latest, record) => {
    if (!Number.isFinite(record[field])) return latest;
    if (!latest) return record;

    return new Date(record.timestampCreacion) > new Date(latest.timestampCreacion) ? record : latest;
  }, null);
}

function getMetric(area, record) {
  if (area.startsWith("Pila")) {
    return {
      label: "Flujo PLS",
      value: record ? valueWithUnit(record.flujoPLS, "m3/h", 0) : ""
    };
  }

  if (area === "Piscina PLS") {
    return {
      label: "Nivel",
      value: record ? valueWithUnit(record.nivelPiscinaPLS, "%", 0) : ""
    };
  }

  if (area === "Piscina Refino") {
    return {
      label: "Nivel",
      value: record ? valueWithUnit(record.nivelPiscinaRefino, "%", 0) : ""
    };
  }

  return {
    label: "Estado General",
    value: record?.estado || ""
  };
}

function groupRecordsByComparableTime(records) {
  const groups = new Map();

  records.forEach((record) => {
    const key = getTimeGroupKey(record);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });

  return [...groups.values()];
}

function getTimeGroupKey(record) {
  const date = new Date(record.timestampCreacion);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 16);

  return `${record.fecha || ""} ${record.hora || ""}`.trim();
}

function sum(records, field) {
  return records.reduce((total, record) => total + (Number.isFinite(record[field]) ? record[field] : 0), 0);
}

function latestFiniteValue(records, field) {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const value = records[index][field];
    if (Number.isFinite(value)) return value;
  }

  return null;
}

function weightedAverage(records, valueField, weightField) {
  const totals = records.reduce((accumulator, record) => {
    const value = record[valueField];
    const weight = record[weightField];

    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) return accumulator;

    accumulator.weighted += value * weight;
    accumulator.weight += weight;
    return accumulator;
  }, { weighted: 0, weight: 0 });

  return totals.weight > 0 ? totals.weighted / totals.weight : null;
}

function valueWithUnit(value, unit, decimals) {
  if (!Number.isFinite(value)) return "Sin dato";

  return `${value.toLocaleString("es-CL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })} ${unit}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
