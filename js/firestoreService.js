import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig, isFirebaseConfigured } from "./firebaseConfig.js";

let app;
let db;

export function listenToLeachRecords({ onData, onError }) {
  if (!isFirebaseConfigured) {
    onError(new Error("Firebase usa configuración de ejemplo."));
    return () => {};
  }

  try {
    app = app || initializeApp(firebaseConfig);
    db = db || getFirestore(app);

    // Punto de reemplazo futuro: esta función puede cambiarse por un cliente SharePoint
    // que exponga los mismos callbacks onData/onError sin modificar app.js ni charts.js.
    const recordsQuery = query(
      collection(db, "leach_records"),
      orderBy("timestampCreacion", "desc")
    );

    return onSnapshot(
      recordsQuery,
      (snapshot) => {
        const records = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        }));
        onData(records);
      },
      onError
    );
  } catch (error) {
    onError(error);
    return () => {};
  }
}
