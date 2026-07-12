import { clientConfig } from "./clientConfig.js";
import { verifyWebPassword } from "./credentials.js?v=20260712-10";

const SESSION_DURATION_MS = 4 * 60 * 60 * 1000;
const STORAGE_PREFIX = "mkpv:web-access:";

export function requireWebAccess() {
  const elements = getElements();
  if (!elements.overlay || !elements.form) return Promise.resolve(false);

  if (isAndroidApp()) {
    closeAccess(elements);
    return Promise.resolve(true);
  }

  const session = readSession();
  if (session?.expiresAt > Date.now()) {
    closeAccess(elements);
    scheduleExpiration(session.expiresAt, elements);
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    openAccess(elements);
    elements.form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!verifyWebPassword(clientConfig.implementationId, elements.password.value)) {
        elements.message.textContent = "Clave incorrecta. Intente nuevamente.";
        elements.password.select();
        return;
      }

      const expiresAt = Date.now() + SESSION_DURATION_MS;
      writeSession(expiresAt);
      closeAccess(elements);
      scheduleExpiration(expiresAt, elements);
      resolve(true);
    }, { once: false });
  });
}

function isAndroidApp() {
  const userAgent = window.navigator.userAgent || "";
  return Boolean(window.Android || window.MKPV_ANDROID)
    || /;\s*wv\)/i.test(userAgent)
    || (/Android/i.test(userAgent) && /Version\/\d+(?:\.\d+)*\s+Chrome\//i.test(userAgent));
}

function sessionKey() {
  return `${STORAGE_PREFIX}${clientConfig.implementationId}`;
}

function readSession() {
  try {
    const session = JSON.parse(window.localStorage.getItem(sessionKey()) || "null");
    if (!session || session.expiresAt <= Date.now()) window.localStorage.removeItem(sessionKey());
    return session;
  } catch {
    return null;
  }
}

function writeSession(expiresAt) {
  try {
    window.localStorage.setItem(sessionKey(), JSON.stringify({ expiresAt }));
  } catch {
    // Si el navegador bloquea storage, el acceso funciona solo hasta recargar.
  }
}

function scheduleExpiration(expiresAt, elements) {
  const delay = Math.max(0, Math.min(expiresAt - Date.now(), 2147483647));
  window.setTimeout(() => {
    try { window.localStorage.removeItem(sessionKey()); } catch { /* storage no disponible */ }
    elements.message.textContent = "La sesión de 4 horas expiró. Ingrese nuevamente.";
    openAccess(elements, false);
  }, delay);
}

function openAccess(elements, clearMessage = true) {
  if (clearMessage) elements.message.textContent = "";
  elements.password.value = "";
  elements.overlay.classList.remove("is-hidden");
  elements.overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("web-access-locked");
  window.setTimeout(() => elements.password.focus(), 0);
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
    password: document.getElementById("webAccessPassword"),
    message: document.getElementById("webAccessMessage")
  };
}
