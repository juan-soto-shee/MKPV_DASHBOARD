export const PROFILES = Object.freeze({
  "Lixiviación Demo": Object.freeze({
    flujoPLS: { min: 950, max: 1050, unit: "m3/h" },
    flujoRefino: { min: 950, max: 1050, unit: "m3/h" },
    cuPls: { min: 1.10, max: 1.30, unit: "g/L" },
    acidezRefino: { min: 14.0, max: 16.0, unit: "g/L" },
    nivelPiscinaPLS: { min: 45, max: 75, unit: "%" },
    nivelPiscinaRefino: { min: 45, max: 75, unit: "%" }
  })
});

export const DEFAULT_PROFILE = "Lixiviación Demo";

export const RANGES = Object.freeze({ ...PROFILES[DEFAULT_PROFILE] });

export function getProfileRanges(profile = DEFAULT_PROFILE) {
  const ranges = PROFILES[profile];
  if (!ranges) throw new Error(`Perfil no soportado: ${profile}`);
  return ranges;
}
