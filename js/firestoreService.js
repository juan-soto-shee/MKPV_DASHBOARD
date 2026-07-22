import {
  doc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./firebaseConfig.js";
import { clientConfig } from "./clientConfig.js";
import { normalizeRecordDateTime } from "./dateTime.js?v=20260711-2";

const RECORDS_COLLECTION = clientConfig.identity.firebase.coleccionRegistros;
const CLIENTE_ACTIVO = clientConfig.clienteId;
const REALTIME_LIMIT = 200;
const debugLog = (...args) => {
  if (clientConfig.debug !== false) console.info("[PlantViewData]", ...args);
};

let activeListener = null;
let activeGeneratorStateListener = null;
let activeListenerClientId = null;
let lastRealtimeRecords = [];
let activeDemoSessionId = null;
const recordsCache = new Map();

export function startRealtimeListener(callback, onConnectionChange = () => {}) {
  console.info("[PlantView] clienteId activo:", CLIENTE_ACTIVO);
  if (activeListener && activeListenerClientId === CLIENTE_ACTIVO) {
    debugLog("listener reutilizado", { clienteId: CLIENTE_ACTIVO });
    callback(lastRealtimeRecords.filter(isOperationalRecord));
    onConnectionChange(true);
    return activeListener;
  }

  closeRealtimeListener();

  if (CLIENTE_ACTIVO === "demo_lixiviacion") {
    activeGeneratorStateListener = onSnapshot(doc(db, "demo_generator_state", "current"), (snapshot) => {
      const state = snapshot.data();
      activeDemoSessionId = state?.estado === "DEMO_RUNNING" ? state.sessionId : null;
      if (lastRealtimeRecords.length) callback(lastRealtimeRecords.filter(isOperationalRecord));
    });
  }

  const recordsQuery = query(
    collection(db, RECORDS_COLLECTION),
    where("clienteId", "==", CLIENTE_ACTIVO)
  );

  console.info("[PlantView] consulta Firestore iniciada", {
    collection: RECORDS_COLLECTION,
    clienteId: CLIENTE_ACTIVO
  });

  activeListenerClientId = CLIENTE_ACTIVO;
  activeListener = onSnapshot(recordsQuery, (snapshot) => {
    const records = snapshot.docs.map(toRecord).filter(Boolean).sort(compareRecordsNewestFirst);

    lastRealtimeRecords = records;
    recordsCache.clear();
    cacheRecords(realtimeCacheKey(), records);
    debugLog("documentos recibidos", {
      clienteId: CLIENTE_ACTIVO,
      count: snapshot.size
    });
    console.info("[PlantView] registros encontrados:", snapshot.size);
    onConnectionChange(true);
    callback(records.filter(isOperationalRecord));
  }, (error) => {
    console.error("[PlantView] error Firestore:", error);
    onConnectionChange(false);
    callback([]);
  });

  return activeListener;
}

export function closeRealtimeListener() {
  if (activeGeneratorStateListener) activeGeneratorStateListener();
  activeGeneratorStateListener = null;
  activeDemoSessionId = null;
  if (!activeListener) return;
  activeListener();
  debugLog("listener cerrado", { clienteId: activeListenerClientId });
  activeListener = null;
  activeListenerClientId = null;
}

export async function getRecordsForPeriod(hours) {
  const normalizedHours = Number(hours);
  const cacheKey = periodCacheKey(normalizedHours);
  // El listener ya contiene todos los documentos del cliente y está ordenado.
  // Reutilizarlo evita que una consulta limitada y sin orderBy descarte el dato más reciente.
  if (lastRealtimeRecords.length) {
    debugLog("cache hit desde listener", { key: cacheKey, count: lastRealtimeRecords.length });
    cacheRecords(cacheKey, lastRealtimeRecords);
    return lastRealtimeRecords.filter(isOperationalRecord);
  }

  const cached = recordsCache.get(cacheKey);
  if (cached) {
    debugLog("cache hit", { key: cacheKey, count: cached.records.length });
    return cached.records.filter(isOperationalRecord);
  }

  debugLog("cache miss; consulta puntual", {
    key: cacheKey,
    collection: RECORDS_COLLECTION,
    clienteId: CLIENTE_ACTIVO
  });

  const snapshot = await getDocs(query(
    collection(db, RECORDS_COLLECTION),
    where("clienteId", "==", CLIENTE_ACTIVO)
  ));
  const records = snapshot.docs.map(toRecord).filter(Boolean).sort(compareRecordsNewestFirst);
  cacheRecords(cacheKey, records);
  return records.filter(isOperationalRecord);
}

// Borra exclusivamente documentos del cliente activo, en lotes bajo el limite de Firestore.
export async function deleteAllLeachRecords(onProgress = () => {}) {
  let deleted = 0;

  while (true) {
    debugLog("consulta puntual borrado historico", { clienteId: CLIENTE_ACTIVO, limit: 450 });
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

  invalidateRecordsCache();
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

  invalidateRecordsCache();
  return inserted;
}

// Inserta registros validados en lotes bajo el limite de 500 escrituras de Firestore.
export async function insertImportedRecords(records, onProgress = () => {}) {
  let inserted = 0;
  for (let start = 0; start < records.length; start += 400) {
    const batch = writeBatch(db);
    const chunk = records.slice(start, start + 400);

    chunk.forEach((record) => {
      batch.set(doc(collection(db, RECORDS_COLLECTION)), withActiveClient(record));
    });

    await batch.commit();
    inserted += chunk.length;
    onProgress(inserted, records.length);
  }

  invalidateRecordsCache();
  return { inserted };
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

  invalidateRecordsCache();
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

export function invalidateRecordsCache() {
  recordsCache.clear();
  debugLog("cache invalidada", { clienteId: CLIENTE_ACTIVO });
}

function cacheRecords(key, records) {
  recordsCache.set(key, {
    records,
    cachedAt: Date.now()
  });
}

function realtimeCacheKey() {
  return `${CLIENTE_ACTIVO}:realtime:${REALTIME_LIMIT}`;
}

function periodCacheKey(hours) {
  return `${CLIENTE_ACTIVO}:${hours}h`;
}

function toRecord(record) {
  const data = { id: record.id, ...record.data() };
  try {
    const audit = normalizeRecordDateTime(data, { rejectFuture: false });
    const process = data.timestampProceso
      ? normalizeRecordDateTime({ timestampCreacion: data.timestampProceso }, { rejectFuture: false })
      : audit;
    return { ...data, timestampAuditoria: audit.timestampCreacion, ...process };
  }
  catch (error) {
    debugLog("registro omitido por fecha inválida o futura", { id: record.id, reason: error.message });
    return null;
  }
}

function isOperationalRecord(record) {
  if (record.visibleOperacional === false) return false;
  if (record.tipoRegistro !== "demo_acelerada") return true;
  return Boolean(activeDemoSessionId) && record.sessionId === activeDemoSessionId;
}

function compareRecordsNewestFirst(left, right) {
  return recordTimestampMillis(right) - recordTimestampMillis(left);
}

function recordTimestampMillis(record) {
  return Number(record?.timestampCreacion) || 0;
}
