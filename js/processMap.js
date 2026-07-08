import { demoProcess } from "../data/demoData.js";

const severityRank = {
  Normal: 1,
  Alerta: 2,
  "Crítico": 3,
  Critico: 3
};

const processAreas = ["Pila 1", "Pila 2", "Pila 3", "Piscina PLS", "Piscina Refino"];

export function getWorstState(records) {
  return records.reduce((worst, record) => {
    const currentRank = severityRank[record.estado] || 1;
    const worstRank = severityRank[worst] || 1;
    return currentRank > worstRank ? record.estado : worst;
  }, "Normal");
}

export function renderProcessMap(container, records, selectedArea, onSelect) {
  const latestBySubarea = new Map();

  records.forEach((record) => {
    if (processAreas.includes(record.subarea) && !latestBySubarea.has(record.subarea)) {
      latestBySubarea.set(record.subarea, record);
    }
  });

  const nodes = processAreas.map((name) => {
    const liveRecord = latestBySubarea.get(name);
    const fallback = demoProcess.find((node) => node.name === name);

    return {
      name,
      state: liveRecord?.estado || fallback?.state || "Normal",
      metric: getPrimaryMetric(name, liveRecord) || fallback?.metric || "Sin datos recientes",
      timestamp: liveRecord?.timestampCreacion
    };
  });

  container.innerHTML = nodes.map((node) => {
    const stateClass = normalizeStateClass(node.state);
    const selectedClass = selectedArea === node.name ? " is-selected" : "";

    return `
      <button type="button" class="process-node ${stateClass}${selectedClass}" data-subarea="${escapeHtml(node.name)}">
        <span class="process-name">${escapeHtml(node.name)}</span>
        <span class="process-state ${stateClass}">${escapeHtml(node.state)}</span>
        <span class="process-meta">${node.timestamp ? "Ultimo valor principal" : "Condicion operacional"}</span>
        <span class="process-value">${escapeHtml(node.metric)}</span>
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

function getPrimaryMetric(area, record) {
  if (!record) return "";

  if (area.startsWith("Pila")) return valueWithUnit(record.flujoPLS, "m3/h", 0);
  if (area === "Piscina PLS") return valueWithUnit(record.nivelPiscinaPLS, "%", 0);
  if (area === "Piscina Refino") return valueWithUnit(record.nivelPiscinaRefino, "%", 0);

  return "";
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
