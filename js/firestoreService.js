import {
  collection,
  onSnapshot,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./firebaseConfig.js";

export function startRealtimeListener(callback) {
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
  }, (error) => {
    console.warn("Firestore no disponible:", error.message);
    callback([]);
  });
}
