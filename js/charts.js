let charts = {};

const chartTextColor = "#d9f7ff";
const gridColor = "rgba(127, 208, 226, 0.12)";

const chartDefinitions = [
  {
    canvasId: "flowTrendChart",
    analysisId: "flowTrendAnalysis",
    field: "flujoPLS",
    label: "Flujo PLS",
    unit: "m3/h",
    decimals: 0,
    color: "#168aa0"
  },
  {
    canvasId: "acidTrendChart",
    analysisId: "acidTrendAnalysis",
    field: "acidezRefino",
    label: "Acidez Refino",
    unit: "g/L",
    decimals: 2,
    color: "#4e9aaa"
  },
  {
    canvasId: "cuTrendChart",
    analysisId: "cuTrendAnalysis",
    field: "cuPls",
    label: "Cu2+ PLS",
    unit: "g/L",
    decimals: 2,
    color: "#22c55e"
  },
  {
    canvasId: "refinoLevelTrendChart",
    analysisId: "refinoLevelTrendAnalysis",
    field: "nivelPiscinaRefino",
    label: "Nivel Piscina Refino",
    unit: "%",
    decimals: 0,
    color: "#facc15"
  },
  {
    canvasId: "plsLevelTrendChart",
    analysisId: "plsLevelTrendAnalysis",
    field: "nivelPiscinaPLS",
    label: "Nivel Piscina PLS",
    unit: "%",
    decimals: 0,
    color: "#247f9a"
  }
];

export function updateCharts(records) {
  if (!window.Chart) {
    window.setTimeout(() => updateCharts(records), 120);
    return;
  }

  const chronological = [...records].sort((a, b) => new Date(a.timestampCreacion) - new Date(b.timestampCreacion));

  chartDefinitions.forEach((definition) => {
    const series = chronological
      .filter((record) => Number.isFinite(record[definition.field]))
      .map((record) => ({
        label: formatLabel(record.timestampCreacion),
        value: record[definition.field]
      }));

    upsertLineChart(definition, series);
    renderTrendAnalysis(definition, series);
  });
}

function upsertLineChart(definition, series) {
  const data = {
    labels: series.map((point) => point.label),
    datasets: [{
      label: `${definition.label} (${definition.unit})`,
      data: series.map((point) => point.value),
      borderColor: definition.color,
      backgroundColor: transparentize(definition.color),
      fill: true,
      tension: 0.32,
      borderWidth: 2,
      pointRadius: 2.5,
      pointHoverRadius: 5
    }]
  };

  const options = commonOptions(definition.unit);
  upsertChart(definition.canvasId, { type: "line", data, options });
}

function commonOptions(unit) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${context.parsed.y} ${unit}`
        }
      }
    },
    scales: {
      x: {
        ticks: { color: chartTextColor, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
        grid: { color: gridColor, drawBorder: false }
      },
      y: {
        ticks: { color: chartTextColor },
        grid: { color: gridColor, drawBorder: false }
      }
    }
  };
}

function renderTrendAnalysis(definition, series) {
  const element = document.getElementById(definition.analysisId);

  if (!element || series.length < 2) {
    if (element) element.textContent = "Sin datos suficientes";
    return;
  }

  const previous = series[series.length - 2].value;
  const current = series[series.length - 1].value;
  const difference = current - previous;
  const tolerance = Math.max(Math.abs(previous) * 0.01, definition.decimals === 0 ? 1 : 0.01);

  if (Math.abs(difference) <= tolerance) {
    element.textContent = "Estable";
    element.className = "trend-analysis stable";
    return;
  }

  const direction = difference > 0 ? "Subiendo" : "Bajando";
  const sign = difference > 0 ? "+" : "";

  element.textContent = `${direction} ${sign}${formatNumber(difference, definition.decimals)} ${definition.unit}`;
  element.className = `trend-analysis ${difference > 0 ? "up" : "down"}`;
}

function upsertChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (charts[canvasId]) {
    charts[canvasId].data = config.data;
    charts[canvasId].options = config.options;
    charts[canvasId].update();
    return;
  }

  charts[canvasId] = new Chart(canvas, config);
}

function formatLabel(value) {
  const date = new Date(value);

  return date.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatNumber(value, decimals) {
  return Number(value).toLocaleString("es-CL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function transparentize(hex) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, 0.14)`;
}
