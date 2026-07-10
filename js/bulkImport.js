import { Timestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAlarmConfig } from "./alarmAdmin.js?v=20260709-6";
import { insertImportedRecords } from "./firestoreService.js?v=20260709-7";
import { clientConfig } from "./clientConfig.js";

const ENTREFASES_PROFILE_ID = "entrefases";
const ENTREFASES_AREA = "Planta Entrefases";
const ENTREFASES_SUBAREA = "Entrefases";
const ENTREFASES_PREFERRED_SHEET = "BD_Estructura_Ancha";
const ENTREFASES_COLUMNS = [
  "FECHA_HORA",
  "BBA_110_ESTADO",
  "BBA_110_FLUJO_M3H",
  "BBA_110_VDF_PORCENTAJE",
  "BBA_110_AMP",
  "BBA_110_HZ",
  "BBA_100_ESTADO",
  "BBA_100_FLUJO_M3H",
  "PISCINA_PLS_NIVEL_PORCENTAJE",
  "PISCINA_ILS_NIVEL_PORCENTAJE",
  "BBA_FLOTANTE_PLS_VDF_PORCENTAJE",
  "BBA_FLOTANTE_PLS_AMP"
];
const ENTREFASES_MAPPING = {
  BBA_110_ESTADO: "bba110Estado",
  BBA_110_FLUJO_M3H: "bba110Flujo",
  BBA_110_VDF_PORCENTAJE: "bba110Vdf",
  BBA_110_AMP: "bba110Amp",
  BBA_110_HZ: "bba110Hz",
  BBA_100_ESTADO: "bba100Estado",
  BBA_100_FLUJO_M3H: "bba100Flujo",
  PISCINA_PLS_NIVEL_PORCENTAJE: "piscinaPlsNivel",
  PISCINA_ILS_NIVEL_PORCENTAJE: "piscinaIlsNivel",
  BBA_FLOTANTE_PLS_VDF_PORCENTAJE: "bbaFlotantePlsVdf",
  BBA_FLOTANTE_PLS_AMP: "bbaFlotantePlsAmp"
};
const EXPECTED_COLUMNS = [
  "fecha", "hora", "turno", "area", "subarea", "operador",
  ...clientConfig.variables.map((variable) => variable.key), "observacion"
];
const REQUIRED_COLUMNS = ["fecha", "hora", "subarea"];
const VALID_SUBAREAS = new Map(clientConfig.equipment
  .filter((item) => item.tipo === "pila")
  .flatMap((item) => [item.nombre, ...(item.aliases || [])]
    .map((alias) => [normalizeText(alias), item.nombre])));
const SEVERITY_RANK = { Normal: 0, Alerta: 1, "Crítico": 2 };

let preparedImport = null;

export function initBulkImport() {
  const elements = getElements();
  if (!elements.file || !elements.startButton) return;

  elements.file.addEventListener("change", () => {
    preparedImport = null;
    resetResults(elements);
    const file = elements.file.files[0];
    const validType = file && /\.(xlsx|csv)$/i.test(file.name);
    elements.startButton.disabled = !validType;
    elements.fileInfo.textContent = validType
      ? `${file.name} · ${formatBytes(file.size)}`
      : file ? "Formato no válido. Seleccione un archivo .xlsx o .csv." : "Seleccione un archivo para comenzar.";
  });
  elements.startButton.addEventListener("click", () => prepareFile(elements));
  elements.cancelConfirmButton?.addEventListener("click", () => closeConfirm(elements));
  elements.confirmButton?.addEventListener("click", () => importPreparedRecords(elements));
}

