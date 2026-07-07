import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDomk0IVSajukkJjKeIE_K4kTWqpCDYqb0",
  authDomain: "metkinetics-leachview.firebaseapp.com",
  projectId: "metkinetics-leachview",
  storageBucket: "metkinetics-leachview.firebasestorage.app",
  messagingSenderId: "636253344962",
  appId: "1:636253344962:web:c59ecd248e7e6e3892975b",
  measurementId: "G-05CS1S71TZ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
