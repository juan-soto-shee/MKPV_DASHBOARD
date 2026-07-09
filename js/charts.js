let charts = {};

const chartTextColor = "#d9f7ff";
const gridColor = "rgba(127, 208, 226, 0.12)";
const PLANT_AREA = "PLANTA";
const pileAreas = ["Pila 1", "Pila 2", "Pila 3"];
const pileColors = ["#4e9aaa", "#f59e0b", "#22c55e"];
const stateColors = {
  normal: "#22c55e",
  warning: "#f59e0b",
  alarm: "#ef4444"
};

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
  },
  {
    canvasId: "plsLevelTrendChart",
    analysisId: "plsLevelTrendAnalysis",
    field: "nivelPiscinaPLS",
    label: "Nivel Piscina PLS",
    unit: "%",
    decimals: 0,
    color: "#06b6d4"
  },
  {
    canvasId: "refinoLevelTrendChart",
    analysisId: "refinoLevelTrendAnalysis",
    field: "nivelPiscinaRefino",
    label: "Nivel Piscina Refino",
    unit: "%",
    decimals: 0,
    color: "#a78bfa"
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
      renderAlarmPresentation(definition, plantAcidSeries.flatMap((group) => group.points), variableConfig);
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
    renderAlarmPresentation(definition, series, variableConfig);
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
  const pointStates = series.map((point) => getPointAlarm(point, definition, alarmConfig));
  const pointRadii = buildMarkerRadii(pointStates);
  const thresholdDatasets = buildThresholdDatasets(series.length, alarmConfig);
  const data = {
    labels: series.map((point) => point.label),
    datasets: [{
      label: `${definition.label} (${definition.unit})`,
      data: series.map((point) => point.value),
      borderColor: lineColor(pointStates, definition.color),
      backgroundColor: transparentize(definition.color),
      fill: true,
      tension: 0.32,
      borderWidth: 2,
      pointRadius: pointRadii,
      pointHoverRadius: 5,
      pointHitRadius: 8,
      pointBackgroundColor: pointStates.map((state, index) =>
        pointRadii[index] ? state.color : "transparent"
      ),
      pointBorderColor: pointStates.map((state, index) =>
        pointRadii[index] ? state.color : "transparent"
      ),
      segment: {
        borderColor: (context) => segmentColor(context, pointStates, definition.color)
      },
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
      .map((group) => {
        const alarmStates = group.points.map((point) => getPointAlarm(point, definition, alarmConfig));
        const pointRadii = buildMarkerRadii(alarmStates);
        return {
          alarmStates,
          label: group.label,
          data: group.points.map((point) => ({ x: point.timestamp, y: point.value })),
          borderColor: lineColor(alarmStates, group.color),
          backgroundColor: transparentize(group.color),
          fill: false,
          tension: 0.32,
          borderWidth: 2,
          pointRadius: pointRadii,
          pointBackgroundColor: alarmStates.map((state, index) =>
            pointRadii[index] ? state.color : "transparent"
          ),
          pointBorderColor: alarmStates.map((state, index) =>
            pointRadii[index] ? state.color : "transparent"
          ),
          segment: {
            borderColor: (context) => segmentColor(context, alarmStates, group.color)
          },
          pointHoverRadius: 5,
          pointHitRadius: 8,
          pointData: group.points
        };
      })
      .concat(buildTimeThresholdDatasets(timeRange, alarmConfig))
  };

  const options = commonOptions(definition.unit, true, definition, alarmConfig, "time");
  upsertChart(definition.canvasId, { type: "line", data, options });
}

function commonOptions(unit, showLegend = false, definition = {}, alarmConfig = null, xScaleMode = "category") {
  const useLinearScale = xScaleMode !== "category";
  const mobile = isMobileChartView();

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "nearest",
      intersect: false
    },
    events: mobile ? [] : ["mousemove", "mouseout", "click", "touchstart", "touchmove"],
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
        enabled: !mobile,
        position: "nearest",
        filter: (context) => !context.dataset.isThreshold,
        callbacks: {
          title: () => "",
          label: (context) => {
            if (context.parsed.y === null) return null;
            const seriesName = showLegend ? `${context.dataset.label} — ` : "";
            return `${seriesName}${definition.label}: ${formatTooltipNumber(context.parsed.y)} ${unit}`;
          },
          afterLabel: (context) => {
            const point = context.dataset.pointData?.[context.dataIndex];
            if (!point?.record) return "";
            const date = point.record.fecha || formatDate(point.record.timestampCreacion);
            const time = point.record.hora || formatTime(point.record.timestampCreacion);
            return `${date} · ${time} · ${point.record.subarea || "--"}`;
          }
        }
      }
    },
    scales: {
      x: {
        type: useLinearScale ? "linear" : "category",
        title: {
          display: false,
          text: "",
          color: chartTextColor
        },
        ticks: {
          color: chartTextColor,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 6,
          callback: xScaleMode === "time"
            ? (value) => formatLabel(Number(value))
            : undefined
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

function getPointAlarm(point, definition, config) {
  const record = point?.record || {};
  const alarms = Array.isArray(record.alarmasActivas) ? record.alarmasActivas : [];
  const matchingAlarms = alarms.filter((alarm) => alarmMatchesDefinition(alarm, definition));

  if (matchingAlarms.length) {
    const alarm = [...matchingAlarms].sort((a, b) =>
      stateRank(b.severidad || b.estado) - stateRank(a.severidad || a.estado)
    )[0];
    const state = normalizeAlarmState(alarm.severidad || alarm.estado || record.estado);
    return buildAlarmState(
      state,
      alarmCause(alarm) || thresholdCause(point.value, config, state),
      point.value,
      config
    );
  }

  const thresholdState = thresholdAlarmState(point.value, config);
  return buildAlarmState(
    thresholdState,
    thresholdCause(point.value, config, thresholdState),
    point.value,
    config
  );
}

function alarmMatchesDefinition(alarm, definition) {
  const variable = normalizeText(alarm.variable || alarm.nombre || alarm.campo || alarm.variableId);
  if (!variable) return false;
  const aliases = {
    flujoPLS: ["flujopls", "flujoderiego", "flujopls"],
    flujoRefino: ["flujorefino"],
    acidezRefino: ["acidezrefino", "acidolibre", "acidez"],
    cuPls: ["cu2pls", "cupls", "cobrepls"],
    nivelPiscinaPLS: ["nivelpiscinapls", "nivelpls"],
    nivelPiscinaRefino: ["nivelpiscinorefino", "nivelpiscinorefino", "nivelrefino"]
  };
  return (aliases[definition.field] || []).some((alias) => variable.includes(alias));
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function normalizeAlarmState(value) {
  const state = normalizeText(value);
  if (state.includes("critic") || state.includes("alarma")) return "alarm";
  if (state.includes("alert") || state.includes("advert") || state.includes("prevent") || state.includes("warning")) return "warning";
  return "normal";
}

function stateRank(value) {
  return { normal: 0, warning: 1, alarm: 2 }[normalizeAlarmState(value)];
}

function buildAlarmState(state, cause = "", value = null, config = null) {
  const normalized = state || "normal";
  return {
    state: normalized,
    color: stateColors[normalized],
    icon: normalized === "alarm" ? "🔴" : normalized === "warning" ? "🟡" : "🟢",
    label: normalized === "alarm" ? "Alerta" : normalized === "warning" ? "Advertencia" : "Estable",
    cause,
    value,
    config
  };
}

function alarmCause(alarm) {
  return alarm.causa || alarm.limiteSuperado || alarm.limite || alarm.descripcion || "";
}

function thresholdAlarmState(value, config) {
  if (!config || !Number.isFinite(Number(value))) return "normal";
  if (value <= Number(config.bajoCritico) || value >= Number(config.altoCritico)) return "alarm";
  if (value < Number(config.bajoAlerta) || value > Number(config.altoAlerta)) return "warning";
  return "normal";
}

function thresholdCause(value, config, state) {
  if (!config || state === "normal") return "";
  const unit = config.unidad ? ` ${config.unidad}` : "";
  if (value <= Number(config.bajoCritico)) return `Bajo crítico ≤ ${formatNumber(config.bajoCritico, 2)}${unit}`;
  if (value < Number(config.bajoAlerta)) return `Bajo alerta < ${formatNumber(config.bajoAlerta, 2)}${unit}`;
  if (value >= Number(config.altoCritico)) return `Alto crítico ≥ ${formatNumber(config.altoCritico, 2)}${unit}`;
  if (value > Number(config.altoAlerta)) return `Alto alerta > ${formatNumber(config.altoAlerta, 2)}${unit}`;
  return "";
}

function lineColor(states, fallback) {
  const worst = states.reduce((result, state) =>
    stateRank(state.state) > stateRank(result.state) ? state : result
  , buildAlarmState("normal"));
  return worst.state === "normal" ? fallback : worst.color;
}

function segmentColor(context, states, fallback) {
  const adjacent = [states[context.p0DataIndex], states[context.p1DataIndex]].filter(Boolean);
  return lineColor(adjacent, fallback);
}

function buildMarkerRadii(states) {
  return states.map((state, index) => {
    const previousState = states[index - 1]?.state;
    const isLast = index === states.length - 1;
    const startsAlarm = state.state !== "normal" && state.state !== previousState;

    if (startsAlarm) return state.state === "alarm" ? 4 : 3.5;
    if (isLast) return state.state === "normal" ? 2.5 : 3.5;
    return 0;
  });
}

function isMobileChartView() {
  return window.matchMedia("(max-width: 820px)").matches
    || /Android/i.test(window.navigator.userAgent || "");
}

function renderAlarmPresentation(definition, series, alarmConfig) {
  const groups = new Map();
  const groupSeries = new Map();
  series.forEach((point) => {
    const groupName = definition.field === "acidezRefino"
      ? point.record?.subarea || "Área"
      : definition.label;
    if (!groupSeries.has(groupName)) groupSeries.set(groupName, []);
    groupSeries.get(groupName).push(point);
    const current = groups.get(groupName);
    if (!current || new Date(point.record?.timestampCreacion) > new Date(current.record?.timestampCreacion)) {
      groups.set(groupName, point);
    }
  });

  const summaries = [...groups.entries()].map(([groupName, point]) => ({
    groupName,
    alarm: getPointAlarm(point, definition, alarmConfig),
    trend: buildTrendDescription(groupSeries.get(groupName) || [], definition)
  }));
  const alarm = summaries.slice(1).reduce((worst, summary) =>
    stateRank(summary.alarm.state) > stateRank(worst.state) ? summary.alarm : worst
  , summaries[0]?.alarm || buildAlarmState("normal"));
  const canvas = document.getElementById(definition.canvasId);
  const title = canvas?.closest(".panel")?.querySelector(".chart-heading h3");
  if (title) title.textContent = `${alarm.icon} ${definition.label}`;

  const analysis = document.getElementById(definition.analysisId);
  if (!analysis) return;
  const describeAlarm = (currentAlarm) => {
    const condition = getCompactCondition(currentAlarm);
    return `${currentAlarm.icon} ${condition}`;
  };
  const trendText = buildTrendDescription(series, definition);
  analysis.textContent = summaries.length > 1
    ? summaries.map(({ groupName, alarm: groupAlarm, trend }) =>
        `${shortAreaName(groupName)} ${[describeAlarm(groupAlarm), trend].filter(Boolean).join(" · ")}`
      ).join(" · ")
    : [describeAlarm(alarm), trendText].filter(Boolean).join(" · ");
  analysis.className = `trend-analysis alarm-status ${alarm.state}`;
}

function buildTrendDescription(series, definition) {
  if (series.length < 2) return "Sin variación disponible";

  const previous = Number(series[series.length - 2].value);
  const current = Number(series[series.length - 1].value);
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return "";

  const difference = current - previous;
  if (difference === 0) return "Sin variación";

  return `${difference > 0 ? "Subió" : "Bajó"} ${formatTrendVariation(difference, definition)}`;
}

function formatTrendVariation(difference, definition) {
  const absoluteDifference = Math.abs(difference);
  const decimals = definition.unit === "%" ? Math.max(definition.decimals, 1) : definition.decimals;
  const unit = definition.unit === "%"
    ? (absoluteDifference === 1 ? "punto porcentual" : "puntos porcentuales")
    : definition.unit;

  return `${formatNumber(absoluteDifference, decimals)} ${unit}`;
}

function getCompactCondition(alarm) {
  const value = Number(alarm.value);
  const config = alarm.config;

  if (config && Number.isFinite(value)) {
    if (value <= Number(config.bajoCritico)) return "Bajo crítico";
    if (value < Number(config.bajoAlerta)) return "Bajo alerta";
    if (value >= Number(config.altoCritico)) return "Alto crítico";
    if (value > Number(config.altoAlerta)) return "Alto alerta";
  }

  const cause = normalizeText(alarm.cause);
  if (cause.includes("bajocritic")) return "Bajo crítico";
  if (cause.includes("bajoalert") || cause.includes("preventivobajo")) return "Bajo alerta";
  if (cause.includes("altocritic") || cause.includes("sobrelimitealto")) return "Alto crítico";
  if (cause.includes("altoalert") || cause.includes("preventivoalto")) return "Alto alerta";
  return alarm.label || "Estable";
}

function shortAreaName(value) {
  return String(value || "")
    .replace(/^Pila\s+/i, "P")
    .replace(/^Piscina\s+/i, "");
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

  element.textContent = `${direction} ${formatTrendVariation(difference, definition)}`;
  element.className = `trend-analysis ${difference > 0 ? "up" : "down"}`;
}

function renderSplitTrendAnalysis(definition, seriesGroups) {
  const element = document.getElementById(definition.analysisId);
  if (!element) return;

  const trends = seriesGroups.map((group) => {
    if (group.points.length < 2) return `${group.label}: sin datos suficientes`;

    const previous = group.points[group.points.length - 2].value;
    const current = group.points[group.points.length - 1].value;
    const difference = current - previous;
    const tolerance = Math.max(Math.abs(previous) * 0.01, definition.decimals === 0 ? 1 : 0.01);

    if (Math.abs(difference) <= tolerance) return `${group.label}: estable`;

    const direction = difference > 0 ? "subio" : "bajo";
    return `${group.label}: ${direction} ${formatTrendVariation(difference, definition)}`;
  });

  if (!trends.length) {
    element.textContent = "Sin datos suficientes";
    element.className = "trend-analysis";
    return;
  }

  element.textContent = trends.join(" | ");
  element.className = "trend-analysis";
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

function formatTime(value) {
  return new Date(value).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
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
