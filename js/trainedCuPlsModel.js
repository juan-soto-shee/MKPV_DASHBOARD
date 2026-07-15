import { TRAINED_HORIZONS } from "./trainedCuPlsHorizons.js?v=20260715-1";

const NUMERIC_FEATURES = Object.freeze([
  "cuPls", "flujoPLS", "flujoRefino", "acidezRefino",
  "nivelPiscinaPLS", "nivelPiscinaRefino", "hora", "diaSemana"
]);

export const SUPPORTED_HORIZONS = Object.freeze([4, 8, 12, 24]);

export function getTrainedHorizon(hours) {
  const result = TRAINED_HORIZONS[String(hours)];
  if (!result) throw new Error(`No existe un modelo entrenado para ${hours} horas.`);
  return result;
}

export function getModelMetadata(hours) {
  const result = getTrainedHorizon(hours);
  return Object.freeze({
    name: result.winner,
    version: `0.1.0-${hours}h-preliminary`,
    validationStatus: "Preliminar operativo",
    predictionHorizonHours: result.horizonHours,
    metrics: result.testMetrics
  });
}

export function predictCuPls(record, hours) {
  const result = getTrainedHorizon(hours);
  const parameters = result.parameters;
  const numeric = NUMERIC_FEATURES.map((feature) => Number(record?.[feature]));
  if (numeric.some((value) => !Number.isFinite(value))) {
    throw new Error("El registro más reciente no contiene todas las variables requeridas.");
  }
  const encodedCategories = encodeCategories(record, parameters.categories);
  if (parameters.type === "linear") {
    const values = numeric.map((value, index) => (value - parameters.mean[index]) / parameters.scale[index]);
    values.push(...encodedCategories);
    return parameters.intercept + values.reduce(
      (total, value, index) => total + value * parameters.coefficients[index], 0
    );
  }
  const values = numeric.map((value, index) => Number.isFinite(value) ? value : parameters.medians[index]);
  values.push(...encodedCategories);
  return parameters.trees.reduce((sum, tree) => sum + predictTree(tree, values), 0) / parameters.trees.length;
}

function encodeCategories(record, categories) {
  return categories.flatMap((values, index) => {
    const actual = index === 0 ? record.subarea : record.turno;
    return values.map((value) => actual === value ? 1 : 0);
  });
}

function predictTree(tree, values) {
  let node = 0;
  while (tree.left[node] !== -1) {
    node = values[tree.feature[node]] <= tree.threshold[node] ? tree.left[node] : tree.right[node];
  }
  return tree.value[node];
}
