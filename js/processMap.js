import { demoProcess } from "../data/demoData.js";

export const PLANT_AREA = "PLANTA";

const processAreas = [PLANT_AREA, "Pila 1", "Pila 2", "Pila 3", "Piscina PLS", "Piscina Refino"];
const pileAreas = ["Pila 1", "Pila 2", "Pila 3"];

export function getWorstState(records) {
  return records.reduce((worst, record) => {
    const currentRank = severityValue(record.estado);
    const worstRank = severityValue(worst);
    return currentRank > worstRank ? record.estado : worst;
  }, "Normal");
}

export function buildPlantRecords(records) {
  const chronological = [...records].sort((a, b) => new Date(a.timestampCreacion) - new Date(b.timestampCreacion));
  const latestByPile = new Map();
  const plantRecords = [];

  chronological.forEach((record) => {
    if (!pileAreas.includes(record.subarea)) return;

    latestByPile.set(record.subarea, record);

    const pileRecords = [...latestByPile.values()];
    const totalFlow = sum(pileRecords, "flujoPLS");

    plantRecords.push({
      ...record,
      id: `plant-${record.id || record.timestampCreacion}`,
      area: "Lixiviacion",
      subarea: PLANT_AREA,
      estado: getWorstState(pileRecords),
      flujoPLS: totalFlow,
      acidezRefino: weightedAverage(pileRecords, "acidezRefino", "flujoPLS"),
      cuPls: weightedAverage(pileRecords, "cuPls", "flujoPLS"),
      nivelPiscinaRefino: average(recordsForSubarea(records, "Piscina Refino"), "nivelPiscinaRefino"),
      nivelPiscinaPLS: average(recordsForSubarea(records, "Piscina PLS"), "nivelPiscinaPLS"),
      observacion: "Estado consolidado de planta"
    });
  });

  return plantRecords;
}

export function renderProcessMap(container, records, selectedArea, onSelect) {
  const latestBySubarea = getLatestBySubarea(records);
  const nodes = buildProcessNodes(records, latestBySubarea);

  container.innerHTML = nodes.map((node) => {
    const stateClass = normalizeStateClass(node.state);
    const selectedClass = selectedArea === node.name ? " is-selected" : "";

    return `
      <button type="button" class="process-node ${stateClass}${selectedClass}" data-subarea="${escapeHtml(node.name)}">
        <span class="process-name">${escapeHtml(node.name)}</span>
        <span class="process-state ${stateClass}">${escapeHtml(node.state)}</span>
        <span class="process-meta">${escapeHtml(node.metricLabel)}</span>
        <span class="process-value">${escapeHtml(node.metricValue)}</span>
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
  if (stateClass === "alerta") return 2;
  return 1;
}

function buildProcessNodes(records, latestBySubarea) {
  const plantRecords = buildPlantRecords(records);
  const latestPlant = plantRecords[plantRecords.length - 1];
  const fallbackPlant = demoProcess.find((node) => node.name === PLANT_AREA);

  return processAreas.map((name) => {
    if (name === PLANT_AREA) {
      const plantState = getWorstState([...latestBySubarea.values()]);

      return {
        name,
        state: plantState || fallbackPlant?.state || "Normal",
        metricLabel: "Produccion Total",
        metricValue: Number.isFinite(latestPlant?.flujoPLS)
          ? valueWithUnit(latestPlant.flujoPLS, "m3/h", 0)
          : fallbackPlant?.metric || "Sin datos recientes"
      };
    }

    const liveRecord = latestBySubarea.get(name);
    const fallback = demoProcess.find((node) => node.name === name);
    const metric = getMetric(name, liveRecord);

    return {
      name,
      state: liveRecord?.estado || fallback?.state || "Normal",
      metricLabel: metric.label,
      metricValue: metric.value || fallback?.metric || "Sin datos recientes"
    };
  });
}

function getLatestBySubarea(records) {
  const latestBySubarea = new Map();

  records.forEach((record) => {
    if (processAreas.includes(record.subarea) && !latestBySubarea.has(record.subarea)) {
      latestBySubarea.set(record.subarea, record);
    }
  });

  return latestBySubarea;
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

function recordsForSubarea(records, subarea) {
  return records.filter((record) => record.subarea === subarea);
}

function sum(records, field) {
  return records.reduce((total, record) => total + (Number.isFinite(record[field]) ? record[field] : 0), 0);
}

function average(records, field) {
  const values = records.map((record) => record[field]).filter(Number.isFinite);
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
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
