import { evaluateAlarmState } from "./alarmAdmin.js?v=20260709-8";
import { clientConfig, PLANT_AREA, getVariable } from "./clientConfig.js";

export { PLANT_AREA };

const processAreas = clientConfig.layout.ordenEquiposMapa;
const monitoredAreas = [PLANT_AREA, ...clientConfig.equipment.map((item) => item.nombre)];
const pileAreas = clientConfig.equipment.filter((item) => item.tipo === "pila").map((item) => item.nombre);
const text = clientConfig.layout.textos;
const plantPrimaryVariable = clientConfig.variables.find((variable) => variable.porEquipo)
  || clientConfig.variables[0];

export function getWorstState(records, alarmConfig = null) {
  return records.reduce((worst, record) => {
    const currentState = getRecordState(record, alarmConfig);
    const currentRank = severityValue(currentState);
    const worstRank = severityValue(worst);
    return currentRank > worstRank ? currentState : worst;
  }, "Normal");
}

export function getCurrentState(records, alarmConfig = null) {
  const latestBySubarea = getLatestBySubarea(records);
  const latestRecords = [...latestBySubarea.values()];
  if (alarmConfig && latestRecords.length) {
    const plantRecords = buildPlantRecords(records);
    const latestPlant = plantRecords[plantRecords.length - 1];

    return Object.keys(alarmConfig).reduce((worst, variableKey) => {
      const alarmDefinition = clientConfig.alarmVariables.find((item) => item.key === variableKey);
      if (!alarmDefinition) return worst;

      const sourceRecord = alarmDefinition.equipo
        ? latestBySubarea.get(alarmDefinition.equipo)
        : latestPlant;
      const current = evaluateAlarmState(
        variableKey,
        sourceRecord?.[alarmDefinition.variable],
        alarmConfig
      );
      return severityValue(current) > severityValue(worst) ? current : worst;
    }, "Normal");
  }
  if (latestRecords.length) return getWorstState(latestRecords);

  const latest = records.reduce((current, record) => (
    !current || record.timestampCreacion > current.timestampCreacion ? record : current
  ), null);
  return latest ? getWorstState([latest], alarmConfig) : "Sin datos";
}

export function buildPlantRecords(records) {
  if (!pileAreas.length) {
    return [...records].sort((a, b) => a.timestampCreacion - b.timestampCreacion);
  }

  const chronological = [...records].sort((a, b) => a.timestampCreacion - b.timestampCreacion);
  const groups = groupRecordsByComparableTime(chronological);
  const latestPileRecords = new Map();
  const latestValues = new Map();
  const plantRecords = [];

  groups.forEach((groupRecords) => {
    const representative = groupRecords[groupRecords.length - 1];
    const pileRecords = groupRecords.filter((record) => pileAreas.includes(record.subarea));

    pileRecords.forEach((record) => {
      latestPileRecords.set(record.subarea, record);
    });

    clientConfig.variables.forEach((variable) => {
      const latest = latestFiniteValue(groupRecords, variable.key);
      if (Number.isFinite(latest)) latestValues.set(variable.key, latest);
    });
    if (!latestPileRecords.size) return;

    const activePileRecords = pileAreas
      .map((area) => latestPileRecords.get(area))
      .filter(Boolean);

    const aggregatedValues = Object.fromEntries(clientConfig.variables.map((variable) => {
      if (variable.agregacion === "suma") {
        return [variable.key, sum(activePileRecords, variable.key)];
      }
      if (variable.agregacion === "promedioPonderado") {
        return [variable.key, weightedAverage(activePileRecords, variable.key, variable.ponderador)];
      }
      return [variable.key, latestValues.get(variable.key) ?? null];
    }));

    plantRecords.push({
      ...representative,
      ...aggregatedValues,
      id: `plant-${getTimeGroupKey(representative)}`,
      area: clientConfig.identity.proceso,
      subarea: PLANT_AREA,
      estado: getWorstState(groupRecords),
      observacion: text.estadoConsolidado
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
          metricLabel: text.produccionTotal,
          metricValue: text.sinDatos,
          alarmSummary: ""
        };
      }
      const plantState = alarmConfig && latestPlant
        ? evaluateAlarmState(plantPrimaryVariable.key, latestPlant[plantPrimaryVariable.key], alarmConfig)
        : getWorstState([...latestBySubarea.values()], alarmConfig);

      return {
        name,
        state: plantState || "Normal",
        metricLabel: text.produccionTotal,
        metricValue: Number.isFinite(latestPlant?.[plantPrimaryVariable.key])
          ? valueWithVariable(latestPlant[plantPrimaryVariable.key], plantPrimaryVariable.key)
          : text.sinDatos,
        alarmSummary: summarizeAlarms([...latestBySubarea.values()].flatMap((record) => record.alarmasActivas || []))
      };
    }

    const liveRecord = latestBySubarea.get(name);
    if (!liveRecord) {
      return {
        name,
        state: "Sin datos",
        metricLabel: getVariable(clientConfig.equipmentMap[name]?.variablePrincipal)?.nombre || text.sinDatos,
        metricValue: text.sinDatos,
        alarmSummary: ""
      };
    }
    const metricRecord = getNodeMetricRecord(records, latestBySubarea, name, selectedArea);
    const metric = getMetric(name, metricRecord);

    return {
      name,
      state: getNodeState(name, liveRecord, alarmConfig),
      metricLabel: metric.label,
      metricValue: metric.value || text.sinDatos,
      alarmSummary: summarizeAlarms(liveRecord?.alarmasActivas || [])
    };
  });
}

