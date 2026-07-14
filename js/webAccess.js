import { app, db } from "./firebaseConfig.js";
import { clientConfig } from "./clientConfig.js";
import {
  browserSessionPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const auth = getAuth(app);
const TECHNICAL_ROLES = new Set(["tecnico", "technical_profile", "metkinetics_admin"]);
const USERNAME_DOMAIN = "users.metkinetics.cl";
let currentAuthorization = null;

export function requireWebAccess() {
  const elements = getElements();
  if (!elements.overlay || !elements.form || !elements.button) {
    return Promise.reject(new Error("No se encontró la interfaz de acceso seguro."));
  }

  return new Promise((resolve) => {
    let settled = false;

    elements.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      elements.button.disabled = true;
      elements.message.textContent = "Verificando credenciales...";
      try {
        const username = normalizeUsername(elements.username.value);
        if (!username) {
          elements.message.textContent = "Ingrese un usuario válido.";
          elements.username.focus();
          return;
        }
        await setPersistence(auth, browserSessionPersistence);
        await signInWithEmailAndPassword(
          auth,
          `${username}@${USERNAME_DOMAIN}`,
          elements.password.value
        );
      } catch (error) {
        elements.message.textContent = authErrorMessage(error);
        elements.password.select();
      } finally {
        elements.button.disabled = false;
      }
    });

    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        openAccess(elements);
        return;
      }

      elements.message.textContent = "Verificando autorización...";
      try {
        const authorization = await getViewerAuthorization(user);
        if (!authorization) {
          await signOut(auth);
          elements.message.textContent = "Esta cuenta no está autorizada para esta implementación.";
          return;
        }

        closeAccess(elements);
        if (!settled) {
          settled = true;
          currentAuthorization = authorization;
          resolve(authorization);
        }
      } catch (error) {
        console.error("No se pudo validar el acceso al monitoreo:", error);
        await signOut(auth).catch(() => {});
        elements.message.textContent = "No fue posible verificar la autorización. Intente nuevamente.";
      }
    });
  });
}

export function canManageConfiguration(authorization = currentAuthorization) {
  return authorization?.activo === true && TECHNICAL_ROLES.has(authorization.rol);
}

async function getViewerAuthorization(user) {
  const email = user.email?.trim().toLowerCase();
  if (email) {
    const adminSnapshot = await getDoc(doc(db, "admin_users", email));
    if (adminSnapshot.exists() && adminSnapshot.data()?.activo === true) {
      return { type: "admin", ...adminSnapshot.data() };
    }
  }

  const accessSnapshot = await getDoc(doc(db, "user_access", user.uid));
  if (!accessSnapshot.exists()) return null;

  const access = accessSnapshot.data();
  const allowedClients = Array.isArray(access.clienteIds) ? access.clienteIds : [];
  if (access.activo !== true || !allowedClients.includes(clientConfig.clienteId)) return null;
  return { type: "viewer", ...access };
}

function openAccess(elements) {
  elements.overlay.classList.remove("is-hidden");
  elements.overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("web-access-locked");
}

function closeAccess(elements) {
  elements.overlay.classList.add("is-hidden");
  elements.overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("web-access-locked");
}

function getElements() {
  return {
    overlay: document.getElementById("webAccessOverlay"),
    form: document.getElementById("webAccessForm"),
    username: document.getElementById("webAccessUsername"),
    password: document.getElementById("webAccessPassword"),
    button: document.getElementById("webAccessButton"),
    message: document.getElementById("webAccessMessage")
  };
}

function normalizeUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,63}$/.test(username) ? username : "";
}

function authErrorMessage(error) {
  if (error?.code === "auth/network-request-failed") return "No fue posible conectar. Revise su conexión.";
  if (error?.code === "auth/too-many-requests") return "Acceso temporalmente bloqueado por demasiados intentos. Intente más tarde.";
  return "Usuario o contraseña incorrectos.";
}
