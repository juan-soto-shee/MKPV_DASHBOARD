import { app, db } from "../js/firebaseConfig.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { initializeDeleteHistory } from "./modules/deleteHistory.js";
import { initializeBulkImport } from "./modules/bulkImport.js?v=20260713-2";

const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const elements = {
  authScreen: document.getElementById("authScreen"),
  adminConsole: document.getElementById("adminConsole"),
  sessionStatus: document.getElementById("sessionStatus"),
  sessionStatusText: document.getElementById("sessionStatusText"),
  authSpinner: document.getElementById("authSpinner"),
  authMessage: document.getElementById("authMessage"),
  googleSignInButton: document.getElementById("googleSignInButton"),
  signOutButton: document.getElementById("signOutButton"),
  adminUserName: document.getElementById("adminUserName"),
  adminUserEmail: document.getElementById("adminUserEmail"),
  adminUserRole: document.getElementById("adminUserRole")
};

let signingOutUnauthorizedUser = false;
let deleteHistoryController = null;
let bulkImportController = null;

elements.googleSignInButton.addEventListener("click", async () => {
  setCheckingState("Abriendo Google...");
  elements.googleSignInButton.disabled = true;
  elements.authMessage.textContent = "";
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("====== FIREBASE AUTH ======");
    console.error(error);
    console.error("code:", error.code);
    console.error("message:", error.message);
    showLogin(`${error.code}\n${error.message}`);
  } finally {
    elements.googleSignInButton.disabled = false;
  }
});

elements.signOutButton.addEventListener("click", async () => {
  hideConsole();
  showLogin();
  try {
    await signOut(auth);
  } catch (error) {
    elements.authMessage.textContent = "No fue posible cerrar la sesión. Intente nuevamente.";
  }
});

onAuthStateChanged(auth, async (user) => {
  hideConsole();
  if (!user) {
    if (signingOutUnauthorizedUser) {
      signingOutUnauthorizedUser = false;
      return;
    }
    showLogin();
    return;
  }

  setCheckingState("Verificando autorización...");
  try {
    const authorization = await getAdminAuthorization(user);
    if (!authorization) {
      signingOutUnauthorizedUser = true;
      await signOut(auth);
      showLogin("Esta cuenta no está autorizada para acceder a PlantView Admin.");
      return;
    }
    showConsole(user, authorization);
  } catch (error) {
    console.error("No se pudo validar el acceso administrativo:", error);
    signingOutUnauthorizedUser = true;
    await signOut(auth).catch(() => {});
    showLogin("No fue posible verificar la autorización. Intente nuevamente.");
  }
});

async function getAdminAuthorization(user) {
  const email = user.email?.trim().toLowerCase();
  if (!email) return null;
  const snapshot = await getDoc(doc(db, "admin_users", email));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  if (data.activo !== true || typeof data.rol !== "string" || !data.rol.trim()) return null;
  return data;
}

function setCheckingState(message) {
  hideConsole();
  elements.authScreen.hidden = false;
  elements.sessionStatus.hidden = false;
  elements.authSpinner.hidden = false;
  elements.sessionStatusText.textContent = message;
  elements.googleSignInButton.hidden = true;
  elements.authMessage.textContent = "";
}

function showLogin(message = "") {
  hideConsole();
  elements.authScreen.hidden = false;
  elements.sessionStatus.hidden = true;
  elements.authSpinner.hidden = true;
  elements.googleSignInButton.hidden = false;
  elements.googleSignInButton.disabled = false;
  elements.authMessage.textContent = message;
}

function showConsole(user, authorization) {
  elements.authScreen.hidden = true;
  elements.adminUserName.textContent = authorization.nombre || user.displayName || "Administrador";
  elements.adminUserEmail.textContent = authorization.email || user.email || "--";
  elements.adminUserRole.textContent = authorization.rol;
  elements.adminConsole.hidden = false;
  const activeAdmin = {
    email: authorization.email || user.email || "",
    nombre: authorization.nombre || user.displayName || "Administrador",
    rol: authorization.rol
  };
  if (!deleteHistoryController) deleteHistoryController = initializeDeleteHistory(db, activeAdmin);
  else deleteHistoryController.setAdmin(activeAdmin);
  deleteHistoryController.showRequestedSection();
  if (!bulkImportController) bulkImportController = initializeBulkImport(db, activeAdmin);
  else bulkImportController.setAdmin(activeAdmin);
  bulkImportController.showRequestedSection();
}

function hideConsole() {
  elements.adminConsole.hidden = true;
}

function authErrorMessage(error) {
  if (error?.code === "auth/popup-closed-by-user") return "Se cerró la ventana de Google antes de completar el acceso.";
  if (error?.code === "auth/popup-blocked") return "El navegador bloqueó la ventana de Google. Permita ventanas emergentes e intente nuevamente.";
  if (error?.code === "auth/network-request-failed") return "No fue posible conectar con Firebase. Revise su conexión a Internet.";
  if (error?.code === "auth/cancelled-popup-request") return "Ya existe una solicitud de acceso en curso.";
  return "No fue posible iniciar sesión con Google. Intente nuevamente.";
}
