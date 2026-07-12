export const ADMIN_PASSWORD = "Met2026!";
export const TECHNICAL_PROFILE_PASSWORD = "Techdemo#";
export const DEMO_WEB_PASSWORD = "DEMO";

export function verifyAdminPassword(password) {
  return password === ADMIN_PASSWORD;
}

export function verifyTechnicalProfilePassword(password) {
  return password === TECHNICAL_PROFILE_PASSWORD;
}

export function verifyWebPassword(implementationId, password) {
  const expected = implementationId === "demo_lixiviacion" ? DEMO_WEB_PASSWORD : ADMIN_PASSWORD;
  return String(password || "") === expected;
}
