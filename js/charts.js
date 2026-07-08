let charts = {};

const chartTextColor = "#d9f7ff";
const gridColor = "rgba(127, 208, 226, 0.12)";
const PLANT_AREA = "PLANTA";
const pileAreas = ["Pila 1", "Pila 2", "Pila 3"];
const pileColors = ["#4e9aaa", "#f59e0b", "#22c55e"];

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
    canvasId: "refinoFlowTrendChart",
    analysisId: "refinoFlowTrendAnalysis",
    field: "flujoRefino",
    label: "Flujo Refino",
    unit: "m3/h",
    decimals: 0,
    color: "#38bdf8"
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
  }
];

export function updateCharts(records, context = {}) {
  if (!window.Chart) {
    window.setTimeout(() => updateCharts(records, context), 120);
    return;
  }

  const chronological = [...records].sort((a, b) => new Date(a.timestampCreacion) - new Date(b.timestampCreacion));

  chartDefinitions.forEach((definition) => {
    const configKey = definition.field === "flujoPLS" && context.selectedArea !== PLANT_AREA
      ? `flujoPLS${String(context.selectedArea || "").replace(/\s/g, "")}`
      : definition.field;
    const variableConfig = context.alarmConfig?.[configKey];

    if (definition.field === "acidezRefino" && context.selectedArea === PLANT_AREA) {
      const plantAcidSeries = buildSplitSeries(context.sourceRecords || [], definition.field);
      upsertMultiLineChart(definition, plantAcidSeries, variableConfig);
      renderSplitTrendAnalysis(definition, plantAcidSeries);
      return;
    }

    const series = chronological
      .filter((record) => Number.isFinite(record[definition.field]))
      .map((record) => ({
        label: formatLabel(record.timestampCreacion),
        value: record[definition.field],
        record
      }));

    upsertLineChart(definition, series, variableConfig);
    renderTrendAnalysis(definition, series);
  });
}

function buildSplitSeries(records, field) {
  const chronological = [...records].sort((a, b) => new Date(a.timestampCreacion) - new Date(b.timestampCreacion));

  return pileAreas.map((area, index) => ({
    label: area,
    color: pileColors[index],
    points: chronological
      .filter((record) => record.subarea === area && Number.isFinite(record[field]))
      .map((record) => ({
        timestamp: new Date(record.timestampCreacion).getTime(),
        label: formatLabel(record.timestampCreacion),
        value: record[field],
        record
      }))
  }));
}

function upsertLineChart(definition, series, alarmConfig) {
  const thresholdDatasets = buildThresholdDatasets(series.length, alarmConfig);
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
      pointHoverRadius: 5,
      pointBackgroundColor: series.map((point) => alarmPointColor(point.value, alarmConfig)),
      pointData: series
    }, ...thresholdDatasets]
  };

  const options = commonOptions(definition.unit, false, definition, alarmConfig);
  upsertChart(definition.canvasId, { type: "line", data, options });
}

function upsertMultiLineChart(definition, seriesGroups, alarmConfig) {
  const allPoints = seriesGroups.flatMap((group) => group.points);
  const timestamps = allPoints.map((point) => point.timestamp).filter(Number.isFinite);
  const timeRange = timestamps.length
    ? { min: Math.min(...timestamps), max: Math.max(...timestamps) }
    : null;
  const data = {
    datasets: seriesGroups
      .filter((group) => group.points.length)
      .map((group) => ({
          label: group.label,
          data: group.points.map((point) => ({ x: point.timestamp, y: point.value })),
          borderColor: group.color,
          backgroundColor: transparentize(group.color),
          fill: false,
          tension: 0.32,
          borderWidth: 2,
          pointRadius: 2.5,
          pointBackgroundColor: group.points.map((point) => alarmPointColor(point.value, alarmConfig)),
          pointHoverRadius: 5,
          pointData: group.points
        }))
      .concat(buildTimeThresholdDatasets(timeRange, alarmConfig))
  };

  const options = commonOptions(definition.unit, true, definition, alarmConfig, true);
  upsertChart(definition.canvasId, { type: "line", data, options });
}

