let charts = {};

const chartTextColor = "#cbeaf5";
const gridColor = "rgba(141, 178, 194, 0.13)";

function commonOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: chartTextColor, boxWidth: 10 }
      }
    },
    scales: {
      x: {
        ticks: { color: chartTextColor, maxRotation: 0 },
        grid: { color: gridColor }
      },
      y: {
        ticks: { color: chartTextColor },
        grid: { color: gridColor }
      }
    }
  };
}

export function updateCharts(records) {
  if (!window.Chart) {
    window.setTimeout(() => updateCharts(records), 120);
    return;
  }

  const chronological = [...records].reverse();
  const labels = chronological.map((record) => formatTime(record.timestampCreacion));

  upsertChart("phTrendChart", {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "pH PLS",
        data: chronological.map((record) => record.phPLS),
        borderColor: "#22d3ee",
        backgroundColor: "rgba(34, 211, 238, 0.16)",
        fill: true,
        tension: 0.38,
        pointRadius: 3
      }]
    },
    options: commonOptions()
  });

  upsertChart("cuTrendChart", {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Cu PLS g/L",
        data: chronological.map((record) => record.cuPLS),
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59, 130, 246, 0.15)",
        fill: true,
        tension: 0.38,
        pointRadius: 3
      }]
    },
    options: commonOptions()
  });

  const flowByArea = aggregate(records, "flujoRiego", "avg");
  upsertChart("flowByAreaChart", {
    type: "bar",
    data: {
      labels: Object.keys(flowByArea),
      datasets: [{
        label: "m3/h",
        data: Object.values(flowByArea),
        backgroundColor: ["#22d3ee", "#3b82f6", "#facc15", "#fb923c", "#ef4444", "#38bdf8", "#a3e635"],
        borderWidth: 0
      }]
    },
    options: commonOptions()
  });

  const alertsByArea = aggregateAlerts(records);
  upsertChart("alertsByAreaChart", {
    type: "doughnut",
    data: {
      labels: Object.keys(alertsByArea),
      datasets: [{
        label: "Alertas",
        data: Object.values(alertsByArea),
        backgroundColor: ["#ef4444", "#fb923c", "#facc15", "#3b82f6", "#22d3ee", "#22c55e", "#a855f7"],
        borderColor: "#0b2230",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
          labels: { color: chartTextColor, boxWidth: 10 }
        }
      }
    }
  });
}

function upsertChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);

  if (charts[canvasId]) {
    charts[canvasId].data = config.data;
    charts[canvasId].options = config.options;
    charts[canvasId].update();
    return;
  }

  charts[canvasId] = new Chart(canvas, config);
}

function aggregate(records, field, mode) {
  const grouped = {};

  records.forEach((record) => {
    grouped[record.area] = grouped[record.area] || { total: 0, count: 0 };
    grouped[record.area].total += Number(record[field] || 0);
    grouped[record.area].count += 1;
  });

  return Object.fromEntries(Object.entries(grouped).map(([area, value]) => {
    const result = mode === "avg" ? value.total / value.count : value.total;
    return [area, Math.round(result)];
  }));
}

function aggregateAlerts(records) {
  const grouped = {};

  records.forEach((record) => {
    const isAlert = record.estado === "Alerta" || record.estado === "Crítico";
    if (!isAlert) return;
    grouped[record.area] = (grouped[record.area] || 0) + 1;
  });

  return Object.keys(grouped).length ? grouped : { "Sin alertas": 0 };
}

function formatTime(value) {
  const date = toDate(value);
  return date.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function toDate(value) {
  if (value?.toDate) return value.toDate();
  return new Date(value);
}
