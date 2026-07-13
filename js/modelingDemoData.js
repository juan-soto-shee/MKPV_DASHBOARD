// Datos de muestra: reemplazar este adaptador por una API predictiva en una etapa posterior.
export const modelingDemoData = Object.freeze({
  isDemo: true,
  lastUpdated: "13 de julio de 2026, 10:30",
  currentCuPls: 1.21,
  predictedCuPls: 1.28,
  predictionHorizonHours: 4,
  confidence: 84,
  currentRecovery: 72.4,
  projectedRecovery: 74.8,
  recoveryTarget: 75.0,
  recoveryHorizonHours: 24,
  cuMae: 0.032,
  recoveryMae: 1.1,
  selectedCuModel: "Extra Trees Regressor",
  selectedRecoveryModel: "Gradient Boosting Regressor",
  labels: ["07 Jul", "08 Jul", "09 Jul", "10 Jul", "11 Jul", "12 Jul", "13 Jul"],
  cuSeries: {
    actual: [1.08, 1.12, 1.15, 1.13, 1.18, 1.19, 1.21],
    predicted: [1.10, 1.11, 1.16, 1.15, 1.17, 1.22, 1.28]
  },
  recoverySeries: {
    actual: [70.8, 71.2, 71.7, 72.0, 71.8, 72.1, 72.4],
    projected: [71.0, 71.5, 72.1, 72.6, 73.2, 74.0, 74.8]
  },
  modelMetrics: [
    { model: "Regresión Lineal", mae: "0,082", rmse: "0,112", r2: "0,78", time: "0,1 s", status: "Evaluado" },
    { model: "Random Forest Regressor", mae: "0,041", rmse: "0,056", r2: "0,94", time: "1,5 s", status: "Evaluado" },
    { model: "Gradient Boosting Regressor", mae: "0,036", rmse: "0,048", r2: "0,95", time: "2,3 s", status: "Evaluado" },
    { model: "HistGradientBoostingRegressor", mae: "0,034", rmse: "0,045", r2: "0,96", time: "1,0 s", status: "Evaluado" },
    { model: "Extra Trees Regressor", mae: "0,032", rmse: "0,042", r2: "0,97", time: "1,4 s", status: "Ganador", winner: true }
  ],
  winningModel: {
    model: "Extra Trees Regressor", version: "cu_pls_v1.0.0", trainingDate: "10 de julio de 2026",
    recordCount: "8.640", dataPeriod: "Enero–junio de 2026", variableCount: 10,
    horizon: "4 horas", mae: "0,032 g/L"
  },
  modelVariables: ["Cu²⁺ PLS actual", "Cu²⁺ PLS de periodos anteriores", "Flujo PLS", "Flujo Refino", "Acidez Refino", "Nivel Piscina PLS", "Nivel Piscina Refino", "Pila o subárea", "Hora", "Turno"]
});
