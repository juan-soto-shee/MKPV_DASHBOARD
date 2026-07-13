import { doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./firebaseConfig.js";
import { clientConfig } from "./clientConfig.js";

const { coleccionConfiguracion, documentoConfiguracion } = clientConfig.identity.firebase;
const configRef = doc(db, coleccionConfiguracion, documentoConfiguracion);

export function startKpiConfigListener(onConfig, onError = () => {}) {
  return onSnapshot(configRef, (snapshot) => {
    onConfig(snapshot.exists() ? snapshot.data()?.kpis || null : null);
  }, onError);
}

export async function saveRemoteKpiConfig(config) {
  await setDoc(configRef, { kpis: config }, { merge: true });
}
