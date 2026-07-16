from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from plantview_predictive.config import settings
from plantview_predictive.modeling import (
    FEATURES, HORIZONS, build_pairs, new_version, normalize_records, train_competition,
)
from plantview_predictive.repository import FirebaseRepository

CONTEXT = {
    "implementationId": "demo_lixiviacion",
    "clienteId": "demo_lixiviacion",
    "profileId": "lixiviacion",
}
ROOT = Path(__file__).resolve().parent
REPORT_PATH = ROOT.parent / "reports" / "real_training_report.md"


def audit(records):
    normalized = normalize_records(records)
    pairs = {
        f"{target}_{horizon}h": len(build_pairs(records, target, horizon)[1])
        for target, horizons in HORIZONS.items() for horizon in horizons
    }
    return {
        "read": len(records), "valid": len(normalized), "pairs": pairs,
        "start": normalized["timestampCreacion"].min().isoformat(),
        "end": normalized["timestampCreacion"].max().isoformat(),
        "units": dict(Counter(normalized["subarea"])),
        "shifts": dict(Counter(normalized["turno"])),
    }


def train_candidates(records, audit_result):
    version = new_version()
    output = ROOT / "artifacts" / "candidates" / version
    output.mkdir(parents=True, exist_ok=False)
    results = []
    for target, horizons in HORIZONS.items():
        for horizon in horizons:
            model_id = f"{target}_{horizon}h"
            if audit_result["pairs"][model_id] < settings.minimum_pairs:
                results.append({"target": target, "horizon": horizon,
                                "validationStatus": "insufficient_data"})
                continue
            result = train_competition(records, target, horizon, settings.minimum_pairs)
            artifact_path = output / f"{model_id}.joblib"
            artifact_path.write_bytes(result.pop("artifact"))
            result.update({"modelId": model_id, "modelVersion": version,
                           "artifactPath": str(artifact_path.relative_to(ROOT)),
                           "implementationId": CONTEXT["implementationId"],
                           "clienteId": CONTEXT["clienteId"],
                           "trainedAt": datetime.now(timezone.utc).isoformat(),
                           "features": FEATURES})
            (output / f"{model_id}.json").write_text(
                json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            results.append(result)
    return version, results


def report(audit_result, version, results):
    lines = [
        "# Informe de entrenamiento candidato con datos reales", "",
        f"Fecha: {datetime.now(timezone.utc).isoformat()}",
        f"Versión candidata: `{version}`", "",
        "## Calidad de datos", "",
        f"- Registros leídos: {audit_result['read']}",
        f"- Registros válidos: {audit_result['valid']}",
        f"- Rango temporal: {audit_result['start']} — {audit_result['end']}",
        f"- Registros por subárea: {audit_result['units']}",
        f"- Distribución por turno: {audit_result['shifts']}", "",
        "## Resultados", "",
        "| Modelo | Pares | Algoritmo | MAE | RMSE | R² | Estado |",
        "|---|---:|---|---:|---:|---:|---|",
    ]
    for result in results:
        model_id = result.get("modelId", f"{result['target']}_{result['horizon']}h")
        lines.append(
            f"| {model_id} | {result.get('recordsUsed', audit_result['pairs'][model_id])} | "
            f"{result.get('winner', '--')} | {result.get('mae', float('nan')):.6f} | "
            f"{result.get('rmse', float('nan')):.6f} | {result.get('r2', float('nan')):.6f} | "
            f"{result['validationStatus']} |"
        )
    for result in results:
        model_id = result.get("modelId", f"{result['target']}_{result['horizon']}h")
        if "competition" in result:
            lines.extend(["", f"### {model_id}", "",
                          "| Algoritmo | MAE | RMSE | R² | Duración s |",
                          "|---|---:|---:|---:|---:|"])
            for name, metrics in result["competition"].items():
                lines.append(
                    f"| {name} | {metrics['mae']:.6f} | {metrics['rmse']:.6f} | "
                    f"{metrics['r2']:.6f} | {metrics['durationSeconds']:.3f} |"
                )
    lines.extend(["", "## Activación", "",
                  "No se escribió ninguna versión activa en Firestore y no se modificaron modelos productivos."])
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    repository = FirebaseRepository()
    records = repository.read_records(CONTEXT)
    audit_result = audit(records)
    version, results = train_candidates(records, audit_result)
    report(audit_result, version, results)
    print(json.dumps({"version": version, "audit": audit_result, "results": results}, ensure_ascii=False))


if __name__ == "__main__":
    main()
