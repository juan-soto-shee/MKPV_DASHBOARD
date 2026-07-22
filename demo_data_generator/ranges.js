export const RANGES = Object.freeze({
  flujoPLS: { min: 900, max: 1100, delta: 20, decimals: 0 },
  cuPls: { min: 1.05, max: 1.35, delta: .03, decimals: 3 },
  flujoRefino: { min: 900, max: 1100, delta: 20, decimals: 0 },
  acidezRefino: { min: 13, max: 17, delta: .3, decimals: 2 },
  nivelPiscinaPLS: { min: 45, max: 75, delta: 2, decimals: 1 },
  nivelPiscinaRefino: { min: 45, max: 75, delta: 2, decimals: 1 }
});

export const BASE_VALUES = Object.freeze({
  "Pila 1": { flujoPLS: 1010, cuPls: 1.24, flujoRefino: 1000, acidezRefino: 15.1, nivelPiscinaPLS: 61, nivelPiscinaRefino: 60 },
  "Pila 2": { flujoPLS: 990, cuPls: 1.21, flujoRefino: 1015, acidezRefino: 14.8, nivelPiscinaPLS: 59, nivelPiscinaRefino: 62 },
  "Pila 3": { flujoPLS: 1025, cuPls: 1.26, flujoRefino: 985, acidezRefino: 15.3, nivelPiscinaPLS: 63, nivelPiscinaRefino: 58 }
});