async function prepareFile(elements) {
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
    updateProgress(elements, 4, "Leyendo archivo...");
    const workbookData = await readWorkbookData(file);
    if (!workbookData.rows.length) throw new Error("El archivo no contiene registros.");

    const config = getAlarmConfig();
    const preparation = isEntrefasesWideSheet(workbookData.rows)
      ? prepareEntrefasesRecords(workbookData, config)
      : prepareGenericRecords(workbookData, config);
    preparedImport = {
      ...preparation,
      elapsedMs: performance.now() - startedAt,
      fileName: file.name
    };

    renderPreparedSummary(elements, preparedImport);
    updateProgress(elements, 100, preparedImport.errors.length
      ? "Validación finalizada con errores."
      : "Validación finalizada. Confirme para importar.");
    if (preparedImport.errors.length) {
      elements.fileInfo.textContent = "No se importará porque existen errores de estructura o datos.";
      return;
    }

    elements.fileInfo.textContent = `${preparedImport.validRecords.length} registros preparados para ${clientConfig.clientProfile.cliente}.`;
    openConfirm(elements, preparedImport);
  } catch (error) {
    console.error("Error preparando importación masiva:", error);
    elements.fileInfo.textContent = error.message || "No se pudo procesar el archivo.";
    renderPreparedSummary(elements, {
      sheetName: "--",
      totalRows: 0,
      validRecords: [],
      errors: [{ row: "-", detail: error.message }],
      elapsedMs: performance.now() - startedAt
    });
    updateProgress(elements, 0, "Importación cancelada.");
  } finally {
    setBusy(elements, false);
  }
}

async function importPreparedRecords(elements) {
  if (!preparedImport || preparedImport.errors.length || !preparedImport.validRecords.length) return;

  closeConfirm(elements);
  setBusy(elements, true);
  elements.confirmButton.disabled = true;

  try {
    updateProgress(elements, 5, "Buscando duplicados existentes...");
    const result = await insertImportedRecords(preparedImport.validRecords, (inserted, total, duplicates) => {
      const percent = 10 + Math.round(((inserted + duplicates) / total) * 90);
      updateProgress(elements, percent, `Subiendo ${inserted} registros; ${duplicates} duplicados omitidos...`);
    });
    preparedImport.inserted = result.inserted;
    preparedImport.duplicates = result.duplicates;
    renderPreparedSummary(elements, preparedImport);
    updateProgress(elements, 100, "Importación finalizada.");
    elements.fileInfo.textContent = `${result.inserted} registros importados. ${result.duplicates} duplicados omitidos.`;
  } catch (error) {
    console.error("Error importando registros preparados:", error);
    elements.fileInfo.textContent = error.message || "No se pudo importar el archivo.";
    updateProgress(elements, 0, "Importación cancelada.");
  } finally {
    elements.confirmButton.disabled = false;
    setBusy(elements, false);
  }
}

async function readWorkbookData(file) {
  const data = await file.arrayBuffer();
  const workbook = window.XLSX.read(data, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames.includes(ENTREFASES_PREFERRED_SHEET)
    ? ENTREFASES_PREFERRED_SHEET
    : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { sheetName: "--", rows: [] };
  return {
    sheetName,
    rows: window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true, dateNF: "yyyy-mm-dd hh:mm:ss" })
  };
}

function prepareEntrefasesRecords(workbookData, config) {
  if (clientConfig.profileId !== ENTREFASES_PROFILE_ID) {
    throw new Error(`El perfil operacional activo debe ser ${ENTREFASES_PROFILE_ID}. Perfil actual: ${clientConfig.profileId}.`);
  }

  const missing = ENTREFASES_COLUMNS.filter((column) => !hasColumn(workbookData.rows, column));
  if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(", ")}.`);

  const validRecords = [];
  const errors = [];

  workbookData.rows.forEach((sourceRow, index) => {
    const rowNumber = index + 2;
    try {
      const row = normalizeSourceRow(sourceRow);
      validRecords.push(buildEntrefasesRecord(row, config));
    } catch (error) {
      errors.push({ row: rowNumber, detail: error.message });
    }
    updateProgress(getElements(), Math.round(((index + 1) / workbookData.rows.length) * 70), `Validando fila ${index + 1} de ${workbookData.rows.length}...`);
  });

  return {
    mode: "entrefases",
    sheetName: workbookData.sheetName,
    totalRows: workbookData.rows.length,
    validRecords,
    errors
  };
}

function prepareGenericRecords(workbookData, config) {
  const missing = REQUIRED_COLUMNS.filter((column) => !hasColumn(workbookData.rows, column));
  if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(", ")}.`);

  const validRecords = [];
  const errors = [];

  workbookData.rows.forEach((sourceRow, index) => {
    const rowNumber = index + 2;
    try {
      const normalized = normalizeGenericRow(sourceRow);
      validRecords.push(buildGenericRecord(normalized, config));
    } catch (error) {
      errors.push({ row: rowNumber, detail: error.message });
    }
    updateProgress(getElements(), Math.round(((index + 1) / workbookData.rows.length) * 70), `Validando fila ${index + 1} de ${workbookData.rows.length}...`);
  });

  return {
    mode: "generic",
    sheetName: workbookData.sheetName,
    totalRows: workbookData.rows.length,
    validRecords,
    errors
  };
}

