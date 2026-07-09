import { deleteDemoRecords, insertDemoRecords } from "./firestoreService.js?v=20260708-5";

const CSV_COLUMNS = [
  "fecha",
  "hora",
  "turno",
  "area",
  "variable",
  "valor",
  "unidad",
  "operador",
  "estado",
  "causa_alarma",
  "observacion"
];

const TEMPLATE_ROWS = [
  ["2026-07-01", "08:00", "A", "Lixiviacion", "pH PLS", "1.75", "pH", "Demo Operador", "Estable", "", "Condición normal"],
  ["2026-07-01", "12:00", "A", "Lixiviacion", "Flujo de riego", "850", "m3/h", "Demo Operador", "Estable", "", "Riego estable"],
  ["2026-07-01", "16:00", "B", "Lixiviacion", "pH PLS", "2.15", "pH", "Demo Operador", "Advertencia", "Límite Preventivo Alto", "Ajustar dosificación de ácido"],
  ["2026-07-01", "20:00", "B", "Lixiviacion", "ORP", "410", "mV", "Demo Operador", "Alerta", "Bajo Límite Bajo", "Revisar condición operacional"]
];

const VARIABLE_FIELDS = {
  "flujo de riego": { field: "flujoPLS", subarea: "Pila 1" },
  "flujo pls": { field: "flujoPLS", subarea: "Pila 1" },
  "flujo refino": { field: "flujoRefino", subarea: "Piscina Refino" },
  "acidez refino": { field: "acidezRefino", subarea: "Piscina Refino" },
  "cu pls": { field: "cuPls", subarea: "Piscina PLS" },
  "cu2+ pls": { field: "cuPls", subarea: "Piscina PLS" },
  "nivel piscina pls": { field: "nivelPiscinaPLS", subarea: "Piscina PLS" },
  "nivel piscina refino": { field: "nivelPiscinaRefino", subarea: "Piscina Refino" },
  "ph pls": { field: "phPLS", subarea: "Piscina PLS" },
  "orp": { field: "orp", subarea: "Piscina PLS" },
  "fe pls": { field: "fePLS", subarea: "Piscina PLS" },
  "dosificacion acido": { field: "dosificacionAcido", subarea: "Pila 1" }
};

export function initDemoDataAdmin(elements) {
  if (!elements.downloadDemoTemplateButton) return;

  elements.downloadDemoTemplateButton.addEventListener("click", downloadDemoTemplate);
  elements.uploadDemoCsvButton.addEventListener("click", () => elements.demoCsvInput.click());
  elements.demoCsvInput.addEventListener("change", () => importSelectedCsv(elements));
  elements.generateDemoDataButton.addEventListener("click", () => generateAndUpload(elements));
  elements.deleteDemoDataButton.addEventListener("click", () => confirmAndDelete(elements));
}

function downloadDemoTemplate() {
  const rows = [CSV_COLUMNS, ...TEMPLATE_ROWS];
  const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "plantview_demo_template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importSelectedCsv(elements) {
  const file = elements.demoCsvInput.files?.[0];
  if (!file) return;

  setDemoBusy(elements, true);
  setMessage(elements, "Validando archivo CSV DEMO...");

  try {
    const text = await file.text();
    const records = parseDemoCsv(text);
    await insertDemoRecords(records, (inserted, total) => {
      setMessage(elements, `Cargando datos DEMO: ${inserted} de ${total}...`);
    });
    setMessage(elements, `${records.length} registros DEMO cargados correctamente.`, "success");
  } catch (error) {
    console.error("No se pudo cargar el CSV DEMO:", error);
    setMessage(elements, error.message || "No se pudo cargar el archivo CSV.", "error");
  } finally {
    elements.demoCsvInput.value = "";
    setDemoBusy(elements, false);
  }
}