function commonOptions(unit, showLegend = false, definition = {}, alarmConfig = null, useTimeScale = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false
    },
    plugins: {
      legend: {
        display: showLegend,
        labels: {
          color: chartTextColor,
          boxWidth: 10,
          boxHeight: 10,
          filter: (item, data) => !data.datasets[item.datasetIndex]?.isThreshold
        }
      },
      tooltip: {
        filter: (context) => !context.dataset.isThreshold,
        callbacks: {
          label: (context) => {
            if (context.parsed.y === null) return null;
            const prefix = context.dataset.label ? `${context.dataset.label}: ` : "";
            return `${prefix}${formatTooltipNumber(context.parsed.y)} ${unit}`;
          },
          afterLabel: (context) => {
            const point = context.dataset.pointData?.[context.dataIndex];
            if (!point?.record) return "";
            const exceeded = describeExceeded(point.value, alarmConfig);
            return [`Hora: ${point.record.hora || formatLabel(point.record.timestampCreacion)}`, `Subarea: ${point.record.subarea || "--"}`, `Estado: ${point.record.estado || "Normal"}`, exceeded].filter(Boolean);
          }
        }
      }
    },
    scales: {
      x: {
        type: useTimeScale ? "linear" : "category",
        ticks: {
          color: chartTextColor,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 6,
          callback: useTimeScale ? (value) => formatLabel(Number(value)) : undefined
        },
        grid: { color: gridColor, drawBorder: false }
      },
      y: {
        ticks: { color: chartTextColor },
        grid: { color: gridColor, drawBorder: false }
      }
    }
  };
}

function formatTooltipNumber(value) {
  return Number(value).toLocaleString("es-CL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function buildThresholdDatasets(length, config) {
  if (!config) return [];
  return [
    ["Bajo critico", "bajoCritico", "#ef4444"],
    ["Bajo alerta", "bajoAlerta", "#f59e0b"],
    ["Alto alerta", "altoAlerta", "#f59e0b"],
    ["Alto critico", "altoCritico", "#ef4444"]
  ].filter(([, key]) => Number.isFinite(Number(config[key]))).map(([label, key, color]) => ({
    label,
    data: Array(length).fill(Number(config[key])),
    borderColor: color,
    borderWidth: 1,
    borderDash: [4, 5],
    pointRadius: 0,
    fill: false,
    isThreshold: true
  }));
}

function buildTimeThresholdDatasets(timeRange, config) {
  if (!timeRange || !config) return [];

  return [
    ["Bajo critico", "bajoCritico", "#ef4444"],
    ["Bajo alerta", "bajoAlerta", "#f59e0b"],
    ["Alto alerta", "altoAlerta", "#f59e0b"],
    ["Alto critico", "altoCritico", "#ef4444"]
  ].filter(([, key]) => Number.isFinite(Number(config[key]))).map(([label, key, color]) => ({
    label,
    data: [
      { x: timeRange.min, y: Number(config[key]) },
      { x: timeRange.max, y: Number(config[key]) }
    ],
    borderColor: color,
    borderWidth: 1,
    borderDash: [4, 5],
    pointRadius: 0,
    fill: false,
    isThreshold: true
  }));
}

function alarmPointColor(value, config) {
  if (!config) return "#d9f7ff";
  if (value <= config.bajoCritico || value >= config.altoCritico) return "#ef4444";
  if (value < config.bajoAlerta || value > config.altoAlerta) return "#f59e0b";
  return "#d9f7ff";
}

function describeExceeded(value, config) {
  if (!config) return "";
  if (value <= config.bajoCritico) return `Limite superado: bajo critico (${config.bajoCritico})`;
  if (value < config.bajoAlerta) return `Limite superado: bajo alerta (${config.bajoAlerta})`;
  if (value >= config.altoCritico) return `Limite superado: alto critico (${config.altoCritico})`;
  if (value > config.altoAlerta) return `Limite superado: alto alerta (${config.altoAlerta})`;
  return "";
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

function renderSplitTrendAnalysis(definition, seriesGroups) {
  const element = document.getElementById(definition.analysisId);
  if (!element) return;

  const latestValues = seriesGroups
    .map((group) => {
      const latest = group.points[group.points.length - 1];
      return latest ? { label: group.label, value: latest.value } : null;
    })
    .filter(Boolean);

  if (latestValues.length < 2) {
    element.textContent = "Sin datos suficientes por pila";
    element.className = "trend-analysis";
    return;
  }

  const values = latestValues.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min;
  const highest = latestValues.find((point) => point.value === max);

  element.textContent = `Comparacion por pila: rango ${formatNumber(spread, definition.decimals)} ${definition.unit}; mayor ${highest.label}`;
  element.className = spread <= 0.2 ? "trend-analysis stable" : "trend-analysis up";
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