function buildEntrefasesRecord(row, config) {
  const date = parseFlexibleDateTime(row.FECHA_HORA);
  const values = {};

  Object.entries(ENTREFASES_MAPPING).forEach(([sourceKey, targetKey]) => {
    const variable = clientConfig.variableMap[targetKey];
    values[targetKey] = variable?.tipo === "estado"
      ? cleanText(row[sourceKey])
      : parseNumber(row[sourceKey], sourceKey);
  });

  const alarmasActivas = buildEntrefasesAlarms(values, config);
  const estado = getWorstSeverity(alarmasActivas);

  return {
    clienteId: clientConfig.clienteId,
    profileId: clientConfig.profileId,
    area: ENTREFASES_AREA,
    subarea: ENTREFASES_SUBAREA,
    proceso: ENTREFASES_AREA,
    fecha: formatDate(date),
    hora: formatTime(date),
    turno: isShiftA(date) ? "A" : "B",
    timestampCreacion: Timestamp.fromDate(date),
    ...values,
    estado,
    alarmasActivas
  };
}

function buildGenericRecord(row, config) {
  const date = parseDateTime(row.fecha, row.hora);
  const subarea = VALID_SUBAREAS.get(normalizeText(row.subarea));
  if (!subarea) throw new Error(`Subárea inválida. Use: ${[...new Set(VALID_SUBAREAS.values())].join(", ")}.`);

  const values = {};
  clientConfig.variables.forEach((variable) => {
    values[variable.key] = variable.tipo === "estado"
      ? cleanText(row[variable.key])
      : parseNumber(row[variable.key], variable.key);
  });

  const alarmasActivas = buildGenericAlarms(values, subarea, config, row.observacion);
  const estado = getWorstSeverity(alarmasActivas);

  return {
    clienteId: clientConfig.clienteId,
    profileId: clientConfig.profileId,
    fecha: formatDate(date),
    hora: formatTime(date),
    turno: cleanText(row.turno),
    area: cleanText(row.area) || clientConfig.identity.proceso,
    subarea,
    operador: cleanText(row.operador),
    ...values,
    observacion: cleanText(row.observacion),
    timestampCreacion: Timestamp.fromDate(date),
    estado,
    alarmasActivas
  };
}

function buildEntrefasesAlarms(values, config) {
  const profileAlarms = clientConfig.profileDocuments.alarms || {};
  const numericRules = new Map((profileAlarms.variables || []).map((rule) => [rule.variable || rule.key, rule]));
  const stateRules = profileAlarms.estados || [];
  const alarms = [];

  Object.entries(values).forEach(([key, value]) => {
    const variable = clientConfig.variableMap[key] || {};
    if (variable.tipo === "estado") {
      const matchedRule = stateRules.find((rule) =>
        rule.variable === key && normalizeText(rule.valor) === normalizeText(value)
      );
      if (matchedRule) {
        alarms.push({
          variable: key,
          nombre: variable.nombre || key,
          valor: cleanText(value),
          unidad: variable.unidad || "",
          severidad: normalizeSeverity(matchedRule.severidad),
          tipoLimite: `Estado ${matchedRule.valor}`,
          activo: ENTREFASES_SUBAREA,
          variableId: key,
          limiteSuperado: `Estado ${matchedRule.valor}`
        });
      }
      return;
    }

    const limits = numericRules.get(key) || config?.[key];
    if (!limits) return;
    const severity = evaluateNumericLimit(value, limits);
    if (severity === "Normal") return;
    const tipoLimite = describeLimitType(value, limits);
    alarms.push({
      variable: key,
      nombre: limits.nombre || variable.nombre || key,
      valor: value,
      unidad: limits.unidad || variable.unidad || "",
      severidad: severity,
      tipoLimite,
      activo: ENTREFASES_SUBAREA,
      variableId: key,
      limiteSuperado: tipoLimite
    });
  });

  return alarms;
}

