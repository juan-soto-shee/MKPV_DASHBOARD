import { getRecordsForPeriod } from "./firestoreService.js?v=20260712-1";
import { clientConfig } from "./clientConfig.js";
import { getReferenceTimestamp } from "./dateTime.js?v=20260712-3";

const BASE_COLUMNS = [
  ["fecha", "Fecha"], ["hora", "Hora"], ["turno", "Turno"], ["implementationId", "Implementation ID"],
  ["clienteId", "Cliente ID"], ["profileId", "Profile ID"], ["clientName", "Cliente"], ["siteName", "Faena"],
  ["processName", "Proceso"], ["area", "Área"], ["subarea", "Subárea"], ["operador", "Operador"],
  ["estado", "Estado"], ["alarmasActivas", "Alarmas activas"], ["observacion", "Observación"],
  ["timestampCreacion", "Timestamp creación"]
];

export function initDataExport({ normalizeRecords }) {
  const period = document.getElementById("exportPeriod");
  const button = document.getElementById("exportDataButton");
  if (!period || !button) return;
  period.addEventListener("change", () => document.getElementById("exportCustomDates").classList.toggle("is-hidden", period.value !== "custom"));
  button.addEventListener("click", async () => {
    const message = document.getElementById("exportDataMessage");
    button.disabled = true; message.textContent = "Preparando exportación...";
    try {
      const range = validateRange(period.value, document.getElementById("exportStartDate").value, document.getElementById("exportEndDate").value);
      const raw = await getRecordsForPeriod(range.hours || 24 * 365 * 100);
      const normalized = normalizeRecords(raw).filter((record) => record.clienteId === clientConfig.clienteId);
      const records = filterExportPeriod(normalized, range);
      if (!records.length) throw new Error("No existen datos para el período seleccionado.");
      const format = document.getElementById("exportFormat").value;
      const descriptor = range.label;
      const filename = buildFilename(clientConfig.implementationId, descriptor, format, new Date());
      if (format === "csv") downloadCsv(records, filename);
      else downloadXlsx(records, filename, range);
      message.textContent = `${records.length} registros exportados correctamente.`;
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  });
}

export function validateRange(period, start, end, now = new Date()) {
  if (period !== "custom") return { hours: Number(period), label: `${period}h` };
  if (!start || !end) throw new Error("Seleccione la fecha inicial y la fecha final.");
  const from = new Date(`${start}T00:00:00`); const to = new Date(`${end}T23:59:59.999`);
  if (from > to) throw new Error("La fecha inicial no puede ser posterior a la fecha final.");
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (from > todayEnd || to > todayEnd) throw new Error("No se permiten fechas futuras.");
  return { from: from.getTime(), to: to.getTime(), label: `${start}_${end}` };
}

export function filterExportPeriod(records, range) {
  if (range.from !== undefined) return records.filter((r) => r.timestampCreacion >= range.from && r.timestampCreacion <= range.to);
  const latest = getReferenceTimestamp(records);
  if (!Number.isFinite(latest)) return [];
  const cutoff = latest - range.hours * 3600000;
  return records.filter((r) => r.timestampCreacion >= cutoff && r.timestampCreacion <= latest);
}

export function exportColumns(config = clientConfig, xlsx = false) {
  return [...BASE_COLUMNS.map(([key, label]) => ({ key, label })), ...config.variables.map((v) => ({ key: v.key, label: xlsx && v.unidad ? `${v.nombre} (${v.unidad})` : (v.nombre || v.key) }))];
}

export function exportRows(records, config = clientConfig, xlsx = false) {
  const columns = exportColumns(config, xlsx);
  return records.map((record) => Object.fromEntries(columns.map((column) => [column.label, cellValue(column.key, record, config)])));
}

function cellValue(key, record, config) {
  if (key === "alarmasActivas") return formatAlarms(record.alarmasActivas);
  if (key === "timestampCreacion") return new Date(record.timestampCreacion).toISOString();
  if (key === "implementationId") return record[key] || config.implementationId;
  if (key === "clienteId") return record[key] || config.clienteId;
  if (key === "profileId") return record[key] || config.profileId;
  if (key === "clientName") return record[key] || config.clientName;
  if (key === "siteName") return record[key] || config.siteName;
  if (key === "processName") return record[key] || config.processName;
  return record[key] ?? "";
}

export function formatAlarms(alarms) {
  if (!Array.isArray(alarms)) return String(alarms || "");
  return alarms.map((a) => typeof a === "string" ? a : `${a.variable || a.nombre || a.activo || "Alarma"}: ${a.severidad || a.estado || a.limiteSuperado || "Activa"}`).join(" | ");
}

export function buildCsv(records, config = clientConfig) {
  const rows = exportRows(records, config); const headers = exportColumns(config).map((c) => c.label);
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return `\uFEFF${[headers, ...rows.map((row) => headers.map((h) => row[h]))].map((row) => row.map(escape).join(";")).join("\r\n")}`;
}

export function buildFilename(implementationId, period, extension, date) {
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}_${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
  return `PlantView_${implementationId}_${period}_${stamp}.${extension}`;
}

function downloadCsv(records, filename) { downloadBlob(new Blob([buildCsv(records)], { type: "text/csv;charset=utf-8" }), filename); }
function downloadXlsx(records, filename, range) {
  if (!window.XLSX) throw new Error("No se pudo cargar SheetJS. Revise la conexión e intente nuevamente.");
  const info = [["PlantView — Datos Históricos"], ["Cliente", clientConfig.clientName], ["Faena", clientConfig.siteName], ["Proceso", clientConfig.processName], ["Período", range.label], ["Fecha de generación", new Date().toLocaleString("es-CL")], []];
  const data = exportRows(records, clientConfig, true); const sheet = window.XLSX.utils.aoa_to_sheet(info);
  window.XLSX.utils.sheet_add_json(sheet, data, { origin: "A8" });
  sheet["!cols"] = exportColumns(clientConfig, true).map((c) => ({ wch: Math.min(32, Math.max(12, c.label.length + 2)) }));
  sheet["!autofilter"] = { ref: `A8:${window.XLSX.utils.encode_col(exportColumns(clientConfig, true).length - 1)}${records.length + 8}` };
  const workbook = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(workbook, sheet, "Datos Históricos");
  window.XLSX.writeFile(workbook, filename);
}
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }
