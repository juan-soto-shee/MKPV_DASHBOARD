import { addDoc, collection, getDocs, query, serverTimestamp, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const CLIENTS = { demo_lixiviacion: "Demo Lixiviación", solmin_mantos_blancos: "Solmin Mantos Blancos" };
const byId = (id) => document.getElementById(id);

export function initializeDeleteHistory(db, admin) {
  const el = Object.fromEntries(["adminHome", "deleteHistorySection", "deleteHistoryNav", "deleteHistorySearchForm", "historyClient", "historyDateFrom", "historyDateTo", "searchHistoryButton", "deleteHistoryMessage", "deleteHistoryPreview", "previewClient", "previewFrom", "previewTo", "previewCount", "previewOldest", "previewNewest", "deleteHistoryButton", "deleteHistoryConfirmation", "deleteHistorySummary", "deleteHistoryConfirmationInput", "cancelHistoryDeletion", "confirmHistoryDeletion"].map((id) => [id, byId(id)]));
  let matches = [], range = null, busy = false;
  const createIndexLink = document.createElement("a");
  createIndexLink.className = "primary-button";
  createIndexLink.textContent = "Crear índice en Firebase";
  createIndexLink.target = "_blank";
  createIndexLink.rel = "noopener noreferrer";
  createIndexLink.hidden = true;
  el.deleteHistoryMessage.insertAdjacentElement("afterend", createIndexLink);

  const showRequestedSection = () => { const active = location.hash === "#historico"; el.adminHome.hidden = active; el.deleteHistorySection.hidden = !active; };
  el.deleteHistoryNav.addEventListener("click", () => setTimeout(showRequestedSection));
  window.addEventListener("hashchange", showRequestedSection);
  el.deleteHistorySearchForm.addEventListener("submit", search);
  el.deleteHistoryButton.addEventListener("click", openConfirmation);
  el.cancelHistoryDeletion.addEventListener("click", closeConfirmation);
  el.deleteHistoryConfirmationInput.addEventListener("input", updateConfirmation);
  el.confirmHistoryDeletion.addEventListener("click", remove);

  async function search(event) {
    event.preventDefault();
    if (busy) return;
    resetResult();
    const clientId = el.historyClient.value, fromValue = el.historyDateFrom.value, toValue = el.historyDateTo.value;
    if (!clientId) return message("Seleccione un cliente.", true);
    if (!fromValue || !toValue) return message("Ingrese la fecha desde y la fecha hasta.", true);
    if (fromValue > toValue) return message("La fecha desde no puede ser posterior a la fecha hasta.", true);
    setBusy(true); message("Buscando registros...");
    try {
      const results = new Map();
      const queries = [
        query(collection(db, "leach_records"), where("implementationId", "==", clientId), where("fecha", ">=", fromValue), where("fecha", "<=", toValue)),
        query(collection(db, "leach_records"), where("clienteId", "==", clientId), where("fecha", ">=", fromValue), where("fecha", "<=", toValue))
      ];
      console.log("[DeleteHistory] Parámetros:", { clientId, fromValue, toValue, coleccion: "leach_records", consultaImplementacion: "implementationId==clientId, fecha>=fromValue, fecha<=toValue", consultaCliente: "clienteId==clientId, fecha>=fromValue, fecha<=toValue" });
      const [implResult, clientResult] = await Promise.allSettled(queries.map((q) => getDocs(q)));
      if (implResult.status === "fulfilled") {
        console.log("[DeleteHistory] implementationId recibidos=" + implResult.value.docs.length + " error.code=null error.message=null");
        implResult.value.docs.forEach((docSnapshot) => results.set(docSnapshot.id, docSnapshot));
      } else {
        console.log("[DeleteHistory] implementationId recibidos=0 error.code=" + implResult.reason.code + " error.message=" + implResult.reason.message);
      }
      if (clientResult.status === "fulfilled") {
        console.log("[DeleteHistory] clienteId recibidos=" + clientResult.value.docs.length + " error.code=null error.message=null");
        clientResult.value.docs.forEach((docSnapshot) => results.set(docSnapshot.id, docSnapshot));
      } else {
        console.log("[DeleteHistory] clienteId recibidos=0 error.code=" + clientResult.reason.code + " error.message=" + clientResult.reason.message);
      }
      matches = Array.from(results.values());
      range = { clientId, fromValue, toValue };
      preview();
      message(matches.length ? `Se encontraron ${matches.length} registros. Revise la vista previa antes de eliminar.` : "No se encontraron registros para el rango seleccionado.");
    } catch (error) {
      console.error("Error al consultar leach_records:", error);
      if (error?.code === "failed-precondition") {
        console.error(error);
        console.error(error.message);
        const indexUrl = firebaseIndexUrl(error.message);
        createIndexLink.href = indexUrl || "";
        createIndexLink.hidden = !indexUrl;
        el.deleteHistoryButton.disabled = true;
      }
      message(error?.code === "failed-precondition" ? error.message : errorText(error, "consulta"), true);
    }
    finally { setBusy(false); }
  }

  function preview() {
    const parsedDates = matches.map((item) => { const data = item.data(); const combined = `${data.fecha || ""}T${data.hora || "00:00:00"}`; const date = new Date(combined); return Number.isNaN(date.valueOf()) ? null : date; }).filter((date) => date !== null).sort((a, b) => a - b);
    console.log("Primer timestamp encontrado:", parsedDates[0]);
    console.log("Último timestamp encontrado:", parsedDates.at(-1));
    el.previewClient.textContent = CLIENTS[range.clientId] || range.clientId; el.previewFrom.textContent = dateLabel(range.fromValue); el.previewTo.textContent = dateLabel(range.toValue); el.previewCount.textContent = matches.length;
    el.previewOldest.textContent = parsedDates.length ? parsedDates[0].toLocaleString("es-CL") : "--"; el.previewNewest.textContent = parsedDates.length ? parsedDates.at(-1).toLocaleString("es-CL") : "--";
    el.deleteHistoryPreview.hidden = false; el.deleteHistoryButton.disabled = matches.length === 0;
  }

  function openConfirmation() {
    if (busy || !matches.length || !range) return;
    el.deleteHistorySummary.textContent = `Se eliminarán ${matches.length} registros del cliente ${CLIENTS[range.clientId] || range.clientId} entre ${dateLabel(range.fromValue)} y ${dateLabel(range.toValue)}.`;
    el.deleteHistoryConfirmation.hidden = false; el.deleteHistoryConfirmationInput.value = ""; updateConfirmation(); el.deleteHistoryConfirmationInput.focus();
  }
  function closeConfirmation() { el.deleteHistoryConfirmation.hidden = true; el.deleteHistoryConfirmationInput.value = ""; el.confirmHistoryDeletion.disabled = true; }
  function updateConfirmation() { el.confirmHistoryDeletion.disabled = busy || el.deleteHistoryConfirmationInput.value !== "ELIMINAR"; }

  async function remove() {
    if (busy || !matches.length || !range || el.deleteHistoryConfirmationInput.value !== "ELIMINAR") return;
    const documents = [...matches], selectedRange = { ...range }, totalBatches = Math.ceil(documents.length / 450); let deleted = 0;
    setBusy(true);
    try {
      for (let index = 0; index < totalBatches; index++) {
        message(`Eliminando lote ${index + 1} de ${totalBatches}...`);
        const chunk = documents.slice(index * 450, (index + 1) * 450), batch = writeBatch(db);
        chunk.forEach((item) => batch.delete(item.ref)); await batch.commit(); deleted += chunk.length;
      }
    } catch (error) {
      console.error("Error durante la eliminación por lotes:", error);
      const prefix = deleted ? `La eliminación fue parcial: se eliminaron ${deleted} registros antes del error. ` : "";
      resetResult(); setBusy(false); return message(prefix + errorText(error, "eliminación"), true);
    }
    let warning = "";
    try { await addDoc(collection(db, "audit_log"), { accion: "eliminar_historico", adminEmail: admin.email, adminNombre: admin.nombre, adminRol: admin.rol, clienteId: selectedRange.clientId, fechaDesde: selectedRange.fromValue, fechaHasta: selectedRange.toValue, registrosEliminados: deleted, timestamp: serverTimestamp() }); }
    catch (error) { console.error("La eliminación terminó, pero falló la auditoría:", error); warning = " Advertencia: no fue posible registrar la auditoría."; }
    resetResult(); setBusy(false); message(`Se eliminaron correctamente ${deleted} registros.${warning}`, Boolean(warning));
  }

  function resetResult() { matches = []; range = null; el.deleteHistoryPreview.hidden = true; el.deleteHistoryButton.disabled = true; createIndexLink.hidden = true; createIndexLink.removeAttribute("href"); closeConfirmation(); }
  function setBusy(value) { busy = value; el.searchHistoryButton.disabled = value; el.historyClient.disabled = value; el.historyDateFrom.disabled = value; el.historyDateTo.disabled = value; el.deleteHistoryButton.disabled = value || !matches.length; el.cancelHistoryDeletion.disabled = value; updateConfirmation(); }
  function message(text, error = false) { el.deleteHistoryMessage.textContent = text; el.deleteHistoryMessage.classList.toggle("is-error", error); }
  function dateLabel(value) { const [y, m, d] = value.split("-").map(Number); const date = new Date(y, m - 1, d); return date.toLocaleDateString("es-CL"); }
  function firebaseIndexUrl(text = "") { const match = text.match(/https:\/\/console\.firebase\.google\.com\/[^\s]+/); return match?.[0] || ""; }
  function errorText(error, operation) { if (error?.code === "permission-denied") return `No tiene permisos para realizar esta ${operation}.`; if (["unavailable", "deadline-exceeded"].includes(error?.code)) return "No fue posible conectar con Firestore. Revise la red e intente nuevamente."; if (error?.code === "failed-precondition") return "La consulta requiere un índice de Firestore. Contacte al administrador del sistema."; return `Ocurrió un error durante la ${operation}. Intente nuevamente.`; }
  return { showRequestedSection, setAdmin(value) { admin = value; } };
}
