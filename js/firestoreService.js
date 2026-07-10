import {
  doc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./firebaseConfig.js";
import { clientConfig } from "./clientConfig.js";

const RECORDS_COLLECTION = clientConfig.identity.firebase.coleccionRegistros;
const CLIENTE_ACTIVO = clientConfig.clienteId;
const LEGACY_SCAN_LIMIT = 1000;

export function startRealtimeListener(callback, onConnectionChange = () => {}) {
  const recordsQuery = query(
    collection(db, RECORDS_COLLECTION),
    where("clienteId", "==", CLIENTE_ACTIVO)
  );

  return onSnapshot(recordsQuery, (snapshot) => {
    const records = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    console.info("Consulta utilizada:", `${RECORDS_COLLECTION} where clienteId == ${CLIENTE_ACTIVO}`);
    console.info("Cantidad de documentos encontrados:", snapshot.size);
    callback(records);
    onConnectionChange(true);
  }, (error) => {
    console.warn("Error de comunicacion:", error.message);
    onConnectionChange(false);
    callback([]);
  });
}

export async function inspectLegacyRecords() {
  try {
    const snapshot = await getDocs(query(
      collection(db, RECORDS_COLLECTION),
      limit(LEGACY_SCAN_LIMIT)
    ));
    const legacyCount = snapshot.docs.filter((record) => !Object.hasOwn(record.data(), "clienteId")).length;
    if (legacyCount) {
      console.info("Los registros fueron creados antes de implementar clienteId.");
    }
    return {
      checked: snapshot.size,
      legacyCount,
      hasLegacyRecords: legacyCount > 0
    };
  } catch (error) {
    console.warn("No se pudo verificar registros historicos sin clienteId:", error.message);
    return {
      checked: 0,
      legacyCount: 0,
      hasLegacyRecords: false,
      error
    };
  }
}

// Borra exclusivamente documentos del cliente activo, en lotes bajo el limite de Firestore.
export async function deleteAllLeachRecords(onProgress = () => {}) {
  let deleted = 0;

  while (true) {
    const snapshot = await getDocs(query(
      collection(db, RECORDS_COLLECTION),
      where("clienteId", "==", CLIENTE_ACTIVO),
      limit(450)
    ));
    if (snapshot.empty) break;

    const batch = writeBatch(db);
    snapshot.docs.forEach((record) => batch.delete(record.ref));
    await batch.commit();
    deleted += snapshot.size;
    onProgress(deleted);
  }

  return deleted;
}

// Inserta registros DEMO en lotes seguros para Firestore.
export async function insertDemoRecords(records, onProgress = () => {}) {
  let inserted = 0;

  for (let start = 0; start < records.length; start += 400) {
    const batch = writeBatch(db);
    const chunk = records.slice(start, start + 400);

    chunk.forEach((record) => {
      const recordRef = doc(collection(db, RECORDS_COLLECTION));
      batch.set(recordRef, withActiveClient({ ...record, isDemo: true }));
    });

    await batch.commit();
    inserted += chunk.length;
    onProgress(inserted, records.length);
  }

  return inserted;
}

// Inserta registros validados en lotes bajo el limite de 500 escrituras de Firestore.
export async function insertImportedRecords(records, onProgress = () => {}) {
  let inserted = 0;
  let duplicates = 0;
  const existingKeys = await getExistingTimestampKeys();
  const uniqueRecords = records.filter((record) => {
    const key = timestampKey(record.timestampCreacion);
    if (existingKeys.has(key)) {
      duplicates += 1;
      return false;
    }
    existingKeys.add(key);
    return true;
  });

  if (!uniqueRecords.length) {
    onProgress(0, records.length, duplicates);
    return { inserted, duplicates };
  }

  for (let start = 0; start < uniqueRecords.length; start += 400) {
    const batch = writeBatch(db);
    const chunk = uniqueRecords.slice(start, start + 400);

    chunk.forEach((record) => {
      batch.set(doc(collection(db, RECORDS_COLLECTION)), withActiveClient(record));
    });

    await batch.commit();
    inserted += chunk.length;
    onProgress(inserted, records.length, duplicates);
  }

  return { inserted, duplicates };
}

// Elimina exclusivamente documentos marcados explícitamente como DEMO.
export async function deleteDemoRecords(onProgress = () => {}) {
  let deleted = 0;

  while (true) {
    const demoQuery = query(
      collection(db, RECORDS_COLLECTION),
      where("clienteId", "==", CLIENTE_ACTIVO),
      where("isDemo", "==", true),
      limit(400)
    );
    const snapshot = await getDocs(demoQuery);
    if (snapshot.empty) break;

    const batch = writeBatch(db);
    snapshot.docs.forEach((record) => batch.delete(record.ref));
    await batch.commit();
    deleted += snapshot.size;
    onProgress(deleted);
  }

  return deleted;
}

function withActiveClient(record) {
  const recordWithClient = {
    ...record,
    clienteId: CLIENTE_ACTIVO
  };
  if (!withActiveClient.loggedExample) {
    console.info("Ejemplo de registro enviado:", recordWithClient);
    withActiveClient.loggedExample = true;
  }
  return recordWithClient;
}

async function getExistingTimestampKeys() {
  const snapshot = await getDocs(query(
    collection(db, RECORDS_COLLECTION),
    where("clienteId", "==", CLIENTE_ACTIVO)
  ));
  return new Set(snapshot.docs
    .map((record) => timestampKey(record.data().timestampCreacion))
    .filter(Boolean));
}

function timestampKey(value) {
  if (!value) return "";
  if (value.toMillis) return String(value.toMillis());
  if (value.toDate) return String(value.toDate().getTime());
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : String(parsed.getTime());
}
