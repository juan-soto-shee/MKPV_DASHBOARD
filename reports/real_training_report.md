# Informe de entrenamiento candidato con datos reales

Fecha: 2026-07-16T19:58:51.902297+00:00
Versión candidata: `v20260716T195727256557Z`

## Calidad de datos

- Registros leídos: 1104
- Registros válidos: 1104
- Rango temporal: 2026-04-14T13:00:00+00:00 — 2026-07-15T01:00:00+00:00
- Registros por subárea: {'Pila 1': 368, 'Pila 2': 368, 'Pila 3': 368}
- Distribución por turno: {'Turno A': 828, 'Turno B': 276}

## Resultados

| Modelo | Pares | Algoritmo | MAE | RMSE | R² | Estado |
|---|---:|---|---:|---:|---:|---|
| cu_pls_12h | 549 | Gradient Boosting | 0.022531 | 0.033788 | 0.740451 | ready_for_review |
| cu_pls_24h | 1092 | Gradient Boosting | 0.025405 | 0.042655 | 0.559716 | ready_for_review |
| cu_pls_4h | 828 | Extra Trees | 0.021944 | 0.027669 | 0.829652 | ready_for_review |
| cu_pls_8h | 552 | Random Forest | 0.022841 | 0.028192 | 0.820124 | ready_for_review |
| pool_pls_24h | 1092 | Linear Regression | 2.282943 | 3.102238 | 0.382104 | ready_for_review |

### cu_pls_12h

| Algoritmo | MAE | RMSE | R² | Duración s |
|---|---:|---:|---:|---:|
| Linear Regression | 0.032756 | 0.048460 | 0.466094 | 0.037 |
| Random Forest | 0.023555 | 0.034146 | 0.734922 | 0.562 |
| Gradient Boosting | 0.022531 | 0.033788 | 0.740451 | 0.233 |
| Extra Trees | 0.021158 | 0.036504 | 0.697050 | 0.409 |
| XGBoost | 0.021706 | 0.036198 | 0.702109 | 0.175 |

### cu_pls_24h

| Algoritmo | MAE | RMSE | R² | Duración s |
|---|---:|---:|---:|---:|
| Linear Regression | 0.030619 | 0.047854 | 0.445824 | 0.040 |
| Random Forest | 0.027171 | 0.042938 | 0.553839 | 0.601 |
| Gradient Boosting | 0.025405 | 0.042655 | 0.559716 | 0.302 |
| Extra Trees | 0.026679 | 0.043971 | 0.532127 | 0.394 |
| XGBoost | 0.028366 | 0.045108 | 0.507618 | 0.220 |

### cu_pls_4h

| Algoritmo | MAE | RMSE | R² | Duración s |
|---|---:|---:|---:|---:|
| Linear Regression | 0.030238 | 0.043328 | 0.582282 | 0.072 |
| Random Forest | 0.024269 | 0.030969 | 0.786593 | 0.541 |
| Gradient Boosting | 0.025209 | 0.033611 | 0.748622 | 0.309 |
| Extra Trees | 0.021944 | 0.027669 | 0.829652 | 0.529 |
| XGBoost | 0.024147 | 0.031705 | 0.776328 | 0.302 |

### cu_pls_8h

| Algoritmo | MAE | RMSE | R² | Duración s |
|---|---:|---:|---:|---:|
| Linear Regression | 0.031920 | 0.044139 | 0.559060 | 0.055 |
| Random Forest | 0.022841 | 0.028192 | 0.820124 | 0.574 |
| Gradient Boosting | 0.023753 | 0.030507 | 0.789371 | 0.274 |
| Extra Trees | 0.023674 | 0.028978 | 0.809949 | 0.400 |
| XGBoost | 0.025933 | 0.032631 | 0.759018 | 0.204 |

### pool_pls_24h

| Algoritmo | MAE | RMSE | R² | Duración s |
|---|---:|---:|---:|---:|
| Linear Regression | 2.282943 | 3.102238 | 0.382104 | 0.038 |
| Random Forest | 2.462943 | 3.494690 | 0.215881 | 0.460 |
| Gradient Boosting | 2.382064 | 3.325873 | 0.289807 | 0.220 |
| Extra Trees | 2.600355 | 3.681574 | 0.129774 | 0.355 |
| XGBoost | 2.544913 | 3.504645 | 0.211406 | 0.188 |

## Activación

No se escribió ninguna versión activa en Firestore y no se modificaron modelos productivos.
