import { TRAINED_POOL_PLS } from "./trainedPoolPlsModelData.js?v=20260715-1";

const NUMERIC_FEATURES = ["cuPls", "flujoPLS", "flujoRefino", "acidezRefino", "nivelPiscinaPLS", "nivelPiscinaRefino", "hora", "diaSemana"];

export { TRAINED_POOL_PLS };

export function predictPoolPls(record) {
  const parameters = TRAINED_POOL_PLS.parameters;
  const numeric = NUMERIC_FEATURES.map((key) => Number(record?.[key]));
  if (numeric.some((value) => !Number.isFinite(value))) throw new Error("Faltan variables para predecir el nivel de Piscina PLS.");
  const values = numeric.map((value, index) => (value - parameters.mean[index]) / parameters.scale[index]);
  parameters.categories.flatMap((categories, index) => categories.map((category) => (index === 0 ? record.subarea : record.turno) === category ? 1 : 0)).forEach((value) => values.push(value));
  return parameters.intercept + values.reduce((sum, value, index) => sum + value * parameters.coefficients[index], 0);
}
