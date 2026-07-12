export const ADMIN_PASSWORD = "Met2026!";
export const TECHNICAL_PROFILE_PASSWORD = "Techdemo#";
export const DEMO_WEB_PASSWORD = "DEMO";
export const MANTOS_BLANCOS_WEB_PASSWORD = "MB2026";

export function verifyAdminPassword(password) {
  return password === ADMIN_PASSWORD;
}

export function verifyTechnicalProfilePassword(implementationId, password) {
  const expected = implementationId === "solmin_mantos_blancos"
    ? MANTOS_BLANCOS_WEB_PASSWORD
    : TECHNICAL_PROFILE_PASSWORD;
  return String(password || "") === expected;
}

export function verifyWebPassword(implementationId, password) {
  const expected = implementationId === "demo_lixiviacion"
    ? DEMO_WEB_PASSWORD
    : implementationId === "solmin_mantos_blancos"
      ? MANTOS_BLANCOS_WEB_PASSWORD
      : ADMIN_PASSWORD;
  return String(password || "") === expected;
}
