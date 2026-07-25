export const PROFILES = Object.freeze({
  "Lixiviación Demo": Object.freeze({
    flujoPLS: { min: 950, max: 1050, unit: "m3/h" },
    flujoRefino: { min: 950, max: 1050, unit: "m3/h" },
    cuPls: { min: 0.9, max: 2.1, unit: "g/L" },
    acidezRefino: { min: 13.5, max: 21.5, unit: "g/L" },
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
