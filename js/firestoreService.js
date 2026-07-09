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

export function startRealtimeListener(callback, onConnectionChange = () => {}) {
  const recordsQuery = query(
    collection(db, "leach_records"),
    orderBy("timestampCreacion", "desc")
  );

  return onSnapshot(recordsQuery, (snapshot) => {
    const records = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    callback(records);
    onConnectionChange(true);
  }, (error) => {
    console.warn("Firestore no disponible:", error.message);
    onConnectionChange(false);
    callback([]);
  });
}

// Borra exclusivamente documentos de leach_records, en lotes bajo el limite de Firestore.
export async function deleteAllLeachRecords(onProgress = () => {}) {
  let deleted = 0;

  while (true) {
    const snapshot = await getDocs(query(collection(db, "leach_records"), limit(450)));
    if (snapshot.empty) break;

    const batch = writeBatch(db);
    snapshot.docs.forEach((record) => batch.delete(doc(db, "leach_records", record.id)));
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
      const recordRef = doc(collection(db, "leach_records"));
      batch.set(recordRef, { ...record, isDemo: true });
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

  for (let start = 0; start < records.length; start += 400) {
    const batch = writeBatch(db);
    const chunk = records.slice(start, start + 400);

    chunk.forEach((record) => {
      batch.set(doc(collection(db, "leach_records")), record);
    });

    await batch.commit();
    inserted += chunk.length;
    onProgress(inserted, records.length);
  }

  return inserted;
}

// Elimina exclusivamente documentos marcados explícitamente como DEMO.
export async function deleteDemoRecords(onProgress = () => {}) {
  let deleted = 0;

  while (true) {
    const demoQuery = query(
      collection(db, "leach_records"),
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