async function generateAndUpload(elements) {
  setDemoBusy(elements, true);
  setMessage(elements, "Generando historial DEMO de 30 días...");

  try {
    const records = generateDemoRecords(30);
    await insertDemoRecords(records, (inserted, total) => {
      setMessage(elements, `Guardando datos DEMO: ${inserted} de ${total}...`);
    });
    setMessage(elements, `${records.length} registros DEMO generados correctamente.`, "success");
  } catch (error) {
    console.error("No se pudieron generar los datos DEMO:", error);
    setMessage(elements, "No se pudo generar el historial DEMO.", "error");
  } finally {
    setDemoBusy(elements, false);
  }
}

async function confirmAndDelete(elements) {
  const confirmation = window.confirm(
    "Esta acción eliminará solamente los datos de demostración. Los datos operativos reales no serán afectados. ¿Deseas continuar?"
  );
  if (!confirmation) return;

  setDemoBusy(elements, true);
  setMessage(elements, "Eliminando exclusivamente registros DEMO...");

  try {
    const deleted = await deleteDemoRecords((count) => {
      setMessage(elements, `${count} registros DEMO eliminados...`);
    });
    setMessage(elements, `${deleted} registros DEMO eliminados. Los datos reales no fueron modificados.`, "success");
  } catch (error) {
    console.error("No se pudo eliminar el historial DEMO:", error);
    setMessage(elements, "No se pudo eliminar el historial DEMO.", "error");
  } finally {
    setDemoBusy(elements, false);
  }
}

