# PlantView Predictive Service

Servicio FastAPI aislado para entrenamiento, versionado e inferencia de PlantView.

## Ejecución local

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\uvicorn plantview_predictive.main:app --reload
```

Firebase Admin usa Application Default Credentials. En producción, la identidad del servicio necesita lectura de
`leach_records`, lectura/escritura de metadatos de modelos y acceso al bucket configurado. El servicio nunca consulta
`simulation_records` ni `prediction_results`.

Variables admitidas: `PLANTVIEW_FIREBASE_PROJECT_ID`, `PLANTVIEW_STORAGE_BUCKET`,
`PLANTVIEW_RECORDS_COLLECTION`, `PLANTVIEW_MODELS_COLLECTION`, `PLANTVIEW_AUDITS_COLLECTION` y
`PLANTVIEW_MINIMUM_PAIRS`.

## Validación

```powershell
.\.venv\Scripts\python -m pytest
```
