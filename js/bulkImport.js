import { Timestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAlarmConfig } from "./alarmAdmin.js?v=20260709-1";
import { insertImportedRecords } from "./firestoreService.js?v=20260709-1";
import { clientConfig } from "./clientConfig.js";

const EXPECTED_COLUMNS = [
  "fecha", "hora", "turno", "area", "subarea", "operador",
  ...clientConfig.variables.map((variable) => variable.key), "observacion"
];
const REQUIRED_COLUMNS = ["fecha", "hora", "subarea"];
const NUMERIC_COLUMNS = clientConfig.variables.map((variable) => variable.key);
const VALID_SUBAREAS = new Map(clientConfig.equipment
  .filter((item) => item.tipo === "pila")
  .flatMap((item) => [item.nombre, ...(item.aliases || [])]
    .map((alias) => [normalizeText(alias), item.nombre])));
const SEVERITY_RANK = { Normal: 0, Alerta: 1, "Crítico": 2 };

export function initBulkImport() {
  const elements = getElements();
  if (!elements.file || !elements.startButton) return;

  elements.file.addEventListener("change", () => {
    const file = elements.file.files[0];
    const validType = file && /\.(xlsx|csv)$/i.test(file.name);
    elements.startButton.disabled = !validType;
    elements.fileInfo.textContent = validType
      ? `${file.name} · ${formatBytes(file.size)}`
      : file ? "Formato no válido. Seleccione un archivo .xlsx o .csv." : "Seleccione un archivo para comenzar.";
  });
  elements.startButton.addEventListener("click", () => importFile(elements));
}