function getRecordState(record, alarmConfig = null) {
  if (alarmConfig) {
    return Object.keys(alarmConfig).reduce((worst, variableKey) => {
      const alarmDefinition = clientConfig.alarmVariables.find((item) => item.key === variableKey);
      if (!alarmDefinition) return worst;
      if (alarmDefinition.equipo && alarmDefinition.equipo !== record?.subarea) return worst;
      if (!alarmDefinition.equipo && alarmDefinition.variable === plantPrimaryVariable.key) return worst;
      const recordField = alarmDefinition.variable;
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
  const equipment = clientConfig.equipmentMap[nodeName];
  if (equipment?.tipo === "pila" && alarmConfig) {
    const configKey = clientConfig.alarmVariables.find((item) => item.equipo === nodeName)?.key;
    if (!configKey) return getRecordState(record, alarmConfig);
    return evaluateAlarmState(configKey, record?.[equipment.variablePrincipal], alarmConfig);
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
  const equipment = clientConfig.equipmentMap[nodeName];
  const variable = getVariable(equipment?.variablePrincipal);
  if (equipment?.tipo === "piscina" && variable) {
    return getLevelRecord(records, selectedArea, variable.key) || latestBySubarea.get(nodeName);
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
    const current = latestBySubarea.get(record.subarea);
    if (monitoredAreas.includes(record.subarea)
        && (!current || record.timestampCreacion > current.timestampCreacion)) {
      latestBySubarea.set(record.subarea, record);
    }
    if (!pileAreas.length) {
      clientConfig.equipment.forEach((equipment) => {
        const variableKeys = [
          equipment.variablePrincipal,
          ...clientConfig.variables
            .filter((variable) => variable.equipoId === equipment.id)
            .map((variable) => variable.key)
        ].filter(Boolean);
        const hasEquipmentValue = variableKeys.some((key) =>
          Number.isFinite(record[key]) || String(record[key] || "").trim()
        );
        const currentEquipment = latestBySubarea.get(equipment.nombre);
        if (hasEquipmentValue
            && (!currentEquipment || record.timestampCreacion > currentEquipment.timestampCreacion)) {
          latestBySubarea.set(equipment.nombre, record);
        }
      });
    }
  });

  return latestBySubarea;
}

function findLatestRecordWithFiniteValue(records, field) {
  return records.reduce((latest, record) => {
    if (!Number.isFinite(record[field])) return latest;
    if (!latest) return record;

    return record.timestampCreacion > latest.timestampCreacion ? record : latest;
  }, null);
}

function getMetric(area, record) {
  const equipment = clientConfig.equipmentMap[area];
  const variable = getVariable(equipment?.variablePrincipal);
  if (variable) {
    return {
      label: variable.nombre,
      value: record ? valueWithVariable(record[variable.key], variable.key) : ""
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

function valueWithVariable(value, variableKey) {
  if (!Number.isFinite(value)) return "Sin dato";
  const variable = getVariable(variableKey);
  if (!variable) return String(value);

  return `${value.toLocaleString(clientConfig.identity.locale, {
    minimumFractionDigits: variable.decimales,
    maximumFractionDigits: variable.decimales
  })} ${variable.unidad}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