export function parseDemoCsv(text) {
  const rows = parseCsvRows(String(text || "").replace(/^\uFEFF/, ""));
  if (!rows.length) throw new Error("El archivo CSV está vacío.");

  const headers = rows[0].map((header) => normalizeText(header));
  const missing = CSV_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(", ")}.`);

  const records = rows.slice(1)
    .filter((row) => row.some((cell) => String(cell).trim()))
    .map((row, index) => csvRowToRecord(headers, row, index + 2));

  if (!records.length) throw new Error("El archivo no contiene filas de datos.");
  return records;
}

function csvRowToRecord(headers, row, lineNumber) {
  const data = Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? "").trim()]));
  const timestamp = new Date(`${data.fecha}T${data.hora}:00`);
  const value = Number(String(data.valor).replace(",", "."));
  const allowedStates = ["estable", "advertencia", "alerta"];
  const state = normalizeText(data.estado);

  if (Number.isNaN(timestamp.getTime())) throw new Error(`Fecha u hora inválida en la fila ${lineNumber}.`);
  if (!Number.isFinite(value)) throw new Error(`Valor no numérico en la fila ${lineNumber}.`);
  if (!allowedStates.includes(state)) throw new Error(`Estado inválido en la fila ${lineNumber}.`);
  if (!data.variable) throw new Error(`Variable vacía en la fila ${lineNumber}.`);

  const mapping = VARIABLE_FIELDS[normalizeText(data.variable)];
  const stateLabel = state === "estable" ? "Normal" : state === "advertencia" ? "Advertencia" : "Alerta";
  const alarm = state === "estable" ? [] : [{
    variable: data.variable,
    valor: value,
    unidad: data.unidad,
    severidad: stateLabel,
    limiteSuperado: data.causa_alarma
  }];

  return {
    fecha: data.fecha,
    hora: data.hora,
    timestampCreacion: timestamp,
    turno: data.turno,
    area: data.area,
    subarea: mapping?.subarea || data.area || "Lixiviacion",
    variable: data.variable,
    valor: value,
    unidad: data.unidad,
    operador: data.operador || "Demo Operador",
    estado: stateLabel,
    causaAlarma: data.causa_alarma,
    observacion: data.observacion,
    alarmasActivas: alarm,
    ...(mapping ? { [mapping.field]: value } : {}),
    isDemo: true
  };
}

export function generateDemoRecords(days = 30) {
  const periods = Math.max(1, Number(days)) * 6;
  const end = new Date();
  end.setMinutes(0, 0, 0);
  end.setHours(Math.floor(end.getHours() / 4) * 4);
  const start = new Date(end.getTime() - (periods - 1) * 4 * 60 * 60 * 1000);
  const records = [];

  for (let index = 0; index < periods; index += 1) {
    const timestamp = new Date(start.getTime() + index * 4 * 60 * 60 * 1000);
    const hour = timestamp.getHours();
    const subarea = `Pila ${(index % 3) + 1}`;
    const warning = index > 0 && index % 17 === 0;
    const alert = index > 0 && index % 41 === 0;
    const state = alert ? "Alerta" : warning ? "Advertencia" : "Normal";
    const cause = alert
      ? (index % 2 ? "Sobre Límite Alto" : "Bajo Límite Bajo")
      : warning
        ? (index % 2 ? "Límite Preventivo Alto" : "Límite Preventivo Bajo")
        : "";
    const flow = alert ? 520 : warning ? 620 : realisticValue(820, 55, index);
    const levelPls = alert ? 18 : warning ? 32 : realisticValue(62, 8, index + 7);
    const alarmVariable = alert ? "Nivel piscina PLS" : warning ? "Flujo de riego" : "";
    const alarmValue = alert ? levelPls : flow;
    const alarmUnit = alert ? "%" : "m3/h";

    records.push({
      fecha: formatIsoDate(timestamp),
      hora: `${String(hour).padStart(2, "0")}:00`,
      timestampCreacion: timestamp,
      turno: hour < 8 ? "C" : hour < 16 ? "A" : "B",
      area: "Lixiviacion",
      subarea,
      operador: "Demo Automático",
      estado: state,
      causaAlarma: cause,
      observacion: state === "Normal" ? "Condición operacional estable." : "Evento DEMO para presentación comercial.",
      flujoPLS: round(flow, 0),
      flujoRefino: round(realisticValue(780, 45, index + 3), 0),
      acidezRefino: round(realisticValue(8.2, 1.1, index + 5), 2),
      cuPls: round(realisticValue(1.25, 0.25, index + 9), 2),
      nivelPiscinaPLS: round(levelPls, 0),
      nivelPiscinaRefino: round(realisticValue(68, 7, index + 11), 0),
      phPLS: round(realisticValue(1.85, 0.18, index + 13), 2),
      orp: round(realisticValue(455, 24, index + 15), 0),
      fePLS: round(realisticValue(4.8, 0.7, index + 17), 2),
      dosificacionAcido: round(realisticValue(42, 5, index + 19), 1),
      variablesDemo: {
        "pH PLS": "phPLS",
        ORP: "orp",
        "Flujo de riego": "flujoPLS",
        "Nivel piscina PLS": "nivelPiscinaPLS",
        "Cu PLS": "cuPls",
        "Fe PLS": "fePLS",
        "Dosificación ácido": "dosificacionAcido"
      },
      alarmasActivas: state === "Normal" ? [] : [{
        variable: alarmVariable,
        valor: alarmValue,
        unidad: alarmUnit,
        severidad: state,
        limiteSuperado: cause,
        subarea
      }],
      isDemo: true
    });
  }

  return records;
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\"") {
      if (quoted && text[index + 1] === "\"") {
        cell += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (quoted) throw new Error("El archivo CSV contiene comillas sin cerrar.");
  return rows;
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function realisticValue(center, variation, index) {
  const wave = Math.sin(index * 0.43) * 0.65 + Math.sin(index * 0.11) * 0.35;
  const noise = (Math.random() - 0.5) * 0.3;
  return center + variation * (wave + noise);
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeText(value) {
  return String(value || "").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function setDemoBusy(elements, busy) {
  [
    elements.downloadDemoTemplateButton,
    elements.uploadDemoCsvButton,
    elements.generateDemoDataButton,
    elements.deleteDemoDataButton
  ].forEach((button) => { button.disabled = busy; });
}

function setMessage(elements, message, type = "") {
  elements.demoDataMessage.textContent = message;
  elements.demoDataMessage.className = `admin-message${type ? ` ${type}` : ""}`;
}
