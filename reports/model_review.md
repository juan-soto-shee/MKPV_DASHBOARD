# Revisión final de modelos candidatos

Versión revisada: `v20260716T195727256557Z`  
Fecha: 2026-07-16  
Activación realizada: **No**

## Resumen de decisiones

| Modelo | Algoritmo ganador | MAE validación | RMSE validación | R² validación | Decisión |
|---|---|---:|---:|---:|---|
| Cu²⁺ PLS +4 h | Extra Trees | 0,021944 | 0,027669 | 0,829652 | `production_candidate` |
| Cu²⁺ PLS +8 h | Random Forest | 0,022841 | 0,028192 | 0,820124 | `production_candidate` |
| Cu²⁺ PLS +12 h | Gradient Boosting | 0,022531 | 0,033788 | 0,740451 | `production_candidate` |
| Cu²⁺ PLS +24 h | Gradient Boosting | 0,025405 | 0,042655 | 0,559716 | `experimental` |
| Nivel Piscina PLS +24 h | Linear Regression | 2,282943 | 3,102238 | 0,382104 | `rejected` |

## Cu²⁺ PLS +4 h

- Algoritmo ganador: Extra Trees.
- Entrenamiento: MAE ≈ 0; RMSE ≈ 0; R² = 1,000000.
- Validación: MAE 0,021944; RMSE 0,027669; R² 0,829652.
- Estabilidad temporal: RMSE 0,026669 / 0,027952 / 0,028358; comportamiento estable.
- Residuos: media 0,004317; desviación estándar 0,027330; sesgo positivo pequeño.
- Consistencia por subárea: RMSE entre 0,024481 y 0,031295.
- Fortaleza: buen desempeño temporal y consistente entre pilas.
- Debilidad: ajuste perfecto en entrenamiento y brecha R² de 0,170348.
- Riesgo: sobreajuste estructural propio de Extra Trees; requiere monitoreo fuera de muestra.
- Recomendación: aprobar como candidato, con seguimiento de deriva y error por pila.
- Decisión: `production_candidate`.

## Cu²⁺ PLS +8 h

- Algoritmo ganador: Random Forest.
- Entrenamiento: MAE 0,007160; RMSE 0,010080; R² 0,946189.
- Validación: MAE 0,022841; RMSE 0,028192; R² 0,820124.
- Estabilidad temporal: RMSE 0,029664 / 0,030566 / 0,023877; estable y mejora al final.
- Residuos: media 0,003890; desviación estándar 0,027922.
- Consistencia por subárea: RMSE entre 0,024901 y 0,032994.
- Fortaleza: buen R² y estabilidad temporal.
- Debilidad: brecha R² entrenamiento-validación de 0,126065.
- Riesgo: sobreajuste moderado y mayor error relativo en Pila 3.
- Recomendación: aprobar como candidato con monitoreo por subárea.
- Decisión: `production_candidate`.

## Cu²⁺ PLS +12 h

- Algoritmo ganador: Gradient Boosting.
- Entrenamiento: MAE 0,012609; RMSE 0,017052; R² 0,806838.
- Validación: MAE 0,022531; RMSE 0,033788; R² 0,740451.
- Estabilidad temporal: RMSE 0,047025 / 0,024920 / 0,024343; el primer tramo es más débil.
- Residuos: media 0,000185; desviación estándar 0,033788; sesgo prácticamente nulo.
- Consistencia por subárea: RMSE Pila 3 = 0,048381 frente a 0,026719 y 0,019244.
- Fortaleza: supera el umbral de aprobación y mantiene baja brecha R² de 0,066388.
- Debilidad: estabilidad desigual al inicio de validación y mayor error en Pila 3.
- Riesgo: sensibilidad temporal y operacional específica de Pila 3.
- Recomendación: aprobar como candidato condicionado a monitoreo inicial reforzado.
- Decisión: `production_candidate`.

## Cu²⁺ PLS +24 h

- Algoritmo ganador: Gradient Boosting.
- Entrenamiento: MAE 0,016723; RMSE 0,025505; R² 0,662179.
- Validación: MAE 0,025405; RMSE 0,042655; R² 0,559716.
- Estabilidad temporal: RMSE 0,064117 / 0,027452 / 0,024365; inestable en el primer tramo.
- Residuos: media 0,006029; desviación estándar 0,042226.
- Consistencia por subárea: Pila 3 alcanza RMSE 0,064318.
- Fortaleza: R² positivo y error decreciente en tramos recientes.
- Debilidad: capacidad explicativa moderada y brecha R² de 0,102464.
- Riesgo: variación temporal fuerte y degradación en Pila 3.
- Recomendación: conservar para evaluación adicional; no activar como modelo productivo.
- Decisión: `experimental`.

## Nivel Piscina PLS +24 h

- Algoritmo ganador: Linear Regression.
- Entrenamiento: MAE 2,065273; RMSE 3,340998; R² 0,391724.
- Validación: MAE 2,282943; RMSE 3,102238; R² 0,382104.
- Estabilidad temporal: RMSE 2,353557 / 3,441108 / 3,389865; degradación en tramos posteriores.
- Residuos: media -0,108111; desviación estándar 3,100354.
- Consistencia por subárea: RMSE entre 2,630062 y 3,452098.
- Fortaleza: brecha entrenamiento-validación baja; no muestra sobreajuste importante.
- Debilidad: capacidad predictiva insuficiente en entrenamiento y validación.
- Riesgo: error elevado y degradación temporal; no aporta confiabilidad operacional suficiente.
- Recomendación: rechazar y revisar variables/representación dinámica antes de reentrenar.
- Decisión: `rejected`.

## Estado de activación

No se escribió ningún estado en Firestore, no se modificaron versiones activas y no se alteraron los artefactos
candidatos. La plataforma dispone de tres candidatos de Cu²⁺ que cumplen el umbral cuantitativo; su activación debe
realizarse en una tarea separada, con monitoreo de deriva, residuos y error por subárea desde el primer uso.
