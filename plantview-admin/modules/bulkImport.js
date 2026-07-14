import { addDoc, collection, doc, getCountFromServer, query, serverTimestamp, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const ADMIN_ROLE = "metkinetics_admin";
const CONFIG_ROOT = new URL("../../config/customers/", import.meta.url);

const CLIENTS = { demo_lixiviacion: "Demo Lixiviación", solmin_mantos_blancos: "Solmin Mantos Blancos" };
const NUMERIC_FIELDS = ["flujoPLS", "flujoRefino", "acidezRefino", "cuPls", "nivelPiscinaRefino", "nivelPiscinaPLS"];
const FIELD_ALIASES = {
  fecha: "fecha", hora: "hora", turno: "turno", area: "area", subarea: "subarea", operador: "operador",
  flujopls: "flujoPLS", flujorefino: "flujoRefino", acidezrefino: "acidezRefino", cupls: "cuPls",
  nivelpiscinarefino: "nivelPiscinaRefino", nivelpiscinorefino: "nivelPiscinaRefino",
  nivelpiscinapls: "nivelPiscinaPLS", observacion: "observacion",
  estado: "estado", timestampcreacion: "timestampCreacion"
};
const IDS = ["adminHome","deleteHistorySection","bulkImportSection","bulkImportNav","bulkImportClient","bulkImportFile","validateBulkImportButton","bulkImportMessage","bulkImportPreview","importFileName","importClientName","importTotalRows","importValidRows","importErrorRows","importWarningRows","importOldestDate","importNewestDate","bulkImportPreviewBody","bulkImportCountCard","countClientName","currentFirestoreCount","validImportCount","expectedFirestoreCount","bulkImportCountMessage","importRecordsButton","downloadImportReportButton","bulkImportResult","resultImported","resultRejected","resultWarnings","resultBatches","resultClient","resultDate"];

export function initializeBulkImport(db, initialAdmin) {
  const el = Object.fromEntries(IDS.map((id) => [id, document.getElementById(id)]));
  let admin = initialAdmin, implementation = null, processed = [], validRecords = [], busy = false, fileName = "", clientId = "";
  const showRequestedSection = () => {
    const active = location.hash === "#importacion";
    el.bulkImportSection.hidden = !active;
    if (active) { el.adminHome.hidden = true; el.deleteHistorySection.hidden = true; }
    else if (location.hash !== "#historico") el.adminHome.hidden = false;
  };
  el.bulkImportNav.addEventListener("click", () => setTimeout(showRequestedSection));
  window.addEventListener("hashchange", showRequestedSection);
  el.validateBulkImportButton.addEventListener("click", validateFile);
  el.importRecordsButton.addEventListener("click", importRecords);
  el.downloadImportReportButton.addEventListener("click", downloadReport);
  el.bulkImportClient.addEventListener("change", clearPreparedData);
  el.bulkImportFile.addEventListener("change", clearPreparedData);

  async function validateFile() {
    if (busy) return;
    clearPreparedData();
    clientId = el.bulkImportClient.value;
    const file = el.bulkImportFile.files?.[0];
    if (!clientId) return message("Seleccione un cliente antes de validar.", true);
    if (!canImportFor(admin, clientId)) return message("Su cuenta no está autorizada para importar registros en esta implementación.", true);
    if (!file) return message("Seleccione un archivo XLSX, XLS o CSV.", true);
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return message("Archivo inválido. Use formato XLSX, XLS o CSV.", true);
    if (!window.XLSX) return message("No fue posible cargar SheetJS. Revise la conexión e intente nuevamente.", true);
    setBusy(true); message("Leyendo y validando archivo..."); fileName = file.name;
    try {
      implementation = await loadImplementation(clientId);
      const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = sheet ? window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true }) : [];
      if (!rows.length) throw new ImportError("El archivo está vacío o no contiene filas de datos.");
      const mappedRows = mapColumns(rows);
      if (!mappedRows.recognized.size) throw new ImportError("No se reconocieron columnas compatibles en el archivo.");
      processRows(mappedRows.rows);
      renderPreview();
      await updateCurrentCount();
      message(`Validación completada: ${validRecords.length} filas válidas y ${processed.filter((r) => r.status === "error").length} rechazadas.`);
    } catch (error) {
      console.error("Error al leer o validar importación:", error);
      message(error instanceof ImportError ? error.message : "No fue posible leer el archivo. Verifique que no esté dañado.", true);
    } finally { setBusy(false); }
  }

  function mapColumns(rows) {
    const recognized = new Set();
    const mapped = rows.map((source) => {
      const target = {};
      Object.entries(source).forEach(([key, value]) => { const field = FIELD_ALIASES[normalizeHeader(key)]; if (field) { target[field] = value; recognized.add(field); } });
      return target;
    });
    return { rows: mapped, recognized };
  }

  function processRows(rows) {
    const duplicateKeys = new Set();
    processed = rows.map((row, index) => {
      const rowNumber = index + 2, errors = [], warnings = [];
      const record = {
        clienteId: implementation.clienteId,
        implementationId: implementation.implementationId,
        profileId: implementation.profileId
      };
      let timestamp = parseTimestamp(row, errors);
      if (Number.isFinite(timestamp)) {
        const date = new Date(timestamp); record.timestampCreacion = timestamp; record.fecha = localDate(date); record.hora = localTime(date);
        if (timestamp > Date.now() + 60000) warnings.push("La fecha es futura.");
      }
      record.area = clean(row.area); record.subarea = clean(row.subarea);
      if (!record.area) errors.push("Área obligatoria."); if (!record.subarea) errors.push("Subárea obligatoria.");
      ["turno","operador","observacion","estado"].forEach((field) => { const value = clean(row[field]); if (value) record[field] = value; });
      let operationalCount = 0;
      NUMERIC_FIELDS.forEach((field) => {
        if (isBlank(row[field])) return;
        const value = parseDecimal(row[field]);
        if (!Number.isFinite(value)) errors.push(`${field}: valor numérico inválido.`); else { record[field] = value; operationalCount++; }
      });
      if (!operationalCount) errors.push("Debe incluir al menos una variable operacional.");
      if (!errors.length) {
        const key = `${implementation.clienteId}|${record.subarea.toLocaleLowerCase("es")}|${record.timestampCreacion}`;
        if (duplicateKeys.has(key)) { errors.push("Fila duplicada dentro del archivo."); warnings.push("No será importada."); }
        else duplicateKeys.add(key);
      }
      const status = errors.length ? "error" : warnings.length ? "warning" : "valid";
      return { rowNumber, status, errors, warnings, record };
    });
    validRecords = processed.filter((item) => item.status !== "error").map((item) => item.record);
  }

  function parseTimestamp(row, errors) {
    if (!isBlank(row.timestampCreacion)) {
      const value = Number(String(row.timestampCreacion).replace(/\s/g, "").replace(",", "."));
      if (Number.isFinite(value) && value >= 1000000000000 && !Number.isNaN(new Date(value).valueOf())) return value;
      errors.push("timestampCreacion inválido."); return NaN;
    }
    const date = parseLocalDate(row.fecha, row.hora);
    if (!date) { errors.push("Fecha u hora inválida."); return NaN; }
    return date.getTime();
  }

  function parseLocalDate(dateValue, timeValue) {
    if (dateValue instanceof Date && !Number.isNaN(dateValue.valueOf())) return withTime(dateValue, timeValue);
    if (typeof dateValue === "number" && window.XLSX?.SSF) {
      const p = window.XLSX.SSF.parse_date_code(dateValue); if (p) return makeLocal(p.y, p.m, p.d, timeValue || `${p.H}:${p.M}:${p.S}`);
    }
    const text = clean(dateValue); if (!text) return null;
    const match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/) || text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (!match) return null;
    return match[1].length === 4 ? makeLocal(+match[1], +match[2], +match[3], timeValue) : makeLocal(+match[3], +match[2], +match[1], timeValue);
  }
  function withTime(date, time) { return makeLocal(date.getFullYear(), date.getMonth() + 1, date.getDate(), time); }
  function makeLocal(y, m, d, time = "") {
    let h = 0, min = 0, sec = 0;
    if (time instanceof Date) { h = time.getHours(); min = time.getMinutes(); sec = time.getSeconds(); }
    else if (typeof time === "number" && time >= 0 && time < 1) { const total = Math.round(time * 86400); h = Math.floor(total / 3600) % 24; min = Math.floor(total / 60) % 60; sec = total % 60; }
    else if (clean(time)) { const p = clean(time).match(/^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(AM|PM)?$/i); if (!p) return null; h = +p[1]; min = +(p[2] || 0); sec = +(p[3] || 0); if (p[4]) h = h % 12 + (p[4].toUpperCase() === "PM" ? 12 : 0); }
    const result = new Date(y, m - 1, d, h, min, sec);
    return result.getFullYear() === y && result.getMonth() === m - 1 && result.getDate() === d && result.getHours() === h ? result : null;
  }

  function renderPreview() {
    const errors = processed.filter((r) => r.status === "error").length, warnings = processed.filter((r) => r.warnings.length).length;
    const dates = validRecords.map((r) => r.timestampCreacion).sort((a,b) => a-b);
    el.importFileName.textContent = fileName; el.importClientName.textContent = CLIENTS[clientId]; el.importTotalRows.textContent = processed.length; el.importValidRows.textContent = validRecords.length; el.importErrorRows.textContent = errors; el.importWarningRows.textContent = warnings;
    el.importOldestDate.textContent = dates.length ? new Date(dates[0]).toLocaleString("es-CL") : "--"; el.importNewestDate.textContent = dates.length ? new Date(dates.at(-1)).toLocaleString("es-CL") : "--";
    el.bulkImportPreviewBody.innerHTML = processed.slice(0,20).map((item) => `<tr><td>${item.rowNumber}</td><td class="import-row-${item.status}">${statusLabel(item.status)}</td><td>${escapeHtml(item.record.fecha || "--")}</td><td>${escapeHtml(item.record.hora || "--")}</td><td>${escapeHtml(item.record.area || "--")}</td><td>${escapeHtml(item.record.subarea || "--")}</td><td>${escapeHtml([...item.errors,...item.warnings].join(" ") || "Correcto")}</td></tr>`).join("");
    el.bulkImportPreview.hidden = false; el.importRecordsButton.disabled = !validRecords.length; el.downloadImportReportButton.disabled = false;
  }

  async function updateCurrentCount() {
    el.countClientName.textContent = CLIENTS[clientId]; el.validImportCount.textContent = validRecords.length; el.currentFirestoreCount.textContent = "Consultando..."; el.expectedFirestoreCount.textContent = "--"; el.bulkImportCountMessage.textContent = ""; el.bulkImportCountCard.hidden = false;
    try {
      const countSnapshot = await getCountFromServer(query(collection(db, "leach_records"), where("clienteId", "==", implementation.clienteId)));
      const currentCount = countSnapshot.data().count;
      el.currentFirestoreCount.textContent = currentCount; el.expectedFirestoreCount.textContent = currentCount + validRecords.length;
    } catch (error) {
      console.error("No se pudo obtener el conteo actual de registros:", error);
      el.currentFirestoreCount.textContent = "--"; el.expectedFirestoreCount.textContent = "--"; el.bulkImportCountMessage.textContent = "No fue posible obtener la cantidad actual de registros.";
    }
  }

  async function importRecords() {
    if (busy || !clientId || !implementation || !validRecords.length) return;
    if (!canImportFor(admin, clientId)) return message("Su cuenta no está autorizada para importar registros en esta implementación.", true);
    if (!validRecords.every(isValidRecordIdentity)) return message("Los registros preparados no contienen una identidad de implementación válida. Valide nuevamente el archivo.", true);
    const records = [...validRecords], totalBatches = Math.ceil(records.length / 450); let imported = 0, batches = 0;
    setBusy(true); el.bulkImportResult.hidden = true;
    try {
      for (let index = 0; index < totalBatches; index++) {
        message(`Importando lote ${index + 1} de ${totalBatches}...`);
        const batch = writeBatch(db), chunk = records.slice(index * 450, (index + 1) * 450);
        chunk.forEach((record) => batch.set(doc(collection(db, "leach_records")), record)); await batch.commit(); imported += chunk.length; batches++;
      }
    } catch (error) {
      console.error("Error durante importación masiva:", error); setBusy(false); el.importRecordsButton.disabled = true;
      return message(imported ? `Importación parcial: se escribieron ${imported} registros antes del error. ${firestoreError(error)}` : firestoreError(error), true);
    }
    let auditWarning = ""; const dates = records.map((r) => r.timestampCreacion).sort((a,b) => a-b);
    const adminEmail = admin?.email || "", adminNombre = admin?.nombre || "", adminRol = admin?.rol || "";
    try {
      await addDoc(collection(db, "audit_log"), {
        accion: "importacion_masiva", adminEmail, adminNombre, adminRol,
        clienteId: implementation.clienteId, implementationId: implementation.implementationId,
        profileId: implementation.profileId, archivoNombre: fileName,
        filasTotales: processed.length, filasValidas: validRecords.length, filasImportadas: imported,
        filasRechazadas: processed.length - validRecords.length, fechaDesde: dates[0], fechaHasta: dates.at(-1),
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error("Error guardando audit_log de importación:", error);
      console.error("Código:", error?.code);
      console.error("Mensaje:", error?.message);
      auditWarning = `La importación terminó correctamente, pero no fue posible registrar la auditoría. Código: ${error?.code || "desconocido"}.`;
    }
    showResult(imported, batches); setBusy(false); el.importRecordsButton.disabled = true;
    message(auditWarning || `Se importaron correctamente ${imported} registros.`, Boolean(auditWarning));
  }

  function showResult(imported, batches) { el.resultImported.textContent=imported; el.resultRejected.textContent=processed.length-validRecords.length; el.resultWarnings.textContent=processed.filter((r)=>r.warnings.length).length; el.resultBatches.textContent=batches; el.resultClient.textContent=CLIENTS[clientId]; el.resultDate.textContent=new Date().toLocaleString("es-CL"); el.bulkImportResult.hidden=false; }
  function downloadReport() { if (!processed.length) return; const lines=[["fila","estado","mensaje","timestampCreacion","clienteId","implementationId","profileId"],...processed.map((r)=>[r.rowNumber,statusLabel(r.status),[...r.errors,...r.warnings].join(" "),r.record.timestampCreacion||"",r.record.clienteId||"",r.record.implementationId||"",r.record.profileId||""])]; const csv=lines.map((row)=>row.map(csvCell).join(",")).join("\r\n"); const url=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"})); const a=document.createElement("a"); a.href=url;a.download=`reporte-importacion-${Date.now()}.csv`;a.click();URL.revokeObjectURL(url); }
  function clearPreparedData() { if (busy) return; implementation=null;processed=[];validRecords=[];fileName="";clientId="";el.bulkImportPreview.hidden=true;el.bulkImportCountCard.hidden=true;el.bulkImportResult.hidden=true;el.importRecordsButton.disabled=true;el.downloadImportReportButton.disabled=true;message(""); }
  function setBusy(value) { busy=value;el.bulkImportClient.disabled=value;el.bulkImportFile.disabled=value;el.validateBulkImportButton.disabled=value;el.importRecordsButton.disabled=value||!validRecords.length;el.downloadImportReportButton.disabled=value||!processed.length; }
  function message(text,error=false){el.bulkImportMessage.textContent=text;el.bulkImportMessage.classList.toggle("is-error",error);}
  return { showRequestedSection, setAdmin(value){admin=value;} };
}

async function loadImplementation(selectedId) {
  const response = await fetch(new URL(`${encodeURIComponent(selectedId)}/client.json`, CONFIG_ROOT), { cache: "no-store" });
  if (!response.ok) throw new ImportError(`No se pudo cargar la configuración de la implementación (${response.status}).`);
  const config = await response.json();
  if (config.enabled !== true
    || config.implementationId !== selectedId
    || typeof config.clienteId !== "string"
    || !config.clienteId
    || typeof config.profileId !== "string"
    || !config.profileId) {
    throw new ImportError("La configuración de la implementación seleccionada no es válida.");
  }
  return Object.freeze({
    clienteId: config.clienteId,
    implementationId: config.implementationId,
    profileId: config.profileId
  });
}

function canImportFor(admin, implementationId) {
  if (admin?.rol !== ADMIN_ROLE) return false;
  const allowed = admin.implementationIds;
  return !Array.isArray(allowed) || allowed.includes("*") || allowed.includes(implementationId);
}

function isValidRecordIdentity(record) {
  return typeof record?.clienteId === "string" && Boolean(record.clienteId)
    && typeof record?.implementationId === "string" && Boolean(record.implementationId)
    && typeof record?.profileId === "string" && Boolean(record.profileId);
}

function normalizeHeader(value){return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");}
function clean(value){return String(value??"").trim();} function isBlank(value){return value===undefined||value===null||clean(value)==="";}
function parseDecimal(value){if(typeof value==="number")return value;const text=clean(value).replace(/\s/g,"");if (/^-?\d{1,3}(?:\.\d{3})*,\d+$/.test(text)) return Number(text.replace(/\./g,"").replace(",","."));return Number(text.replace(",","."));}
function localDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;} function localTime(d){return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;}
function statusLabel(s){return s==="error"?"Error":s==="warning"?"Válida con advertencia":"Válida";} function escapeHtml(v){return String(v).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]);} function csvCell(v){return `"${String(v??"").replace(/"/g,'""')}"`;}
function firestoreError(error){if(error?.code==="permission-denied")return"No tiene permisos para importar registros.";if(["unavailable","deadline-exceeded"].includes(error?.code))return"No fue posible conectar con Firestore. Revise la red.";return"Ocurrió un error al escribir en Firestore.";}
class ImportError extends Error {}
