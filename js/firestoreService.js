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
import { normalizeRecordDateTime, timestampMillis } from "./dateTime.js?v=20260711-2";

const RECORDS_COLLECTION = clientConfig.identity.firebase.coleccionRegistros;
const CLIENTE_ACTIVO = clientConfig.clienteId;
const REALTIME_LIMIT = 200;
const PERIOD_QUERY_LIMITS = Object.freeze({
  24: 200,
  168: 1000,
  720: 3000
});
const IMPORT_DUPLICATE_CHUNK_SIZE = 30;
const debugLog = (...args) => {
  if (clientConfig.debug !== false) console.info("[PlantViewData]", ...args);
};

let activeListener = null;
let activeListenerClientId = null;
let lastRealtimeRecords = [];
const recordsCache = new Map();

export function startRealtimeListener(callback, onConnectionChange = () => {}) {
  console.info("[PlantView] clienteId activo:", CLIENTE_ACTIVO);
  if (activeListener && activeListenerClientId === CLIENTE_ACTIVO) {
    debugLog("listener reutilizado", { clienteId: CLIENTE_ACTIVO });
    callback(lastRealtimeRecords);
    onConnectionChange(true);
    return activeListener;
  }

  closeRealtimeListener();

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
    cacheRecords(realtimeCacheKey(), records);
    debugLog("documentos recibidos", {
      clienteId: CLIENTE_ACTIVO,
      count: snapshot.size
    });
    console.info("[PlantView] registros encontrados:", snapshot.size);
    onConnectionChange(true);
    callback(records);
  }, (error) => {
    console.error("[PlantView] error Firestore:", error);
    onConnectionChange(false);
    callback([]);
  });

  return activeListener;
}

export function closeRealtimeListener() {
  if (!activeListener) return;
  activeListener();
  debugLog("listener cerrado", { clienteId: activeListenerClientId });
  activeListener = null;
  activeListenerClientId = null;
}

export async function getRecordsForPeriod(hours) {
  const normalizedHours = Number(hours);
  const cacheKey = periodCacheKey(normalizedHours);
  const cached = recordsCache.get(cacheKey);
  if (cached) {
    debugLog("cache hit", { key: cacheKey, count: cached.records.length });
    return cached.records;
  }

  if (realtimeCoversPeriod(lastRealtimeRecords, normalizedHours)) {
    debugLog("cache hit desde listener", { key: cacheKey, count: lastRealtimeRecords.length });
    cacheRecords(cacheKey, lastRealtimeRecords);
    return lastRealtimeRecords;
  }

  const queryLimit = PERIOD_QUERY_LIMITS[normalizedHours] || REALTIME_LIMIT;
  debugLog("cache miss; consulta puntual", {
    key: cacheKey,
    collection: RECORDS_COLLECTION,
    clienteId: CLIENTE_ACTIVO,
    limit: queryLimit
  });

  const snapshot = await getDocs(query(
    collection(db, RECORDS_COLLECTION),
    where("clienteId", "==", CLIENTE_ACTIVO),
    limit(queryLimit)
  ));
  const records = snapshot.docs.map(toRecord).filter(Boolean).sort(compareRecordsNewestFirst);
  cacheRecords(cacheKey, records);
  return records;
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
  let duplicates = 0;
  const existingKeys = await getExistingTimestampKeys(records);
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

  invalidateRecordsCache();
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

async function getExistingTimestampKeys(candidateRecords = []) {
  const keys = new Set(lastRealtimeRecords
    .map((record) => timestampKey(record.timestampCreacion))
    .filter(Boolean));
  const candidateTimestamps = [...new Map(candidateRecords
    .map((record) => [timestampKey(record.timestampCreacion), record.timestampCreacion])
    .filter(([key]) => key)).values()];

  for (let start = 0; start < candidateTimestamps.length; start += IMPORT_DUPLICATE_CHUNK_SIZE) {
    const chunk = candidateTimestamps.slice(start, start + IMPORT_DUPLICATE_CHUNK_SIZE);
    debugLog("consulta puntual duplicados importacion", {
      clienteId: CLIENTE_ACTIVO,
      timestamps: chunk.length
    });
    const snapshot = await getDocs(query(
      collection(db, RECORDS_COLLECTION),
      where("clienteId", "==", CLIENTE_ACTIVO),
      where("timestampCreacion", "in", chunk)
    ));
    snapshot.docs.forEach((record) => {
      const key = timestampKey(record.data().timestampCreacion);
      if (key) keys.add(key);
    });
  }
  return keys;
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

function realtimeCoversPeriod(records, hours) {
  if (!records.length) return true;
  const timestamps = records
    .map((record) => timestampMillis(record.timestampCreacion))
    .filter(Number.isFinite);
  if (!timestamps.length) return false;
  const latest = Math.max(...timestamps);
  const earliest = Math.min(...timestamps);
  return earliest <= latest - hours * 60 * 60 * 1000 || records.length < REALTIME_LIMIT;
}

function timestampKey(value) {
  const millis = timestampMillis(value);
  return Number.isFinite(millis) ? String(millis) : "";
}

function toRecord(record) {
  const data = { id: record.id, ...record.data() };
  try { return { ...data, ...normalizeRecordDateTime(data) }; }
  catch (error) {
    debugLog("registro omitido por fecha inválida o futura", { id: record.id, reason: error.message });
    return null;
  }
}

function compareRecordsNewestFirst(left, right) {
  return recordTimestampMillis(right) - recordTimestampMillis(left);
}

function recordTimestampMillis(record) {
  return Number(record?.timestampCreacion) || 0;
}
