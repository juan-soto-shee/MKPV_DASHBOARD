import {
  collection,
  getDoc,
  getDocs,
  limit,
  query,
  startAfter,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./firebaseConfig.js";
import { clientConfig } from "./clientConfig.js";
import { invalidateRecordsCache } from "./firestoreService.js?v=20260710-2";
import { verifyAdminPassword } from "./alarmAdmin.js?v=20260710-2";

const DEMO_IMPLEMENTATION = "demo_lixiviacion";
const PAGE_SIZE = 450;
const BATCH_SIZE = 400;
const LEACH_FIELDS = ["flujoPLS", "flujoRefino", "acidezRefino", "cuPls", "nivelPiscinaPLS", "nivelPiscinaRefino"];
const INTERFACE_FIELDS = ["nivelInterfase", "presionInterfase", "espesorInterfase", "interfase", "interfaceLevel", "interfacePressure"];

let inspection = null;
let cleaning = false;

export function initLegacyCleanup({ refreshDashboard } = {}) {
  const elements = getElements();
  if (!elements.section) return;
  const isDemo = clientConfig.implementationId === DEMO_IMPLEMENTATION
    && clientConfig.clienteId === DEMO_IMPLEMENTATION;
  elements.section.classList.toggle("is-hidden", !isDemo);
  if (!isDemo) return;

  elements.inspectButton.addEventListener("click", () => inspectLegacy(elements));
  elements.cleanButton.addEventListener("click", () => openConfirmation(elements));
  elements.cancelButton.addEventListener("click", () => closeConfirmation(elements));
  elements.continueButton.addEventListener("click", () => continueConfirmation(elements, refreshDashboard));
}

async function inspectLegacy(elements) {
  setBusy(elements, true);
  setMessage(elements, "Revisando registros de forma puntual. No se eliminará ningún documento...");
  inspection = null;
  elements.preview.classList.add("is-hidden");
  try {
    const records = await scanAllRecords();
    inspection = classify(records);
    elements.checked.textContent = inspection.checked;
    elements.found.textContent = inspection.legacyDemo.length;
    elements.doubtful.textContent = inspection.doubtful.length;
    elements.protected.textContent = inspection.protected.length;
    elements.preview.classList.remove("is-hidden");
    elements.cleanButton.disabled = !inspection.legacyDemo.length;
    setMessage(elements, `Detección finalizada: ${inspection.legacyDemo.length} datos legacy de demo encontrados.`, "success");
  } catch (error) {
    console.error("No se pudieron detectar datos legacy:", error);
    setMessage(elements, `No se pudo completar la detección: ${error.message}`, "error");
  } finally {
    setBusy(elements, false);
  }
}

async function scanAllRecords() {
  const records = [];
  let lastDocument = null;
  do {
    const constraints = lastDocument
      ? [startAfter(lastDocument), limit(PAGE_SIZE)]
      : [limit(PAGE_SIZE)];
    const snapshot = await getDocs(query(
      collection(db, clientConfig.identity.firebase.coleccionRegistros),
      ...constraints
    ));
    snapshot.docs.forEach((document) => records.push({ ref: document.ref, data: document.data() }));
    lastDocument = snapshot.docs.at(-1) || null;
    if (snapshot.size < PAGE_SIZE) break;
  } while (lastDocument);
  return records;
}

function classify(records) {
  const result = { checked: records.length, legacyDemo: [], doubtful: [], protected: [] };
  records.forEach((record) => {
    if (Object.hasOwn(record.data, "clienteId")) {
      result.protected.push(record);
    } else if (isClearlyLegacyDemo(record.data)) {
      result.legacyDemo.push(record);
    } else {
      result.doubtful.push(record);
    }
  });
  return result;
}

function isClearlyLegacyDemo(data) {
  const matchingFields = LEACH_FIELDS.filter((field) => Object.hasOwn(data, field)).length;
  const area = normalize(data.area || data.proceso || data.planta || data.subarea);
  const isLeach = area.includes("lixiviacion") || area.includes("leach");
  const hasInterfaceData = INTERFACE_FIELDS.some((field) => Object.hasOwn(data, field))
    || Object.keys(data).some((key) => normalize(key).includes("entrefase") || normalize(key).includes("interfase"));
  return matchingFields >= 2 && isLeach && !hasInterfaceData;
}

function openConfirmation(elements) {
  if (!inspection?.legacyDemo.length || cleaning) return;
  elements.overlay.classList.remove("is-hidden");
  elements.overlay.setAttribute("aria-hidden", "false");
  elements.passwordStage.classList.add("is-hidden");
  elements.password.value = "";
  elements.dialogMessage.textContent = `¿Desea eliminar ${inspection.legacyDemo.length} registros legacy artificiales de la demo?`;
  elements.continueButton.dataset.stage = "question";
  elements.continueButton.textContent = "Sí, continuar";
}

async function continueConfirmation(elements, refreshDashboard) {
  if (elements.continueButton.dataset.stage === "question") {
    elements.passwordStage.classList.remove("is-hidden");
    elements.continueButton.dataset.stage = "password";
    elements.continueButton.textContent = "Eliminar datos legacy";
    elements.dialogMessage.textContent = "Confirme nuevamente la contraseña administrativa.";
    elements.password.focus();
    return;
  }
  if (!verifyAdminPassword(elements.password.value)) {
    elements.dialogMessage.textContent = "Contraseña incorrecta. No se eliminó ningún documento.";
    return;
  }
  closeConfirmation(elements);
  await cleanLegacy(elements, refreshDashboard);
}

async function cleanLegacy(elements, refreshDashboard) {
  cleaning = true;
  setBusy(elements, true);
  let deleted = 0;
  let errors = 0;
  let protectedSinceInspection = 0;
  for (let start = 0; start < inspection.legacyDemo.length; start += BATCH_SIZE) {
    const chunk = inspection.legacyDemo.slice(start, start + BATCH_SIZE);
    const currentSnapshots = await Promise.allSettled(chunk.map((record) => getDoc(record.ref)));
    const safeRecords = chunk.filter((record, index) => {
      const result = currentSnapshots[index];
      if (result.status === "rejected") {
        errors += 1;
        console.error("No se pudo revalidar un documento legacy:", result.reason);
        return false;
      }
      const snapshot = result.value;
      if (!snapshot.exists()) return false;
      const currentData = snapshot.data();
      const safe = !Object.hasOwn(currentData, "clienteId") && isClearlyLegacyDemo(currentData);
      if (!safe) protectedSinceInspection += 1;
      return safe;
    });
    if (!safeRecords.length) continue;
    const batch = writeBatch(db);
    safeRecords.forEach((record) => batch.delete(record.ref));
    try {
      await batch.commit();
      deleted += safeRecords.length;
    } catch (error) {
      errors += safeRecords.length;
      console.error("No se pudo eliminar un lote de datos legacy:", error);
    }
    setMessage(elements, `Procesados ${Math.min(start + chunk.length, inspection.legacyDemo.length)} de ${inspection.legacyDemo.length}...`);
  }
  if (deleted) {
    invalidateRecordsCache();
    await refreshDashboard?.();
  }
  setMessage(elements, `Limpieza terminada: ${deleted} eliminados, ${errors} con error, ${protectedSinceInspection} protegidos por cambios posteriores.`, errors ? "error" : "success");
  inspection = null;
  cleaning = false;
  setBusy(elements, false);
}

function setBusy(elements, busy) {
  elements.inspectButton.disabled = busy;
  if (busy) elements.cleanButton.disabled = true;
  else if (inspection && !cleaning) elements.cleanButton.disabled = !inspection.legacyDemo.length;
}

function setMessage(elements, message, type = "") {
  elements.message.textContent = message;
  elements.message.className = `admin-message${type ? ` ${type}` : ""}`;
}

function closeConfirmation(elements) {
  elements.overlay.classList.add("is-hidden");
  elements.overlay.setAttribute("aria-hidden", "true");
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function getElements() {
  const byId = (id) => document.getElementById(id);
  return {
    section: byId("legacyCleanupSection"), inspectButton: byId("inspectLegacyButton"), cleanButton: byId("cleanLegacyButton"),
    message: byId("legacyCleanupMessage"), preview: byId("legacyCleanupPreview"), checked: byId("legacyChecked"),
    found: byId("legacyFound"), doubtful: byId("legacyDoubtful"), protected: byId("legacyProtected"),
    overlay: byId("legacyCleanupOverlay"), passwordStage: byId("legacyCleanupPasswordStage"), password: byId("legacyCleanupPasswordInput"),
    dialogMessage: byId("legacyCleanupDialogMessage"), cancelButton: byId("cancelLegacyCleanup"), continueButton: byId("continueLegacyCleanup")
  };
}
