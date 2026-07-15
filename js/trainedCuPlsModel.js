const NUMERIC_FEATURES = Object.freeze([
  "cuPls", "flujoPLS", "flujoRefino", "acidezRefino",
  "nivelPiscinaPLS", "nivelPiscinaRefino", "hora", "diaSemana"
]);

const PARAMETERS = Object.freeze({
  mean: [4.020235569985569, 982.1947518037518, 772.0114956709956, 8.694694444444444, 68.38996688311688, 67.98461392496392, 16.474025974025974, 3],
  scale: [0.21421698069253803, 61.33555217878883, 44.5256309948659, 0.27077421123218937, 6.6677869680798505, 6.849436417748553, 3.303935837246445, 2],
  subareas: ["Pila 1", "Pila 2", "Pila 3"],
  turns: ["A"],
  coefficients: [0.20646712969634018, -0.0004537817354262029, -0.004877969728373953, 0.0014139484363662727, -0.0006873626595453718, 0.0011420201936901773, -0.0011612755556400683, 0.0004365722956138663, -0.0011763050334805897, 0.0011818136082501112, -0.000005508574769504414, 0],
  intercept: 4.020284992784991
});

export const TRAINED_MODEL_METADATA = Object.freeze({
  name: "LinearRegression",
  version: "0.1.0-preliminary",
  validationStatus: "Preliminar operativo",
  predictionHorizonHours: 4,
  metrics: Object.freeze({ mae: 0.0283483637259894, rmse: 0.0351957329928574, r2: 0.967596977942104 })
});

export function predictCuPls(record) {
  const numeric = NUMERIC_FEATURES.map((feature) => Number(record?.[feature]));
  if (numeric.some((value) => !Number.isFinite(value))) {
    throw new Error("El registro más reciente no contiene todas las variables requeridas.");
  }

  const encoded = numeric.map((value, index) => (value - PARAMETERS.mean[index]) / PARAMETERS.scale[index]);
  PARAMETERS.subareas.forEach((value) => encoded.push(record.subarea === value ? 1 : 0));
  PARAMETERS.turns.forEach((value) => encoded.push(record.turno === value ? 1 : 0));

  return PARAMETERS.intercept + encoded.reduce(
    (total, value, index) => total + value * PARAMETERS.coefficients[index], 0
  );
}