async function importFile(elements) {
  const file = elements.file.files[0];
  if (!file || !window.XLSX) {
    elements.fileInfo.textContent = window.XLSX
      ? "Seleccione un archivo válido."
      : "No se pudo cargar SheetJS. Revise la conexión e intente nuevamente.";
    return;
  }

  const startedAt = performance.now();
  setBusy(elements, true);
  resetResults(elements);

  try {
    updateProgress(elements, 2, "Leyendo archivo...");
    const rows = await readRows(file);
    if (!rows.length) throw new Error("El archivo no contiene registros.");

    const missing = REQUIRED_COLUMNS.filter((column) => !hasColumn(rows, column));
    if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(", ")}.`);

    const config = getAlarmConfig();
    const validRecords = [];
    const errors = [];

    rows.forEach((sourceRow, index) => {
      const rowNumber = index + 2;
      try {
        const normalized = normalizeRow(sourceRow);
        validRecords.push(buildRecord(normalized, config));
      } catch (error) {
        errors.push({ row: rowNumber, detail: error.message });
      }
      updateProgress(elements, Math.round(((index + 1) / rows.length) * 35), `Validando fila ${index + 1} de ${rows.length}...`);
    });

    if (validRecords.length) {
      updateProgress(elements, 40, "Subiendo registros a Firestore...");
      await insertImportedRecords(validRecords, (inserted, total) => {
        const percent = 40 + Math.round((inserted / total) * 60);
        updateProgress(elements, percent, `Subiendo ${inserted} de ${total} registros correctos...`);
      });
    }

    const elapsed = performance.now() - startedAt;
    renderResults(elements, rows.length, validRecords.length, errors, elapsed);
    updateProgress(elements, 100, "Importación finalizada.");
    elements.fileInfo.textContent = validRecords.length
      ? `${validRecords.length} registros importados correctamente.`
      : "No se importaron registros; revise los errores.";
  } catch (error) {
    console.error("Error en importación masiva:", error);
    elements.fileInfo.textContent = error.message || "No se pudo procesar el archivo.";
    renderResults(elements, 0, 0, [{ row: "-", detail: error.message }], performance.now() - startedAt);
    updateProgress(elements, 0, "Importación cancelada.");
  } finally {
    setBusy(elements, false);
  }
}

async function readRows(file) {
  const data = await file.arrayBuffer();
  const workbook = window.XLSX.read(data, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  return window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
}

function normalizeRow(sourceRow) {
  const byNormalizedHeader = Object.entries(sourceRow).reduce((result, [key, value]) => {
    result[normalizeHeader(key)] = value;
    return result;
  }, {});
  const row = {};
  EXPECTED_COLUMNS.forEach((column) => {
    row[column] = byNormalizedHeader[normalizeHeader(column)] ?? "";
  });
  return row;
}

function buildRecord(row, config) {
  const date = parseDateTime(row.fecha, row.hora);
  const subarea = VALID_SUBAREAS.get(normalizeText(row.subarea));
  if (!subarea) throw new Error(`Subárea inválida. Use: ${[...new Set(VALID_SUBAREAS.values())].join(", ")}.`);

  const numericValues = {};
  NUMERIC_COLUMNS.forEach((column) => {
    numericValues[column] = parseNumber(row[column], column);
  });

  const alarmasActivas = buildAlarms(numericValues, subarea, config, row.observacion);
  const estado = alarmasActivas.reduce((worst, alarm) => (
    SEVERITY_RANK[alarm.severidad] > SEVERITY_RANK[worst] ? alarm.severidad : worst
  ), "Normal");

  return {
    fecha: formatDate(date),
    hora: formatTime(date),
    turno: cleanText(row.turno),
    area: cleanText(row.area) || clientConfig.identity.proceso,
    subarea,
    operador: cleanText(row.operador),
    ...numericValues,
    observacion: cleanText(row.observacion),
    timestampCreacion: Timestamp.fromDate(date),
    estado,
    alarmasActivas
  };
}

function buildAlarms(values, subarea, config, observation) {
  return NUMERIC_COLUMNS.flatMap((column) => {
    const configKey = clientConfig.alarmVariables.find((item) =>
      item.variable === column && (!item.equipo || item.equipo === subarea)
    )?.key || column;
    const limits = config?.[configKey] || config?.[column];
    if (!limits) return [];

    const severity = evaluate(values[column], limits);
    if (severity === "Normal") return [];

    return [{
      activo: subarea,
      variable: limits.nombre || column,
      variableId: configKey,
      valor: values[column],
      unidad: limits.unidad || "",
      limiteSuperado: describeLimit(values[column], limits),
      severidad: severity,
      observacion: cleanText(observation)
    }];
  });
}

function evaluate(value, limits) {
  if (value <= Number(limits.bajoCritico) || value >= Number(limits.altoCritico)) return "Crítico";
  if (value < Number(limits.bajoAlerta) || value > Number(limits.altoAlerta)) return "Alerta";
  return "Normal";
}

function describeLimit(value, limits) {
  if (value <= Number(limits.bajoCritico)) return `Bajo crítico ≤ ${limits.bajoCritico}`;
  if (value < Number(limits.bajoAlerta)) return `Bajo alerta < ${limits.bajoAlerta}`;
  if (value >= Number(limits.altoCritico)) return `Alto crítico ≥ ${limits.altoCritico}`;
  return `Alto alerta > ${limits.altoAlerta}`;
}

function parseDateTime(dateValue, timeValue) {
  const dateText = cleanText(dateValue);
  const timeText = cleanText(timeValue);
  let year;
  let month;
  let day;
  const match = dateText.match(/^(\d{1,4})[\/.-](\d{1,2})[\/.-](\d{1,4})$/);
  if (!match) throw new Error("Fecha inválida.");

  if (match[1].length === 4) {
    [, year, month, day] = match.map(Number);
  } else {
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  }
  if (year < 100) year += 2000;

  const timeMatch = timeText.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!timeMatch) throw new Error("Hora inválida. Use HH:mm o HH:mm:ss.");
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] || 0);
  const date = new Date(year, month - 1, day, hour, minute, second);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day
    || hour > 23 || minute > 59 || second > 59) {
    throw new Error("Fecha u hora fuera de rango.");
  }
  return date;
}

function parseNumber(value, column) {
  const text = cleanText(value);
  if (!text) throw new Error(`${column}: valor numérico requerido.`);
  const normalized = text.replace(/\s/g, "").replace(",", ".");
  const number = Number(normalized);
  if (!Number.isFinite(number)) throw new Error(`${column}: número inválido.`);
  return number;
}

function hasColumn(rows, expected) {
  return Object.keys(rows[0] || {}).some((header) => normalizeHeader(header) === normalizeHeader(expected));
}

function normalizeHeader(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function normalizeText(value) {
  return cleanText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function formatDate(date) {
  return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function updateProgress(elements, percent, label) {
  const safePercent = Math.max(0, Math.min(100, percent));
  elements.progress.value = safePercent;
  elements.progress.textContent = `${safePercent} %`;
  elements.progressPercent.textContent = `${safePercent} %`;
  elements.progressLabel.textContent = label;
}

function renderResults(elements, total, success, errors, elapsedMs) {
  elements.summary.classList.remove("is-hidden");
  elements.total.textContent = total;
  elements.success.textContent = success;
  elements.errorCount.textContent = errors.length;
  elements.elapsed.textContent = elapsedMs < 1000 ? `${Math.round(elapsedMs)} ms` : `${(elapsedMs / 1000).toFixed(1)} s`;
  elements.errorsPanel.classList.toggle("is-hidden", !errors.length);
  elements.errorsBody.innerHTML = errors.map((error) => (
    `<tr><td>${escapeHtml(error.row)}</td><td>${escapeHtml(error.detail)}</td></tr>`
  )).join("");
}

function resetResults(elements) {
  elements.progressPanel.classList.remove("is-hidden");
  elements.summary.classList.add("is-hidden");
  elements.errorsPanel.classList.add("is-hidden");
  elements.errorsBody.innerHTML = "";
}

function setBusy(elements, busy) {
  elements.file.disabled = busy;
  elements.startButton.disabled = busy || !elements.file.files[0];
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getElements() {
  return {
    file: document.getElementById("bulkImportFile"),
    startButton: document.getElementById("startBulkImportButton"),
    fileInfo: document.getElementById("bulkImportFileInfo"),
    progressPanel: document.getElementById("bulkImportProgressPanel"),
    progress: document.getElementById("bulkImportProgress"),
    progressLabel: document.getElementById("bulkImportProgressLabel"),
    progressPercent: document.getElementById("bulkImportProgressPercent"),
    summary: document.getElementById("bulkImportSummary"),
    total: document.getElementById("bulkImportTotal"),
    success: document.getElementById("bulkImportSuccess"),
    errorCount: document.getElementById("bulkImportErrorCount"),
    elapsed: document.getElementById("bulkImportElapsed"),
    errorsPanel: document.getElementById("bulkImportErrorsPanel"),
    errorsBody: document.getElementById("bulkImportErrorsBody")
  };
}