function buildGenericAlarms(values, subarea, config, observation) {
  return clientConfig.variables.flatMap((variable) => {
    if (variable.tipo === "estado") return [];
    const limits = config?.[variable.key];
    if (!limits) return [];

    const severity = evaluateNumericLimit(values[variable.key], limits);
    if (severity === "Normal") return [];
    const tipoLimite = describeLimitType(values[variable.key], limits);

    return [{
      activo: subarea,
      variable: limits.nombre || variable.nombre || variable.key,
      nombre: limits.nombre || variable.nombre || variable.key,
      variableId: variable.key,
      valor: values[variable.key],
      unidad: limits.unidad || variable.unidad || "",
      limiteSuperado: tipoLimite,
      tipoLimite,
      severidad: severity,
      observacion: cleanText(observation)
    }];
  });
}

function evaluateNumericLimit(value, limits) {
  if (value <= Number(limits.bajoCritico) || value >= Number(limits.altoCritico)) return "Crítico";
  if (value < Number(limits.bajoAlerta) || value > Number(limits.altoAlerta)) return "Alerta";
  return "Normal";
}

function describeLimitType(value, limits) {
  if (value <= Number(limits.bajoCritico)) return `bajoCritico <= ${limits.bajoCritico}`;
  if (value < Number(limits.bajoAlerta)) return `bajoAlerta < ${limits.bajoAlerta}`;
  if (value >= Number(limits.altoCritico)) return `altoCritico >= ${limits.altoCritico}`;
  return `altoAlerta > ${limits.altoAlerta}`;
}

function getWorstSeverity(alarms) {
  return alarms.reduce((worst, alarm) => (
    SEVERITY_RANK[alarm.severidad] > SEVERITY_RANK[worst] ? alarm.severidad : worst
  ), "Normal");
}

function normalizeGenericRow(sourceRow) {
  const byNormalizedHeader = normalizeSourceRow(sourceRow);
  const row = {};
  EXPECTED_COLUMNS.forEach((column) => {
    row[column] = byNormalizedHeader[column] ?? byNormalizedHeader[normalizeHeader(column)] ?? "";
  });
  return row;
}

function normalizeSourceRow(sourceRow) {
  return Object.entries(sourceRow).reduce((result, [key, value]) => {
    result[cleanText(key)] = value;
    result[normalizeHeader(key)] = value;
    return result;
  }, {});
}

function isEntrefasesWideSheet(rows) {
  return clientConfig.profileId === ENTREFASES_PROFILE_ID && hasColumn(rows, "FECHA_HORA");
}

function hasColumn(rows, expected) {
  return Object.keys(rows[0] || {}).some((header) => normalizeHeader(header) === normalizeHeader(expected));
}

function parseFlexibleDateTime(value) {
  if (value instanceof Date) return assertValidDate(value);
  if (typeof value === "number") {
    const parsed = window.XLSX.SSF.parse_date_code(value);
    if (!parsed) throw new Error("FECHA_HORA inválida.");
    return assertValidDate(new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S)));
  }
  const text = cleanText(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    || text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error("FECHA_HORA inválida.");
  const date = match[1].length === 4
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] || 0))
    : new Date(Number(match[3]) < 100 ? Number(match[3]) + 2000 : Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4]), Number(match[5]), Number(match[6] || 0));
  return assertValidDate(date);
}

function parseDateTime(dateValue, timeValue) {
  return parseFlexibleDateTime(`${cleanText(dateValue)} ${cleanText(timeValue)}`);
}

function assertValidDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error("Fecha u hora fuera de rango.");
  return date;
}

function parseNumber(value, column) {
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    throw new Error(`${column}: número inválido.`);
  }
  const text = cleanText(value);
  if (!text) throw new Error(`${column}: valor numérico requerido.`);
  const normalized = text.replace(/\s/g, "").replace(",", ".");
  const number = Number(normalized);
  if (!Number.isFinite(number)) throw new Error(`${column}: número inválido.`);
  return number;
}

function isShiftA(date) {
  return date.getHours() < 20
    || (date.getHours() === 20 && date.getMinutes() === 0 && date.getSeconds() === 0);
}

function openConfirm(elements, preparation) {
  if (!elements.confirmOverlay) return;
  elements.confirmMessage.textContent = `Se importarán ${preparation.validRecords.length} registros validados desde la hoja ${preparation.sheetName}. No se borrarán datos existentes y los duplicados se omitirán por clienteId + timestampCreacion.`;
  elements.confirmOverlay.classList.remove("is-hidden");
  elements.confirmOverlay.setAttribute("aria-hidden", "false");
}

