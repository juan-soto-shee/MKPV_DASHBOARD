export const firebaseConfig = {
  apiKey: "REEMPLAZAR_CON_API_KEY",
  authDomain: "metkinetics-plantview-demo.firebaseapp.com",
  projectId: "metkinetics-plantview-demo",
  storageBucket: "metkinetics-plantview-demo.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:plantviewdemo"
};

export const isFirebaseConfigured = !firebaseConfig.apiKey.includes("REEMPLAZAR");
