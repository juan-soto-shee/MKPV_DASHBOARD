import { demoProcess } from "../data/demoData.js";

const severityRank = {
  Normal: 1,
  Alerta: 2,
  Crítico: 3,
  Critico: 3
};

export function getWorstState(records) {
  return records.reduce((worst, record) => {
    const currentRank = severityRank[record.estado] || 1;
    const worstRank = severityRank[worst] || 1;
    return currentRank > worstRank ? record.estado : worst;
  }, "Normal");
}

export function renderProcessMap(container, records) {
  const latestByArea = new Map();

  records.forEach((record) => {
    if (!latestByArea.has(record.area)) {
      latestByArea.set(record.area, record);
    }
  });

  const nodes = demoProcess.map((node) => {
    const liveRecord = latestByArea.get(node.name);
    return {
      ...node,
      state: liveRecord?.estado || node.state,
      metric: liveRecord?.observacion || node.metric
    };
  });

  container.innerHTML = nodes.map((node) => {
    const stateClass = normalizeStateClass(node.state);
    return `
      <article class="process-node">
        <span class="process-name">${escapeHtml(node.name)}</span>
        <span class="process-state ${stateClass}">${escapeHtml(node.state)}</span>
        <span class="process-meta">Condición operacional</span>
        <span class="process-value">${escapeHtml(node.metric)}</span>
      </article>
    `;
  }).join("");
}

export function normalizeStateClass(state) {
  return String(state || "Normal")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