function closeConfirm(elements) {
  elements.confirmOverlay?.classList.add("is-hidden");
  elements.confirmOverlay?.setAttribute("aria-hidden", "true");
}

function renderPreparedSummary(elements, preparation) {
  elements.summary.classList.remove("is-hidden");
  elements.sheet.textContent = preparation.sheetName || "--";
  elements.total.textContent = preparation.totalRows || 0;
  elements.success.textContent = preparation.validRecords?.length || 0;
  elements.errorCount.textContent = preparation.errors?.length || 0;
  elements.duplicates.textContent = preparation.duplicates ?? "--";
  elements.inserted.textContent = preparation.inserted ?? "--";
  elements.elapsed.textContent = formatElapsed(preparation.elapsedMs || 0);
  elements.previewPanel.classList.toggle("is-hidden", !preparation.validRecords?.length);
  if (preparation.validRecords?.length) {
    elements.firstPreview.textContent = JSON.stringify(toPreviewRecord(preparation.validRecords[0]), null, 2);
    elements.lastPreview.textContent = JSON.stringify(toPreviewRecord(preparation.validRecords.at(-1)), null, 2);
  }
  elements.errorsPanel.classList.toggle("is-hidden", !preparation.errors?.length);
  elements.errorsBody.innerHTML = (preparation.errors || []).map((error) => (
    `<tr><td>${escapeHtml(error.row)}</td><td>${escapeHtml(error.detail)}</td></tr>`
  )).join("");
}

function toPreviewRecord(record) {
  return {
    ...record,
    timestampCreacion: record.timestampCreacion?.toDate
      ? record.timestampCreacion.toDate().toISOString()
      : record.timestampCreacion
  };
}

function resetResults(elements) {
  elements.progressPanel.classList.add("is-hidden");
  elements.summary.classList.add("is-hidden");
  elements.errorsPanel.classList.add("is-hidden");
  elements.previewPanel?.classList.add("is-hidden");
  elements.errorsBody.innerHTML = "";
}

function setBusy(elements, busy) {
  elements.file.disabled = busy;
  elements.startButton.disabled = busy || !elements.file.files[0];
}

function updateProgress(elements, percent, label) {
  const safePercent = Math.max(0, Math.min(100, percent));
  elements.progressPanel.classList.remove("is-hidden");
  elements.progress.value = safePercent;
  elements.progress.textContent = `${safePercent} %`;
  elements.progressPercent.textContent = `${safePercent} %`;
  elements.progressLabel.textContent = label;
}

function formatDate(date) {
  return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatElapsed(elapsedMs) {
  return elapsedMs < 1000 ? `${Math.round(elapsedMs)} ms` : `${(elapsedMs / 1000).toFixed(1)} s`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function normalizeHeader(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function normalizeText(value) {
  return cleanText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function normalizeSeverity(value) {
  return normalizeText(value) === "critico" ? "Crítico" : "Alerta";
}

function cleanText(value) {
  return String(value ?? "").trim();
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
    sheet: document.getElementById("bulkImportSheet"),
    total: document.getElementById("bulkImportTotal"),
    success: document.getElementById("bulkImportSuccess"),
    errorCount: document.getElementById("bulkImportErrorCount"),
    duplicates: document.getElementById("bulkImportDuplicates"),
    inserted: document.getElementById("bulkImportInserted"),
    elapsed: document.getElementById("bulkImportElapsed"),
    previewPanel: document.getElementById("bulkImportPreviewPanel"),
    firstPreview: document.getElementById("bulkImportFirstPreview"),
    lastPreview: document.getElementById("bulkImportLastPreview"),
    errorsPanel: document.getElementById("bulkImportErrorsPanel"),
    errorsBody: document.getElementById("bulkImportErrorsBody"),
    confirmOverlay: document.getElementById("bulkImportConfirmOverlay"),
    confirmMessage: document.getElementById("bulkImportConfirmMessage"),
    confirmButton: document.getElementById("confirmBulkImportButton"),
    cancelConfirmButton: document.getElementById("cancelBulkImportButton")
  };
}
